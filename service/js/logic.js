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
export const DEFAULT_PREFS = { theme: 'device', accent: '#D6336C', font: 'clean', layout: 'app', effect: false, shown: '' };
export const SWATCHES = [['Pink', '#D6336C'], ['Red', '#D93025'], ['Orange', '#E8710A'], ['Yellow', '#E0B000'],
  ['Green', '#1F9D6B'], ['Teal', '#0E8A9A'], ['Blue', '#2F7DE1'], ['Purple', '#7C4DFF']];
export const FONTS = {
  clean: "-apple-system, 'SF Pro Text', system-ui, 'Segoe UI', Roboto, sans-serif",
  type: "'Courier Prime', 'Courier New', monospace",
  cursive: "'Dancing Script', 'Snell Roundhand', cursive",
  serif: "'Lora', Georgia, serif"
};
const hex3 = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (a) => '#' + a.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const mix = (h, t, k) => { const a = hex3(h), b = hex3(t); return toHex(a.map((v, i) => v * (1 - k) + b[i] * k)); };
const lum = (h) => {
  const [r, g, b] = hex3(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const isHex = (s) => /^#[0-9a-fA-F]{6}$/.test(String(s || ''));
// Colors for one accent. Text on the accent is white or near-black, whichever reads better.
export function accentVars(accent, dark) {
  const L = lum(accent);
  return {
    accent,
    accentInk: dark ? mix(accent, '#FFFFFF', 0.3) : mix(accent, '#000000', 0.22),
    onAccent: 1.05 / (L + 0.05) >= (L + 0.05) / 0.056 ? '#FFFFFF' : '#121011'
  };
}
// Clean up whatever was saved on the device.
export function sanitizePrefs(x) {
  const o = { ...DEFAULT_PREFS };
  if (x && ['device', 'light', 'dark'].includes(x.theme)) o.theme = x.theme;
  if (x && isHex(x.accent)) o.accent = x.accent;
  if (x && FONTS[x.font]) o.font = x.font;
  if (x && ['app', 'text'].includes(x.layout)) o.layout = x.layout;
  if (x && x.effect === true) o.effect = true;
  if (x && typeof x.shown === 'string') o.shown = x.shown.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 20);
  return o;
}
