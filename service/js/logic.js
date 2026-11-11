// Pure helpers. No Firebase here, so they can be tested in plain Node.

export const NAME_RE = /^[a-z0-9_]{3,20}$/;
export const PRIORITIES = [
  ['must', 'Must have'],
  ['should', 'Need this'],
  ['want', 'Want'],
  ['someday', 'Someday'],
  ['essential', 'Essential']
];

export const cleanName = (s) => String(s || '').trim().toLowerCase();
export const validName = (s) => NAME_RE.test(s);
// Name + password users get a fake email. The rules check this exact shape.
export const nameToEmail = (name) => name + '@ticker.invalid';

const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
// 20 letters/digits: the exact shape the rules want for a list id.
export function newListId(rand = (n) => crypto.getRandomValues(new Uint8Array(n))) {
  const bytes = rand(20);
  let id = '';
  for (let i = 0; i < 20; i++) id += ALNUM[bytes[i] % ALNUM.length];
  return id;
}

// Items live in a map i00..i99. Find the first free key.
export function nextItemId(items) {
  for (let n = 0; n < 100; n++) {
    const key = 'i' + String(n).padStart(2, '0');
    if (!(key in items)) return key;
  }
  return null;
}

// Group items by priority, keeping the saved order.
export function groupItems(list) {
  const groups = PRIORITIES.map(([key, title]) => ({ key, title, items: [] }));
  for (const id of list.order || []) {
    const it = list.items && list.items[id];
    if (!it) continue;
    const g = groups.find((x) => x.key === it.priority);
    if (g) g.items.push({ id, ...it });
  }
  return groups.filter((g) => g.items.length);
}

export function totalToGet(list) {
  let sum = 0, got = 0, count = 0;
  for (const id of list.order || []) {
    const it = list.items && list.items[id];
    if (!it) continue;
    count++;
    if (it.got) got++; else sum += it.price || 0;
  }
  return { count, got, sum };
}

export const baht = (n) => '฿' + Math.round(n).toLocaleString('en-US');

// Firebase error codes -> plain words.
export function friendlyError(e) {
  const c = (e && e.code) || '';
  const map = {
    'auth/email-already-in-use': 'That name is taken. Pick another.',
    'auth/invalid-credential': 'Wrong name or password.',
    'auth/wrong-password': 'Wrong name or password.',
    'auth/user-not-found': 'Wrong name or password.',
    'auth/weak-password': 'Password is too short (min 6).',
    'auth/popup-closed-by-user': 'Sign-in window was closed.',
    'auth/popup-blocked': 'The browser blocked the sign-in window. Allow pop-ups and try again.',
    'auth/unauthorized-domain': 'This web address is not allowed yet. Add it in Firebase > Authentication > Settings > Authorized domains.',
    'auth/operation-not-allowed': 'This sign-in type is switched off in Firebase.',
    'auth/network-request-failed': 'No connection. Try again.',
    'permission-denied': 'Not allowed. (Rules refused this.)'
  };
  return map[c] || ('Something went wrong' + (c ? ' (' + c + ')' : '') + '.');
}

// ---- items ----------------------------------------------------------------
export const isHttps = (u) => /^https:\/\/[^\s]+$/i.test(String(u || '').trim());
const normTagKey = (t) => String(t || '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');

// "bag, travel bag" -> ['bag','travel bag']. Max 5 tags, 30 chars each, no repeats.
export function parseTags(text) {
  const out = [], seen = {};
  for (const raw of String(text || '').split(',')) {
    const t = raw.trim().replace(/\s+/g, ' ').slice(0, 30);
    const k = normTagKey(t);
    if (!k || seen[k]) continue;
    seen[k] = true; out.push(t);
  }
  return out.slice(0, 5);
}
// One link per line, https only, max 3.
export function parseUrls(text) {
  return String(text || '').split(/\s*\n\s*/).map((s) => s.trim()).filter(isHttps).map((s) => s.slice(0, 450)).slice(0, 3);
}

// Form values -> a full item (every field the rules read must exist).
export function itemFromForm(v, prev = {}) {
  const num = (x) => { const n = Number(x); return Number.isFinite(n) && n > 0 ? n : 0; };
  return {
    name: String(v.name).trim().slice(0, 120),
    price: num(v.price),
    priceMax: num(v.priceMax),
    approx: !!v.approx,
    urls: parseUrls(v.urls),
    note: String(v.note || '').trim().slice(0, 500),
    priority: PRIORITIES.some(([k]) => k === v.priority) ? v.priority : 'want',
    tags: parseTags(v.tags),
    repeat: v.repeat ? 'item' : '',
    got: !!v.got,
    picUrl: isHttps(v.picUrl) ? String(v.picUrl).trim().slice(0, 500) : '',
    picV: prev.picV || 0
  };
}

export function checkItemInput(v) {
  const n = String(v.name || '').trim();
  if (!n) return 'Give the item a name.';
  if (n.length > 120) return 'The name is too long (max 120).';
  if (v.picUrl && !isHttps(v.picUrl)) return 'Picture link must start with https://';
  if (v.price !== '' && v.price != null && !(Number(v.price) >= 0)) return 'Price must be a number.';
  return '';
}

// Move an item up (-1) or down (+1) among the items of the same priority.
export function moveInOrder(list, id, dir) {
  const pri = list.items[id].priority;
  const same = list.order.filter((x) => list.items[x] && list.items[x].priority === pri);
  const i = same.indexOf(id), j = i + dir;
  if (i < 0 || j < 0 || j >= same.length) return null;
  const order = list.order.slice();
  const a = order.indexOf(id), b = order.indexOf(same[j]);
  [order[a], order[b]] = [order[b], order[a]];
  return order;
}

// Old site item -> new item. A tag-level "repeat" becomes a repeatable tag (repTagsAdd).
export function mapOldItem(old, baseUrl) {
  const num = (x) => { const n = Number(x); return Number.isFinite(n) && n > 0 ? n : 0; };
  const tags = parseTags((old.tags || []).join(','));
  let picUrl = '';
  const first = (old.imgs || [])[0];
  if (first && baseUrl) { try { picUrl = new URL(String(first).split('?')[0], baseUrl).href.slice(0, 500); } catch (e) { /* skip */ } }
  return {
    item: {
      name: String(old.name || 'Untitled').trim().slice(0, 120),
      price: num(old.price), priceMax: num(old.priceMax), approx: !!old.approx,
      urls: parseUrls((old.urls || []).join('\n')), note: String(old.note || '').slice(0, 500),
      priority: PRIORITIES.some(([k]) => k === old.priority) ? old.priority : 'want',
      tags, repeat: old.repeat === 'item' ? 'item' : '', got: !!old.got,
      picUrl: isHttps(picUrl) ? picUrl : '', picV: 0
    },
    repTagsAdd: old.repeat === 'tag' ? tags.map(normTagKey) : []
  };
}

// ---- appearance (device-only preferences) ------------------------------------
// 8 curated color themes: main color + small touch + extra. Contrast checked (text 4.5:1, marks 3:1) in light and dark.
export const THEMES = {
  Rose: {light: {accent: '#D6336C', accentInk: '#BF2958', onAccent: '#FFFFFF', soft: '#F7E0E5', touch: '#AF7D2B', touchSoft: '#F2E9DE', extra: '#8C49A2', extraSoft: '#EFDCF0'}, dark: {accent: '#EE6A96', accentInk: '#EE6A96', onAccent: '#1A1416', soft: '#3E222C', touch: '#E0B060', touchSoft: '#3B3021', extra: '#B969D3', extraSoft: '#301736'}},
  Clay: {light: {accent: '#BF5630', accentInk: '#AB4C2A', onAccent: '#FFFFFF', soft: '#F4E5DE', touch: '#2E8C86', touchSoft: '#E2EBE9', extra: '#7B6737', extraSoft: '#F4EBDB'}, dark: {accent: '#E58A66', accentInk: '#E58A66', onAccent: '#1A1416', soft: '#3C2822', touch: '#63BDB4', touchSoft: '#223332', extra: '#C69C39', extraSoft: '#372C18'}},
  Honey: {light: {accent: '#A8650F', accentInk: '#945B0F', onAccent: '#FFFFFF', soft: '#F1E6DA', touch: '#6F8234', touchSoft: '#EAEADF', extra: '#3F6C8D', extraSoft: '#DFE9F0'}, dark: {accent: '#E0A44C', accentInk: '#E0A44C', onAccent: '#1A1416', soft: '#3B2E1D', touch: '#A9BB6A', touchSoft: '#303223', extra: '#4994CA', extraSoft: '#192936'}},
  Moss: {light: {accent: '#4C7A3C', accentInk: '#487238', onAccent: '#FFFFFF', soft: '#E6E9E0', touch: '#BF6540', touchSoft: '#F4E6E0', extra: '#7B6A37', extraSoft: '#F4EDDB'}, dark: {accent: '#8DBB78', accentInk: '#8DBB78', onAccent: '#1A1416', soft: '#2B3226', touch: '#E39A78', touchSoft: '#3C2C26', extra: '#C6A339', extraSoft: '#372E18'}},
  Teal: {light: {accent: '#0E7C78', accentInk: '#0E7470', onAccent: '#FFFFFF', soft: '#DFE9E7', touch: '#D9614B', touchSoft: '#F7E6E1', extra: '#824CA9', extraSoft: '#EBDCF0'}, dark: {accent: '#4FBDB6', accentInk: '#4FBDB6', onAccent: '#1A1416', soft: '#1E3332', touch: '#F09482', touchSoft: '#3E2A28', extra: '#A96DD5', extraSoft: '#2A1736'}},
  Ocean: {light: {accent: '#2F66C2', accentInk: '#2E64BE', onAccent: '#FFFFFF', soft: '#E3E6F0', touch: '#C7702F', touchSoft: '#F5E8DE', extra: '#34745F', extraSoft: '#DFF2E9'}, dark: {accent: '#7CA6F0', accentInk: '#7CA6F0', onAccent: '#1A1416', soft: '#272E3E', touch: '#EBA468', touchSoft: '#3D2E22', extra: '#39C697', extraSoft: '#19362C'}},
  Plum: {light: {accent: '#8246B3', accentInk: '#8246B3', onAccent: '#FFFFFF', soft: '#ECE3EE', touch: '#AB801C', touchSoft: '#F1EADC', extra: '#9E4773', extraSoft: '#F4DCE5'}, dark: {accent: '#B98BE3', accentInk: '#B98BE3', onAccent: '#1A1416', soft: '#33293B', touch: '#DDB85A', touchSoft: '#3B3220', extra: '#D2659C', extraSoft: '#371727'}},
  Ink: {light: {accent: '#3B3437', accentInk: '#3B3437', onAccent: '#FFFFFF', soft: '#E4E0DF', touch: '#D6336C', touchSoft: '#F7E0E5', extra: '#446797', extraSoft: '#DFE5F0'}, dark: {accent: '#E8E1DF', accentInk: '#E8E1DF', onAccent: '#1A1416', soft: '#3D3A3A', touch: '#EE6A96', touchSoft: '#3E222C', extra: '#5D8DD0', extraSoft: '#192436'}}
};
export const THEME_NAMES = Object.keys(THEMES);
export const themeVars = (name, dark) => (THEMES[name] || THEMES.Rose)[dark ? 'dark' : 'light'];
export const DEFAULT_PREFS = { theme: 'device', scheme: 'Rose', font: 'clean', layout: 'app', effect: false, shown: '' };
export const FONTS = {
  clean: "-apple-system, 'SF Pro Text', system-ui, 'Segoe UI', Roboto, sans-serif",
  type: "'Courier Prime', 'Courier New', monospace",
  cursive: "'Dancing Script', 'Snell Roundhand', cursive",
  serif: "'Lora', Georgia, serif"
};
// Clean up whatever was saved on the device.
export function sanitizePrefs(x) {
  const o = { ...DEFAULT_PREFS };
  if (x && ['device', 'light', 'dark'].includes(x.theme)) o.theme = x.theme;
  if (x && THEMES[x.scheme]) o.scheme = x.scheme;
  if (x && FONTS[x.font]) o.font = x.font;
  if (x && ['app', 'text'].includes(x.layout)) o.layout = x.layout;
  if (x && x.effect === true) o.effect = true;
  if (x && typeof x.shown === 'string') o.shown = x.shown.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 20);
  return o;
}
