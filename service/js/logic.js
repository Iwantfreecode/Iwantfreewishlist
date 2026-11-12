// Pure helpers. No Firebase here, so they can be tested in plain Node.

const NAME_RE = /^[a-z0-9_]{3,20}$/;
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
// One link per line, https only, cut to 450 characters each. One shared parser; the two lists differ only in the limit.
function parseLinks(text, max) {
  return String(text || '').split(/\s*\n\s*/).map((s) => s.trim()).filter(isHttps).map((s) => s.slice(0, 450)).slice(0, max);
}
export const parseUrls = (text) => parseLinks(text, 3);                  // shop links, max 3

// Picture links: max 8 (they cost no storage; the pictures stay on the other site).
const MAX_PIC_LINKS = 8;
export const parsePicUrls = (text) => parseLinks(text, MAX_PIC_LINKS);
// Every picture of an item, in show order: up to 2 uploaded ones (slot 0, 1), then the links.
// Old items kept one link in picUrl; it still counts when picUrls is empty.
export function itemPics(it) {
  const out = [];
  if (it.picV) out.push({ slot: 0, v: it.picV });
  if (it.picV1) out.push({ slot: 1, v: it.picV1 });
  const links = Array.isArray(it.picUrls) && it.picUrls.length ? it.picUrls : (it.picUrl ? [it.picUrl] : []);
  links.filter(isHttps).forEach((url) => out.push({ url }));
  return out;
}
export const picLinksOf = (it) => (Array.isArray(it.picUrls) && it.picUrls.length ? it.picUrls : (it.picUrl ? [it.picUrl] : [])).filter(isHttps);

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
    picUrl: '',                                   // old single link; new saves use picUrls
    picUrls: parsePicUrls(v.picUrls),
    picV: prev.picV || 0,
    picV1: prev.picV1 || 0
  };
}

export function checkItemInput(v) {
  const n = String(v.name || '').trim();
  if (!n) return 'Give the item a name.';
  if (n.length > 120) return 'The name is too long (max 120).';
  const badLine = String(v.picUrls || '').split(/\n/).map((x) => x.trim()).find((x) => x && !isHttps(x));
  if (badLine) return 'Every picture link must start with https://';
  if (String(v.picUrls || '').split(/\n/).filter((x) => x.trim()).length > MAX_PIC_LINKS) return 'Max ' + MAX_PIC_LINKS + ' picture links.';
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
  const picUrls = [];
  if (baseUrl) for (const img of (old.imgs || []).slice(0, MAX_PIC_LINKS)) {
    try { const u = new URL(String(img).split('?')[0], baseUrl).href.slice(0, 450); if (isHttps(u)) picUrls.push(u); } catch (e) { /* skip */ }
  }
  return {
    item: {
      name: String(old.name || 'Untitled').trim().slice(0, 120),
      price: num(old.price), priceMax: num(old.priceMax), approx: !!old.approx,
      urls: parseUrls((old.urls || []).join('\n')), note: String(old.note || '').slice(0, 500),
      priority: PRIORITIES.some(([k]) => k === old.priority) ? old.priority : 'want',
      tags, repeat: old.repeat === 'item' ? 'item' : '', got: !!old.got,
      picUrl: '', picUrls, picV: 0, picV1: 0
    },
    repTagsAdd: old.repeat === 'tag' ? tags.map(normTagKey) : []
  };
}

// ---- appearance (device-only preferences) ------------------------------------
// 8 curated color themes: main color + small touch + extra. Contrast checked (text 4.5:1, marks 3:1) in light and dark.
const THEMES = {
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
export const DEFAULT_PREFS = { theme: 'device', scheme: 'Rose', font: 'clean', layout: 'app', size: 'medium', effect: false, shown: '' };
export const TEXT_SIZES = [['small', 'Small', 14], ['medium', 'Medium', 17], ['large', 'Large', 20], ['xl', 'Super large', 24]];   // [key, label, preview px]
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
  if (x && TEXT_SIZES.some(([k]) => k === x.size)) o.size = x.size;
  if (x && x.effect === true) o.effect = true;
  if (x && typeof x.shown === 'string') o.shown = x.shown.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 20);
  return o;
}

// ---- import from pasted text, Notes, Sheets or a CSV file -----------------------------
// parseImport(text) -> rows in the same shape as the old wishlist items (mapOldItem turns them into real items).
export const IMPORT_MAX = 100;
const BULLET = /^\s*(?:[-*•·▪◦]|\d+[.)]|\[[ xX]?\])\s*/;
const CUR = /(?:฿|thb|baht|bath|บาท)/i;
const NUM = '(\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?';
const RANGE = new RegExp('(?:(around|about|approx\\.?|~)\\s*)?' + CUR.source + '?\\s*' + NUM + '(?:\\s*(?:-|–|to)\\s*' + CUR.source + '?\\s*' + NUM + ')?\\s*' + CUR.source + '?', 'i');
const toNum = (s) => Number(String(s || '').replace(/,/g, '')) || 0;

// Finds a price in free text. A number counts only with a currency mark, or as the last thing on the line (3+ digits, no leading zero).
function pullPrice(s) {
  const hasCur = (m) => CUR.test(m[0]);
  const all = [...s.matchAll(new RegExp(RANGE.source, 'gi'))];
  let pick = all.find(hasCur);
  if (!pick) {
    const last = all[all.length - 1];
    if (last && s.slice(last.index + last[0].length).trim() === '' && !/^0/.test(last[2]) && toNum(last[2]) >= 100) pick = last;
  }
  if (!pick) return { price: 0, priceMax: 0, approx: false, rest: s };
  const a = toNum(pick[2]), b = toNum(pick[3]);
  return { price: a, priceMax: b > a ? b : 0, approx: !!pick[1], rest: (s.slice(0, pick.index) + ' ' + s.slice(pick.index + pick[0].length)) };
}

function splitCsv(text, sep) {                       // quotes allowed, "" is a quote inside quotes
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"' && cell === '') q = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  row.push(cell); rows.push(row);
  return rows.filter((r) => r.some((x) => x.trim()));
}

const HEAD = {
  name: ['name', 'item', 'title', 'product'], price: ['price', 'cost', 'budget'], priceMax: ['max', 'price max', 'max price'],
  note: ['note', 'notes', 'detail', 'details', 'description', 'comment', 'comments'], url: ['link', 'links', 'url', 'urls', 'shop', 'store'],
  pic: ['picture', 'pictures', 'image', 'images', 'img', 'photo'], priority: ['priority'], tags: ['tag', 'tags', 'category', 'type']
};
const priorityOf = (s) => {
  const t = String(s || '').trim().toLowerCase();
  const hit = PRIORITIES.find(([k, l]) => k === t || l.toLowerCase() === t);
  return hit ? hit[0] : t === 'need' ? 'should' : 'want';
};

function rowFromCells(cells, map) {
  const get = (k) => (map[k] >= 0 ? String(cells[map[k]] || '').trim() : '');
  const links = (s) => String(s).split(/[\s,]+/).filter(isHttps);
  let p = pullPrice(get('price'));
  const out = { name: get('name').slice(0, 120), price: p.price, priceMax: p.priceMax, approx: p.approx, urls: links(get('url')), note: get('note').slice(0, 500),
    priority: priorityOf(get('priority')), tags: get('tags') ? get('tags').split(/[,;|]/).map((x) => x.trim()).filter(Boolean) : [], imgs: links(get('pic')) };
  const mx = toNum(get('priceMax')); if (mx > out.price) out.priceMax = mx;
  if (!out.price && get('price')) { const n = toNum(get('price').replace(CUR, '')); if (n) out.price = n; }
  return out;
}

export function parseImport(text) {
  const src = String(text || '').replace(/^﻿/, '');
  if (!src.trim()) return [];
  const lines = src.split(/\r?\n/).filter((l) => l.trim());
  let grid = null;
  if (lines.some((l) => l.includes('\t'))) grid = splitCsv(src, '\t');
  else {
    const first = lines[0].toLowerCase();
    for (const sep of [',', ';']) {
      const cells = first.split(sep).map((x) => x.trim().replace(/^"|"$/g, ''));
      if (cells.length > 1 && cells.some((c) => HEAD.name.includes(c))) { grid = splitCsv(src, sep); break; }
    }
  }
  let rows = [];
  if (grid) {
    const head = grid[0].map((c) => c.trim().toLowerCase());
    const find = (k) => head.findIndex((c) => HEAD[k].includes(c));
    const map = {}; for (const k of Object.keys(HEAD)) map[k] = find(k);
    if (map.name >= 0) rows = grid.slice(1).map((c) => rowFromCells(c, map));
    else rows = grid.map((c) => {                          // no header: first cell = name, then guess from what each cell looks like
      const o = { name: String(c[0] || '').trim().slice(0, 120), price: 0, priceMax: 0, approx: false, urls: [], note: '', priority: 'want', tags: [], imgs: [] };
      for (const x of c.slice(1).map((y) => String(y).trim()).filter(Boolean)) {
        if (isHttps(x)) o.urls.push(x);
        else if (!o.price && /^(?:฿|thb)?\s*[\d,]+(?:\.\d+)?\s*(?:฿|baht|thb)?$/i.test(x)) o.price = toNum(x.replace(CUR, ''));
        else o.note = (o.note ? o.note + ' ' : '') + x;
      }
      return o;
    });
  } else {                                                  // one item per line (Notes, chat, anything typed)
    rows = lines.map((raw) => {
      const mark = raw.match(/^\s*\[([xX])\]/);
      let s = raw.replace(BULLET, '').trim();
      const urls = s.match(/https:\/\/\S+/g) || [];
      s = s.replace(/https:\/\/\S+/g, ' ');
      const p = pullPrice(s);
      const name = p.rest.replace(/\s+/g, ' ').replace(/[\s\-–:|,@(]+$/, '').replace(/^[\s\-–:|,@)]+/, '').trim();
      return { name: name.slice(0, 120), price: p.price, priceMax: p.priceMax, approx: p.approx, urls, note: '', priority: 'want', tags: [], imgs: [], got: !!mark };
    });
  }
  return rows.filter((r) => r.name).slice(0, IMPORT_MAX).map((r) => ({ ...r, urls: r.urls.slice(0, 3) }));
}
