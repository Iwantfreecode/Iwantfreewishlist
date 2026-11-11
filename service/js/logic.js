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
