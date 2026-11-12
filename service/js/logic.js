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

// ---- money -----------------------------------------------------------------------
// Currencies the free rate source (ECB data) knows. The owner picks one for the list; prices are typed in it.
export const CURRENCIES = { THB: '฿', USD: '$', EUR: '€', GBP: '£', JPY: '¥', CNY: 'CN¥', SGD: 'S$', MYR: 'RM', IDR: 'Rp', PHP: '₱', INR: '₹', KRW: '₩',
  AUD: 'A$', CAD: 'C$', HKD: 'HK$', CHF: 'CHF ', NZD: 'NZ$' };
export const money = (n, code = 'THB') => (CURRENCIES[code] || code + ' ') + Math.round(n).toLocaleString('en-US');
// Round down / up to 2 significant digits (63.2 -> 63, 1234 -> 1,200). Only for guesses, so rough is right.
const sig2 = (v, up) => { if (!(v > 0)) return 0; const step = Math.pow(10, Math.max(0, Math.floor(Math.log10(v)) - 1)); return (up ? Math.ceil : Math.floor)(v / step - 1e-9) * step; };
export const RATE_BAND = 0.05;      // a converted price is shown as a range of plus or minus 5 percent
// "$63–$70" for 2400 THB at rate 0.0277. The range is a guess: the real shop price and the real rate will differ.
export function convertedRange(price, priceMax, rate, to) {
  const lo = sig2(price * rate * (1 - RATE_BAND), false), hi = sig2((priceMax > price ? priceMax : price) * rate * (1 + RATE_BAND), true);
  return lo >= hi ? money(hi, to) : money(lo, to) + '–' + money(hi, to);
}

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
    'auth/unauthorized-domain': 'This website cannot sign people in yet. Please tell the site owner.',
    'auth/operation-not-allowed': 'This way of signing in is turned off right now. Please try another way.',
    'auth/network-request-failed': 'No connection. Try again.',
    'permission-denied': 'You do not have permission to do that.'
  };
  return map[c] || 'Something went wrong. Please try again.';
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
  if (badLine) return 'Each picture link must be a secure web address (it starts with https).';
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
// Free text is messy, so this only guesses what is clear. The preview screen lets the person fix the rest.
export const IMPORT_MAX = 100;
const CHECK_ON = '☑✅✔✓☒', CHECK_OFF = '☐⬜⬛🔲□▢';
const BULLET = new RegExp('^\\s*(?:[-*•·▪◦‣▸►→+]|\\d+[.)]|[' + CHECK_ON + CHECK_OFF + ']|\\[[ xX]?\\])\\s*');
const THB = '(?:฿|thb|baht|bath|บาท)', FOREIGN = '(?:us\\$|\\$|usd|eur|€|£|¥|jpy|yen)';
const NUMB = '(?:\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d{1,3}(?:\\.\\d{3})+|\\d+(?:\\.\\d+)?)';
const PRICE_RE = new RegExp('(?<lab>(?:price|cost|budget|ราคา|งบ)\\s*[:=]?\\s*)?(?<ap>(?:around|about|approx\\.?|abt|~|≈)\\s*)?(?<c1>' + THB + '|' + FOREIGN + ')?\\s*(?<a>' + NUMB + ')(?<ka>\\s?k(?![a-z0-9]))?'
  + '(?:\\s*(?:-|–|to)\\s*(?<c2>' + THB + '|' + FOREIGN + ')?\\s*(?<b>' + NUMB + ')(?<kb>\\s?k(?![a-z0-9]))?)?\\s*(?<c3>' + THB + '|' + FOREIGN + ')?(?:\\s*(?:each|ea\\.?|/\\s?[a-z]+|x\\s?\\d+))?', 'gi');
const numVal = (raw, k) => {
  if (!raw) return 0;
  let n;
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(raw)) n = parseFloat(raw.replace(/,/g, ''));        // 1,200 or 1,200.50
  else if (/^\d{1,3}(\.\d{3})+$/.test(raw)) n = Number(raw.replace(/\./g, ''));                // 15.000
  else n = parseFloat(raw);
  n = Math.round((Number.isFinite(n) ? n : 0) * (k ? 1000 : 1));
  return n > 1e9 ? 0 : n;
};
const toNum = (s) => numVal(String(s || '').replace(/\s/g, '').replace(new RegExp(THB, 'ig'), ''), false);
const isThb = (c) => !!c && new RegExp('^' + THB + '$', 'i').test(c);

// Finds a price in free text. A number counts when it has a baht mark or a "price" label, or when it ends the line (100+, no leading zero, "2k" ok).
// Dollars and other money are not turned into baht: they go to `extra` so the person can decide.
function pullPrice(input) {
  const s = String(input);
  let pick = null;
  for (const m of s.matchAll(PRICE_RE)) {
    const g = m.groups, thb = isThb(g.c1) || isThb(g.c2) || isThb(g.c3), foreign = !thb && !!(g.c1 || g.c2 || g.c3), lab = !!g.lab;
    const atEnd = s.slice(m.index + m[0].length).trim() === '';
    const lead = m[0].length - m[0].trimStart().length, at = m.index + lead;
    const okBefore = at === 0 || lead > 0 || /[\s:|,(\-–]/.test(s[at - 1]);
    let ok = thb || foreign || lab;
    const small = g.b && numVal(g.a, g.ka) < 100 && !g.c1 && !g.ka;          // "Pro 2 - 8,900": judge the second number
    const rawN = small ? g.b : g.a, kN = small ? g.kb : g.ka;
    if (!ok && atEnd && (okBefore || small) && !/^0/.test(rawN)) ok = numVal(rawN, kN) >= 100 || !!kN;
    if (ok) pick = m;
  }
  if (!pick) return { price: 0, priceMax: 0, approx: false, rest: s, extra: '' };
  const g = pick.groups;
  let start = pick.index, a = numVal(g.a, g.ka), b = numVal(g.b, g.kb);
  const curA = !!g.c1;
  if (b && a < 100 && !curA && !g.ka) { start = pick.index + pick[0].lastIndexOf(g.b); a = b; b = 0; }   // "Pro 2 - 8,900฿": the 2 is part of the name
  const rest = s.slice(0, start) + ' ' + s.slice(pick.index + pick[0].length);
  const foreign = !(isThb(g.c1) || isThb(g.c2) || isThb(g.c3)) && !!(g.c1 || g.c2 || g.c3);
  if (foreign) return { price: 0, priceMax: 0, approx: false, rest, extra: pick[0].replace(/^(?:price|cost|budget)\s*[:=]?\s*/i, '').trim() };
  return { price: a, priceMax: b > a ? b : 0, approx: !!g.ap, rest, extra: '' };
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
  name: ['name', 'item', 'items', 'title', 'product', 'what'], price: ['price', 'cost', 'budget', 'ราคา'], priceMax: ['max', 'price max', 'max price'],
  note: ['note', 'notes', 'detail', 'details', 'description', 'comment', 'comments', 'remark'],
  url: ['link', 'links', 'url', 'urls', 'shop', 'store', 'where', 'where to buy', 'buy link', 'shop link', 'website', 'site'],
  pic: ['picture', 'pictures', 'image', 'images', 'img', 'photo', 'photos', 'pic'], priority: ['priority', 'importance'], tags: ['tag', 'tags', 'category', 'type']
};
const normHead = (c) => String(c || '').toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9ก-๙ ]/g, ' ').replace(/\s+/g, ' ').trim();
const PRIO_WORDS = { high: 'must', urgent: 'must', top: 'must', medium: 'should', mid: 'should', normal: 'want', low: 'someday', 'nice to have': 'someday', later: 'someday', maybe: 'someday' };
const priorityOf = (s) => {
  const t = String(s || '').trim().toLowerCase();
  const hit = PRIORITIES.find(([k, l]) => k === t || l.toLowerCase() === t);
  return hit ? hit[0] : t === 'need' ? 'should' : PRIO_WORDS[t] || 'want';
};
const IMG = /\.(?:jpe?g|png|webp|gif|avif)(?:[?#]|$)/i;
const emptyRow = () => ({ name: '', price: 0, priceMax: 0, approx: false, urls: [], note: '', priority: 'want', tags: [], imgs: [], got: false });
const addNote = (o, t) => { t = String(t || '').trim(); if (t) o.note = (o.note ? o.note + ' · ' : '') + t; };
const addLinks = (o, list) => list.forEach((u) => (IMG.test(u) && !o.imgs.length ? o.imgs.push(u) : o.urls.push(u)));

function rowFromCells(cells, map, heads) {
  const get = (k) => (map[k] >= 0 ? String(cells[map[k]] || '').trim() : '');
  const links = (x) => String(x).split(/[\s,]+/).filter(isHttps);
  const o = emptyRow(); o.name = get('name').slice(0, 120);
  const pr = pullPrice(get('price')); o.price = pr.price; o.priceMax = pr.priceMax; o.approx = pr.approx; addNote(o, pr.extra);
  if (!o.price && !pr.extra && get('price')) o.price = toNum(get('price'));
  const mx = toNum(get('priceMax')); if (mx > o.price) o.priceMax = mx;
  addNote(o, get('note')); o.urls = links(get('url')); o.imgs = links(get('pic'));
  o.priority = priorityOf(get('priority')); o.tags = get('tags') ? get('tags').split(/[,;|]/).map((x) => x.trim()).filter(Boolean) : [];
  const used = new Set(Object.values(map));                    // columns we do not know become notes: "Size: M"
  cells.forEach((c, i) => { if (!used.has(i) && String(c).trim()) addNote(o, (heads[i] ? heads[i] + ': ' : '') + String(c).trim()); });
  return o;
}

// One typed line (Notes, chat, markdown) -> one row.
function rowFromLine(raw, tag) {
  const o = emptyRow();
  const m0 = raw.match(new RegExp('^\\s*(?:\\[([xX])\\]|([' + CHECK_ON + ']))'));
  o.got = !!m0;
  let s = raw.replace(BULLET, '').trim()
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '$1 $2')          // markdown link -> name + link
    .replace(/(\*\*|__|`)/g, '').replace(/^#+\s*/, '');
  const labelled = /^(?:name|item|product)\s*[:=]/i.test(s) && /[|;]/.test(s);
  if (labelled) {                                                       // Name: Shirt | Price: 1,200 | Size M
    for (const part of s.split(/\s*[|;]\s*/)) {
      const kv = part.match(/^([^:=]{1,20})\s*[:=]\s*(.*)$/); const key = kv ? normHead(kv[1]) : '', val = kv ? kv[2].trim() : part.trim();
      const kind = Object.keys(HEAD).find((k) => HEAD[k].includes(key));
      if (kind === 'name') o.name = val; else if (kind === 'price') { const p = pullPrice(val); o.price = p.price || toNum(val); o.priceMax = p.priceMax; o.approx = p.approx; addNote(o, p.extra); }
      else if (kind === 'url') addLinks(o, val.split(/\s+/).filter(isHttps)); else if (kind === 'note') addNote(o, val);
      else if (kind === 'priority') o.priority = priorityOf(val); else if (kind === 'tags') o.tags = val.split(/[,;]/).map((x) => x.trim()).filter(Boolean);
      else addNote(o, part.trim());
    }
    o.name = o.name.slice(0, 120); if (tag) o.tags.push(tag); return o;
  }
  s = s.replace(/^(?:name|item|product)\s*[:=]\s*/i, '');
  addLinks(o, (s.match(/https:\/\/[^\s)>\]]+/g) || []));
  for (const u of (s.match(/http:\/\/[^\s)>\]]+/g) || [])) addNote(o, 'link (http, not added): ' + u);
  s = s.replace(/https?:\/\/[^\s)>\]]+/g, ' ');
  const p = pullPrice(s); o.price = p.price; o.priceMax = p.priceMax; o.approx = p.approx; addNote(o, p.extra);
  let name = p.rest.replace(/\(\s*\)/g, ' ').replace(/\s+/g, ' ').replace(/[\s\-–—:|,@(/]+$/, '').replace(/^[\s\-–—:|,@)]+/, '').trim();
  const par = name.match(/^(.*\S)\s*\(([^()]{1,100})\)$/);                 // "Keyboard (Keychron K2)" -> note
  if (par) { name = par[1].trim(); addNote(o, par[2]); }
  else { const d = name.match(/^(.{2,}?)\s+[-–—]\s+(.+)$/); if (d) { name = d[1].trim(); addNote(o, d[2]); } }     // "Tripod - carbon fiber" -> note
  o.name = name.slice(0, 120); if (tag) o.tags.push(tag);
  return o;
}

export function parseImport(text) {
  const src = String(text || '').replace(/^﻿/, '');
  if (!src.trim()) return [];
  const lines = src.split(/\r?\n/).filter((l) => /[\p{L}\p{N}]/u.test(l));
  if (!lines.length) return [];
  let grid = null;
  if (lines.some((l) => l.includes('\t'))) grid = splitCsv(src, '\t');
  else {
    const first = normHead(lines[0]);
    for (const sep of [',', ';']) {
      const cells = lines[0].split(sep).map((x) => normHead(x.replace(/^"|"$/g, '')));
      if (cells.length > 1 && cells.some((c) => HEAD.name.includes(c))) { grid = splitCsv(src, sep); break; }
    }
    void first;
  }
  let rows = [];
  if (grid) {
    const heads = grid[0].map((c) => String(c).trim());
    const norm = heads.map(normHead);
    const map = {}; for (const k of Object.keys(HEAD)) map[k] = norm.findIndex((c) => HEAD[k].includes(c));
    if (map.name >= 0) rows = grid.slice(1).map((c) => rowFromCells(c, map, heads));
    else rows = grid.map((c) => {                          // no header: first cell = name, then guess from what each cell looks like
      const o = emptyRow(); o.name = String(c[0] || '').trim().slice(0, 120);
      for (const x of c.slice(1).map((y) => String(y).trim()).filter(Boolean)) {
        if (isHttps(x)) addLinks(o, [x]);
        else if (!o.price && /^(?:฿|thb)?\s*[\d,]+(?:\.\d+)?\s*(?:฿|baht|thb)?$/i.test(x)) o.price = toNum(x);
        else addNote(o, x);
      }
      return o;
    });
  } else if (lines.length === 1 && (lines[0].match(/,/g) || []).length >= 2 && !/\d/.test(lines[0]) && !/https?:/.test(lines[0])) {
    rows = lines[0].split(',').map((x) => ({ ...emptyRow(), name: x.trim().slice(0, 120) }));        // "socks, shirt, hat"
  } else {                                                  // one item per line, headings become tags
    const listy = (l) => BULLET.test(l) || /^\s{2,}\S/.test(l) || /^\t/.test(l);
    const useHeads = lines.filter(listy).length >= lines.length / 2;
    let tag = '';
    for (const l of lines) {
      const colon = /[:：]\s*$/.test(l), shout = !/\p{Ll}/u.test(l) && /\p{Lu}/u.test(l);       // "TECH:" or "WISHLIST 2026" = heading, not an item
      if (useHeads && !listy(l) && (colon || shout)) { tag = colon ? l.replace(/[:：]\s*$/, '').trim().toLowerCase().slice(0, 30) : ''; continue; }
      rows.push(rowFromLine(l, tag));
    }
  }
  return rows.filter((r) => r.name).slice(0, IMPORT_MAX).map((r) => ({ ...r, urls: r.urls.slice(0, 3), tags: r.tags.slice(0, 5) }));
}
