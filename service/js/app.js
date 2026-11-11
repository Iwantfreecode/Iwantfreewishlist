// wishlist service (stage 3): lists, items, tags, ticks + surprise mode, pictures, account delete, import.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {
  getAuth, connectAuthEmulator, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, reauthenticateWithPopup,
  EmailAuthProvider, reauthenticateWithCredential, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, deleteUser
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import { getFirestore, connectFirestoreEmulator } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import { firebaseConfig } from './config.js';
import {
  PRIORITIES, cleanName, validName, nameToEmail, nextItemId, itemFromForm, checkItemInput,
  groupItems, totalToGet, baht, friendlyError, moveInOrder, isHttps
} from './logic.js';
import { logicTags, tagHits, bigHits, allTags, normTag } from './tags.js';
import { makeData } from './data.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
// Testing only: on localhost with ?emu=1 talk to the local emulators, never the real project.
if (location.hostname === 'localhost' && new URLSearchParams(location.search).has('emu')) {
  connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, 'localhost', 8080);
}
const D = makeData(db);

// ---- state ------------------------------------------------------------------
// screen: loading | welcome | pickname | home | list      panel: list | edit | tags | account
const S = {
  screen: 'loading', panel: 'list', user: null, profile: null,
  list: null, listId: null, ticks: [], msg: '', error: false, busy: false,
  mode: 'signin', tab: 'all', reorder: false, editId: null, warn: null, pics: {}, showAuth: false, copied: false
};
const params = new URLSearchParams(location.search);
const sharedId = params.get('l');
const isOwner = () => !!(S.user && S.list && S.list.ownerUid === S.user.uid);
const isGoogle = () => !!(S.user && S.user.providerData.some((p) => p.providerId === 'google.com'));
const surpriseKey = () => 'sv_surprise_' + S.listId;
// Real state wins: if my ticks sit in the surprise doc, surprise is on. Only when I have none, use the saved choice.
const surpriseOn = () => {
  if (myTicks(true).length) return true;
  if (myTicks(false).length) return false;
  try { return localStorage.getItem(surpriseKey()) === '1'; } catch (e) { return false; }
};

// ---- tiny DOM helper: text only, never innerHTML (names come from other people) ----
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
    else if (v === true) el.setAttribute(k, '');
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid);
  return el;
}
const say = (msg, error = false) => { S.msg = msg; S.error = error; render(); };
const go = (panel) => { S.panel = panel; S.msg = ''; render(); window.scrollTo(0, 0); };

// ---- derived data ---------------------------------------------------------------
const itemsArr = () => S.list.order.filter((id) => S.list.items[id]).map((id) => ({ id, ...S.list.items[id] }));
const ctx = () => ({ items: itemsArr(), repTags: S.list.repTags || [], joints: S.list.joints || [] });
// Who ticked what. The owner only gets open ticks (the rules hide surprise ones).
function claims() {
  const c = {};
  for (const t of S.ticks) for (const id of t.items || []) {
    if (!c[id]) c[id] = { by: t.uid, name: t.name, all: [] };
    c[id].all.push(t.uid);
  }
  return c;
}
const myTicks = (surprise) => {
  const t = S.ticks.find((x) => S.user && x.uid === S.user.uid && !!x.surprise === surprise);
  return t ? t.items.slice() : [];
};

// ---- loading ------------------------------------------------------------------
async function openList(id) {
  S.list = await D.getList(id); S.listId = S.list ? id : null; S.ticks = [];
  if (S.list && S.user && S.profile) { try { S.ticks = await D.loadTicks(id, isOwner()); } catch (e) { S.msg = friendlyError(e); S.error = true; } }
}
// Decide which screen to show. The newest call wins, so a slow older one cannot overwrite it.
let routeSeq = 0;
async function route(user) {
  const mine = ++routeSeq;
  const next = { user, profile: null, screen: 'loading', msg: '', error: false };
  try {
    if (user) next.profile = await D.getProfile(user.uid);
    if (mine !== routeSeq) return;
    S.user = user; S.profile = next.profile; S.panel = 'list'; S.reorder = false; S.warn = null; S.showAuth = false;
    if (!user && !sharedId) { S.list = null; S.listId = null; S.ticks = []; }
    if (!user) S.mode = 'signin';
    if (sharedId) { await openList(sharedId); S.screen = user && !S.profile ? 'pickname' : 'list'; }
    else if (!user) S.screen = 'welcome';
    else if (!S.profile) S.screen = 'pickname';
    else if (S.profile.l0) { await openList(S.profile.l0); S.screen = 'list'; }
    else S.screen = 'home';
    S.msg = '';
  } catch (e) {
    if (mine !== routeSeq) return;
    S.user = user; S.profile = null; S.screen = user ? 'error' : 'welcome'; S.msg = friendlyError(e); S.error = true;
  }
  if (mine === routeSeq) render();
}
onAuthStateChanged(auth, (user) => { route(user); });

// ---- auth actions ---------------------------------------------------------------
async function googleSignIn() { try { await signInWithPopup(auth, new GoogleAuthProvider()); } catch (e) { say(friendlyError(e), true); } }
async function passwordAuth(form) {
  const name = cleanName(form.name.value), pass = form.pass.value;
  if (!validName(name)) return say('Name: 3 to 20 letters, digits or _ (no spaces).', true);
  S.busy = true;
  try {
    if (S.mode === 'signin') await signInWithEmailAndPassword(auth, nameToEmail(name), pass);
    else {
      const cred = await createUserWithEmailAndPassword(auth, nameToEmail(name), pass);
      try { await D.reserveName(cred.user, name); }
      catch (e) { await cred.user.delete(); throw e; }   // no half-made account
      await route(cred.user);
    }
  } catch (e) { S.busy = false; return say(friendlyError(e), true); }
  S.busy = false;
}
async function pickName(form) {
  const name = cleanName(form.name.value);
  if (!validName(name)) return say('Name: 3 to 20 letters, digits or _ (no spaces).', true);
  try {
    await D.reserveName(S.user, name);
    await route(S.user);
  } catch (e) { say(e.code === 'permission-denied' ? 'That name is taken. Pick another.' : friendlyError(e), true); }
}

// ---- owner actions ------------------------------------------------------------
async function createMyList() {
  try { const id = await D.createList(S.user, S.profile); S.profile.l0 = id; await openList(id); S.screen = 'list'; say('List created.'); }
  catch (e) { say(friendlyError(e), true); }
}
async function saveItemForm(form, id) {
  const v = {
    name: form.name.value, price: form.price.value, priceMax: form.priceMax.value, approx: form.approx.checked,
    priority: form.priority.value, note: form.note.value, tags: form.tags.value, urls: form.urls.value,
    repeat: form.repeat.checked, got: form.got.checked, picUrl: form.picUrl.value
  };
  const bad = checkItemInput(v);
  if (bad) return say(bad, true);
  const newId = id || nextItemId(S.list.items);
  if (!newId) return say('The list is full (100 items).', true);
  try {
    const item = itemFromForm(v, S.list.items[newId] || {});
    const file = form.pic.files[0];
    if (file) {                                     // picture first, then the item that points to it
      const dataUrl = await shrinkImage(file);
      await D.savePic(S.listId, newId, dataUrl);
      item.picV = Date.now(); delete S.pics[S.listId + newId];   // new number every time: caches never go stale
    } else if (form.removePic && form.removePic.checked && item.picV) {
      await D.deletePic(S.listId, newId); item.picV = 0; delete S.pics[S.listId + newId];
    }
    await D.saveItem(S.listId, S.list, newId, item);
    S.panel = 'list'; say('Saved.');
  } catch (e) { say(friendlyError(e), true); }
}
async function deleteItem(id) {
  try { await D.removeItem(S.listId, S.list, id); S.panel = 'list'; say('Deleted.'); } catch (e) { say(friendlyError(e), true); }
}
async function move(id, dir) {
  const order = moveInOrder(S.list, id, dir);
  if (!order) return;
  try { await D.saveOrder(S.listId, S.list, order); render(); } catch (e) { say(friendlyError(e), true); }
}
async function saveTags(rep, joints) {
  try { await D.saveTagSettings(S.listId, S.list, rep, joints); say('Tags saved.'); } catch (e) { say(friendlyError(e), true); }
}
async function importOld() {
  if (!confirm('Copy the items of the old wishlist page into this list?')) return;
  try {
    const res = await fetch(new URL('../wishlist.json', location.href));
    if (!res.ok) throw new Error('missing');
    const old = await res.json();
    const n = await D.importOld(S.listId, S.list, old, new URL('../', location.href).href, (a, b) => { S.msg = `Importing ${a}/${b}…`; S.error = false; render(); });
    say(`Imported ${n} items.`);
  } catch (e) { say(e.code ? friendlyError(e) : 'Could not read the old list.', true); }
}

// Shrink a photo to a small JPEG (about 40 KB). The rules allow at most 60,000 characters.
async function shrinkImage(file) {
  const bmp = await createImageBitmap(file);
  let side = 560, q = 0.72, out = '';
  for (let tries = 0; tries < 8; tries++) {
    const k = Math.min(1, side / Math.max(bmp.width, bmp.height));
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(bmp.width * k)); cv.height = Math.max(1, Math.round(bmp.height * k));
    cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
    out = cv.toDataURL('image/jpeg', q);
    if (out.length <= 55000) return out;
    side = Math.round(side * 0.8); q = Math.max(0.4, q - 0.06);
  }
  throw new Error('This picture will not get small enough. Try another.');
}

// ---- copy the share link ----
async function copyLink() {
  const url = location.origin + location.pathname + '?l=' + S.listId;
  let done = false;
  try { await navigator.clipboard.writeText(url); done = true; }
  catch (e) {                                             // older browsers: select a hidden box and copy
    const t = h('textarea', { style: 'position:fixed;opacity:0' }, url);
    document.body.append(t); t.select();
    try { done = document.execCommand('copy'); } catch (e2) { /* ignore */ }
    t.remove();
  }
  if (!done) return say('Could not copy. Long-press the link to copy it.', true);
  S.copied = true; render();
  setTimeout(() => { S.copied = false; render(); }, 2000);
}

// ---- ticking --------------------------------------------------------------------
async function tickAction(item, tick) {
  if (!S.user || !S.profile) return say('Sign in to tick items.', true);
  const confirmed = S.warnOk; S.warnOk = false;            // "Tick anyway" counts for this one tick only
  try {
    S.ticks = await D.loadTicks(S.listId, false);            // fresh read: two people may tick together
    const surprise = surpriseOn();
    const c = claims();
    let open = myTicks(false), sur = myTicks(true);
    if (tick) {
      if (c[item.id] && item.repeat !== 'item' && c[item.id].by !== S.user.uid) return say('Someone just ticked that one.', true);
      const hits = bigHits(item, ctx(), c, S.user.uid);
      if (hits.length && !confirmed) { S.warn = { item, hits }; return render(); }
      (surprise ? sur : open).push(item.id);
    } else { open = open.filter((x) => x !== item.id); sur = sur.filter((x) => x !== item.id); }
    S.warn = null;
    await D.writeMyTicks(S.listId, S.user, S.profile.name, [...new Set(open)], [...new Set(sur)]);
    S.ticks = await D.loadTicks(S.listId, false); render();
  } catch (e) { say(friendlyError(e), true); }
}
async function setSurprise(on) {
  try {                                                       // move my ticks to the other doc
    S.ticks = await D.loadTicks(S.listId, false);
    const all = [...new Set([...myTicks(false), ...myTicks(true)])];
    await D.writeMyTicks(S.listId, S.user, S.profile.name, on ? [] : all, on ? all : []);
    try { localStorage.setItem(surpriseKey(), on ? '1' : '0'); } catch (e) { /* ignore */ }
    S.ticks = await D.loadTicks(S.listId, false); render();
  } catch (e) { say(friendlyError(e), true); }
}

// ---- delete account ---------------------------------------------------------------
async function deleteAccount(form) {
  if (cleanName(form.confirm.value) !== S.profile.name) return say('Type your name exactly to confirm.', true);
  try {
    if (isGoogle()) await reauthenticateWithPopup(S.user, new GoogleAuthProvider());
    else await reauthenticateWithCredential(S.user, EmailAuthProvider.credential(nameToEmail(S.profile.name), form.pass.value));
  } catch (e) { return say(friendlyError(e), true); }
  try {
    await D.deleteMyData(S.user, S.profile, isOwner() ? S.list : null, (t) => { S.msg = t + '…'; S.error = false; render(); });
    await deleteUser(S.user);
    location.href = location.pathname;
  } catch (e) { say(friendlyError(e), true); }
}

// ---- pieces -----------------------------------------------------------------------
const topBar = (right) => h('header', { class: 'top' }, h('span', { class: 'wordmark' }, 'wishlist'), right || '');
const msgBox = () => S.msg ? h('div', { class: 'msg' + (S.error ? ' error' : ''), role: 'status' }, S.msg) : '';
const field = (label, name, attrs) => h('label', { class: 'field' }, label, h('input', { name, ...attrs }));
const textarea = (label, name, value, rows) => h('label', { class: 'field' }, label, h('textarea', { name, rows: rows || 3 }, value || ''));
const check = (label, name, on) => h('label', { class: 'check' }, h('input', { type: 'checkbox', name, checked: !!on }), ' ' + label);
const signOutBtn = () => h('button', { class: 'link', on: { click: () => signOut(auth) } }, 'Sign out');
const backBtn = (to) => h('button', { class: 'link', on: { click: () => go(to || 'list') } }, '‹ Back');

function authBlock() {
  const signup = S.mode === 'signup';
  return [
    h('button', { class: 'primary', on: { click: googleSignIn } }, 'Continue with Google'),
    h('p', { class: 'warn' }, 'Google is needed to own a list. Friends can use a name + password.'),
    h('hr'),
    h('form', { on: { submit: (e) => { e.preventDefault(); passwordAuth(e.target); } } },
      field('Name', 'name', { autocomplete: 'username', autocapitalize: 'none', required: true }),
      field('Password', 'pass', { type: 'password', autocomplete: signup ? 'new-password' : 'current-password', required: true, minlength: 6 }),
      signup ? h('p', { class: 'warn' }, 'No password reset. If you forget it, the account is lost.') : '',
      h('button', { class: 'primary', type: 'submit', disabled: S.busy }, signup ? 'Create account' : 'Sign in'),
      h('button', { class: 'link', type: 'button', on: { click: () => { S.mode = signup ? 'signin' : 'signup'; S.msg = ''; render(); } } },
        signup ? 'I already have an account' : 'Press here to create new account'))
  ];
}

function welcome() {
  return [topBar(), h('h1', {}, 'wishlist'),
    h('p', { class: 'muted' }, 'Make a list. Friends tick what they will buy. You never see who.'), ...authBlock(), msgBox()];
}
function pickNameScreen() {
  return [topBar(signOutBtn()), h('h1', {}, 'Pick a name'),
    h('p', { class: 'muted' }, 'Others see this name. It cannot be changed later.'),
    h('form', { on: { submit: (e) => { e.preventDefault(); pickName(e.target); } } },
      field('Name (a-z, 0-9, _)', 'name', { autocapitalize: 'none', required: true }),
      h('button', { class: 'primary', type: 'submit' }, 'Save name')), msgBox()];
}
function homeNoList() {
  const out = [topBar(signOutBtn()), h('h1', {}, 'Hi ' + S.profile.name)];
  if (isGoogle()) out.push(h('p', { class: 'muted' }, 'You do not have a list yet.'), h('button', { class: 'primary', on: { click: createMyList } }, 'Create my list'));
  else out.push(h('p', { class: 'muted' }, 'Name + password accounts can tick items on a friend’s list. Open the link your friend sent. To own a list, sign in with Google.'));
  out.push(h('hr'), h('button', { class: 'link', on: { click: () => go('account') } }, 'Account'), msgBox());
  return out;
}

// One list row. Owner: edit/move buttons. Visitor: round tick.
function rowFor(it, c, ctxNow, owner) {
  const claim = c[it.id], mine = !!(S.user && claim && claim.all.includes(S.user.uid));
  const taken = !!claim && !mine && it.repeat !== 'item';
  let lead;
  if (owner) {
    lead = h('span', { class: 'tick', 'aria-hidden': 'true' }, h('span', { class: claim ? 'on-other' : '' }));
  } else if (!S.user || !S.profile) {
    lead = h('button', { class: 'tick', 'aria-label': 'Sign in to tick ' + it.name, on: { click: () => { S.msg = ''; S.showAuth = true; render(); } } }, h('span'));
  } else if (taken) {
    lead = h('span', { class: 'tick', role: 'img', 'aria-label': 'Taken by someone' }, h('span', { class: 'on-other' }));
  } else {
    lead = h('button', { class: 'tick', 'aria-label': (mine ? 'Untick ' : 'Tick ') + it.name, on: { click: () => tickAction(it, !mine) } },
      h('span', { class: mine ? 'on-mine' : '' }));
  }
  const meta = [];
  if (mine) meta.push("you're buying this");
  else if (claim && !owner && it.repeat !== 'item') meta.push('someone is buying this');
  else if (owner && claim) meta.push('someone is buying this');
  if (it.tags.length) meta.push(it.tags.join(' · '));
  if (it.repeat === 'item') meta.push('can be bought many times');
  const note = !owner && S.user && S.profile && !taken && !mine ? smallNote(it, ctxNow, c) : null;
  const body = h('div', { class: 'body' },
    h('div', { class: 'top2' }, h('span', { class: 'name' + (it.got || taken ? ' dim' : '') }, it.name),
      h('span', { class: 'price' }, priceText(it))),
    meta.length ? h('div', { class: 'meta' }, meta.join(' · ')) : '',
    isHttps(it.picUrl) || it.picV ? picEl(it) : '',
    it.note ? h('div', { class: 'note' }, it.note) : '',
    it.urls.filter(isHttps).length ? h('div', { class: 'meta' }, it.urls.filter(isHttps).map((u) => h('a', { href: u, target: '_blank', rel: 'noopener noreferrer' }, linkLabel(u) + ' '))) : '',
    note ? h('div', { class: 'note' }, note) : '',
    owner ? h('div', { class: 'acts' },
      S.reorder ? [h('button', { class: 'link', 'aria-label': 'Move up', on: { click: () => move(it.id, -1) } }, '▲'),
        h('button', { class: 'link', 'aria-label': 'Move down', on: { click: () => move(it.id, 1) } }, '▼')] : '',
      h('button', { class: 'link', on: { click: () => { S.editId = it.id; go('edit'); } } }, 'Edit')) : '');
  return h('div', { class: 'row' }, lead, body);
}
const linkLabel = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return 'link'; } };
const priceText = (it) => !it.price ? '' : (it.approx ? '~' : '') + baht(it.price) + (it.priceMax > it.price ? '–' + baht(it.priceMax) : '');

// Small note: some (not all) of this item's tags are already picked.
function smallNote(it, ctxNow, c) {
  const hits = tagHits(it, ctxNow, c, S.user.uid).filter((x) => !x.big);
  if (!hits.length) return '';
  const x = hits[0];
  return (x.mine ? 'you are buying a ' : 'someone is buying a ') + x.name + ' item with the same ' + x.tags.join(', ') + ' tag';
}

// Picture: link first, else the small picture stored in Firestore (loaded lazily, cached on the device).
function picEl(it) {
  const img = h('img', { class: 'pic', alt: '', loading: 'lazy', referrerpolicy: 'no-referrer', width: 72, height: 72 });
  if (it.picV) {
    const key = S.listId + it.id + ':' + it.picV;
    let cached = ''; try { cached = localStorage.getItem('sv_pic_' + key) || ''; } catch (e) { /* ignore */ }
    if (cached) img.src = cached;
    else D.loadPic(S.listId, it.id).then((d) => {
      if (!d.startsWith('data:image/')) return;
      img.src = d; try { localStorage.setItem('sv_pic_' + key, d); } catch (e) { /* storage full: fine */ }
    }).catch(() => {});
  } else if (isHttps(it.picUrl)) img.src = it.picUrl;
  return img;
}

function listScreen() {
  const owner = isOwner();
  const out = [];
  if (!S.list) return [topBar(S.user ? signOutBtn() : signInBtn()), h('h1', {}, 'List not found'), h('p', { class: 'muted' }, 'Check the link.'), msgBox()];
  const right = S.user
    ? h('span', {}, h('button', { class: 'link', on: { click: () => go('account') } }, 'Account'), signOutBtn())
    : signInBtn();
  out.push(topBar(right));
  const t = totalToGet(S.list), cNow = claims(), cx = ctx();
  out.push(h('h1', {}, S.list.title), h('p', { class: 'muted' }, `${t.count} items · ${t.got} got · ${baht(t.sum)} to go`));
  if (owner) {                                            // owner tools at the top
    out.push(h('button', { class: 'primary', on: { click: () => { S.editId = null; go('edit'); } } }, 'Add an item'),
      h('div', { class: 'seg' },
        h('button', { 'aria-pressed': String(S.reorder), on: { click: () => { S.reorder = !S.reorder; render(); } } }, 'Reorder'),
        h('button', { on: { click: () => go('tags') } }, 'Tags')),
      h('button', { class: 'secondary', on: { click: copyLink } }, S.copied ? 'Link copied ✓' : 'Copy share link'));
    if (!t.count) out.push(h('button', { class: 'secondary', on: { click: importOld } }, 'Import my old wishlist'));
  }
  out.push(S.showAuth && !S.user ? '' : msgBox());
  if (!owner && S.user && S.profile) {
    out.push(h('label', { class: 'check surprise' }, h('input', { type: 'checkbox', checked: surpriseOn(), on: { change: (e) => setSurprise(e.target.checked) } }),
      ' Surprise mode: the owner cannot see my ticks'));
  }
  const tabs = [['all', 'All'], ...PRIORITIES, ['got', 'Got']];
  out.push(h('nav', { class: 'tabs', 'aria-label': 'Priority' }, tabs.map(([k, label]) =>
    h('button', { type: 'button', 'aria-pressed': String(S.tab === k), on: { click: () => { S.tab = k; render(); } } }, label))));
  const arr = itemsArr();
  const shown = S.tab === 'got' ? arr.filter((i) => i.got) : arr.filter((i) => !i.got && (S.tab === 'all' || i.priority === S.tab));
  for (const g of groupItems({ order: shown.map((i) => i.id), items: Object.fromEntries(shown.map((i) => [i.id, i])) })) {
    out.push(h('h2', {}, h('span', {}, g.title), h('span', {}, String(g.items.length))));
    g.items.forEach((it) => out.push(rowFor(it, cNow, cx, owner)));
  }
  if (!shown.length) out.push(h('p', { class: 'muted' }, owner ? 'Nothing here. Add an item above.' : 'Nothing here.'));
  return out;
}

// Sign-in popup for people who are not signed in (opened by the "Sign in" button or by tapping a tick).
const signInBtn = () => h('button', { class: 'pill', on: { click: () => { S.msg = ''; S.showAuth = true; render(); } } }, 'Sign in');
function authDialog() {
  if (!S.showAuth || S.user) return '';
  return h('div', { class: 'overlay', role: 'dialog', 'aria-label': 'Sign in' },
    h('div', { class: 'dialog' },
      h('button', { class: 'link close', 'aria-label': 'Close', on: { click: () => { S.showAuth = false; S.msg = ''; render(); } } }, 'Close'),
      h('h1', {}, 'Sign in'), ...authBlock(), msgBox()));
}

function warnBox() {
  if (!S.warn) return '';
  const { item, hits } = S.warn;
  return h('div', { class: 'overlay', role: 'alertdialog', 'aria-label': 'Same tag warning' },
    h('div', { class: 'dialog' },
      h('strong', {}, 'An item from the same category is already picked c:'),
      h('ul', {}, hits.map((x) => h('li', {}, x.name + (x.mine ? ' (you)' : '')))),
      h('button', { class: 'primary', on: { click: () => { S.warnOk = true; const it = item; S.warn = null; tickAction(it, true); } } }, 'Tick anyway'),
      h('button', { class: 'secondary', on: { click: () => { S.warn = null; render(); } } }, 'Go back')));
}

function editScreen() {
  const id = S.editId, it = id ? S.list.items[id] : null;
  const form = h('form', { on: { submit: (e) => { e.preventDefault(); saveItemForm(e.target, id); } } },
    field('Name', 'name', { required: true, maxlength: 120, value: it ? it.name : '' }),
    field('Price (฿)', 'price', { type: 'number', inputmode: 'decimal', step: 'any', min: 0, value: it && it.price ? it.price : '' }),
    field('Highest price (optional)', 'priceMax', { type: 'number', inputmode: 'decimal', step: 'any', min: 0, value: it && it.priceMax ? it.priceMax : '' }),
    check('Price is about (~)', 'approx', it && it.approx),
    h('label', { class: 'field' }, 'Priority',
      h('select', { name: 'priority' }, PRIORITIES.map(([k, label]) => h('option', { value: k, selected: (it ? it.priority : 'want') === k }, label)))),
    field('Tags (comma, max 5)', 'tags', { value: it ? it.tags.join(', ') : '' }),
    textarea('Note', 'note', it ? it.note : '', 2),
    textarea('Links (one per line, https, max 3)', 'urls', it ? it.urls.join('\n') : '', 3),
    field('Picture link (https)', 'picUrl', { type: 'url', value: it ? it.picUrl : '' }),
    h('label', { class: 'field' }, 'Or upload a small picture', h('input', { type: 'file', name: 'pic', accept: 'image/*' })),
    it && it.picV ? check('Remove my uploaded picture', 'removePic', false) : '',
    check('Can be bought many times', 'repeat', it && it.repeat === 'item'),
    check('Got it already', 'got', it && it.got),
    h('button', { class: 'primary', type: 'submit' }, 'Save'));
  return [topBar(backBtn()), h('h1', {}, it ? 'Edit item' : 'Add an item'), form,
    it ? h('button', { class: 'secondary danger', on: { click: () => { if (confirm('Delete this item?')) deleteItem(id); } } }, 'Delete item') : '', msgBox()];
}

function tagsScreen() {
  const arr = itemsArr(), tags = allTags(arr);
  const rep = new Set(S.list.repTags || []);
  const joints = (S.list.joints || []).map((j) => ({ name: j.name, tags: j.tags.slice() }));
  const repBoxes = tags.map((t) => check(t.label, 'rep', rep.has(t.key)));
  repBoxes.forEach((lab, i) => { lab.firstChild.value = tags[i].key; });
  const repForm = h('form', { on: { submit: (e) => { e.preventDefault();
    const keys = [...e.target.querySelectorAll('input[name=rep]:checked')].map((x) => x.value);
    saveTags(keys, S.list.joints || []); } } },
    h('h2', {}, h('span', {}, 'Repeatable tags (never warn)')),
    tags.length ? repBoxes : h('p', { class: 'muted' }, 'No tags yet.'),
    h('button', { class: 'primary', type: 'submit' }, 'Save repeatable tags'));
  const jointRows = joints.map((j, n) => h('div', { class: 'row-sm' }, h('span', {}, j.name + ' = ' + j.tags.join(' + ')),
    h('button', { class: 'link', on: { click: () => saveTags([...rep], joints.filter((_, i) => i !== n)) } }, 'Remove')));
  const jointForm = h('form', { on: { submit: (e) => { e.preventDefault();
    const name = e.target.jname.value.trim().slice(0, 30);
    const picked = [...e.target.querySelectorAll('input[name=jt]:checked')].map((x) => x.value);
    if (!name || picked.length < 2) return say('Give it a name and pick at least 2 tags.', true);
    if (joints.length >= 20) return say('Max 20 joint tags.', true);
    saveTags([...rep], [...joints, { name, tags: picked }]); } } },
    h('h2', {}, h('span', {}, 'Joint tags (hidden, for the logic only)')),
    ...jointRows,
    field('New joint tag name', 'jname', { maxlength: 30 }),
    tags.map((t) => { const lab = check(t.label, 'jt', false); lab.firstChild.value = t.label; return lab; }),
    h('button', { class: 'primary', type: 'submit' }, 'Add joint tag'));
  return [topBar(backBtn()), h('h1', {}, 'Tags'),
    h('p', { class: 'muted' }, 'Normal tags warn when two items share one. Repeatable tags never warn. A joint tag is a hidden extra tag for items that have all its tags.'),
    repForm, h('hr'), jointForm, msgBox()];
}

function accountScreen() {
  const form = h('form', { on: { submit: (e) => { e.preventDefault(); if (confirm('Delete everything? This cannot be undone.')) deleteAccount(e.target); } } },
    h('h2', {}, h('span', {}, 'Delete my account')),
    h('p', { class: 'warn' }, 'Removes your ticks, your list, pictures and your name. Friends’ ticks on your list are left behind and no longer shown.'),
    field('Type your name to confirm', 'confirm', { autocapitalize: 'none', required: true }),
    isGoogle() ? '' : field('Password', 'pass', { type: 'password', required: true }),
    h('button', { class: 'secondary danger', type: 'submit' }, 'Delete my account'));
  return [topBar(backBtn()), h('h1', {}, S.profile.name), h('p', { class: 'muted' }, isGoogle() ? 'Signed in with Google.' : 'Signed in with name + password.'), form, msgBox()];
}

function render() {
  const root = document.getElementById('app');
  let content;
  if (S.screen === 'welcome') content = welcome();
  else if (S.screen === 'error') content = [topBar(signOutBtn()), h('h1', {}, 'Could not load'), msgBox(), h('button', { class: 'primary', on: { click: () => route(S.user) } }, 'Try again')];
  else if (S.screen === 'pickname') content = pickNameScreen();
  else if (S.screen === 'home') content = S.panel === 'account' ? accountScreen() : homeNoList();
  else if (S.screen === 'list') {
    content = S.panel === 'edit' && isOwner() ? editScreen() : S.panel === 'tags' && isOwner() ? tagsScreen()
      : S.panel === 'account' && S.profile ? accountScreen() : listScreen();
  } else content = [h('p', { class: 'loading' }, 'Loading…')];
  content.push(warnBox(), authDialog());
  root.replaceChildren(...content);
}
render();
