// wishlist service (stage 3): lists, items, tags, ticks + per-item name switch, pictures, account delete, import.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {
  getAuth, connectAuthEmulator, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, reauthenticateWithPopup,
  EmailAuthProvider, reauthenticateWithCredential, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, deleteUser
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import { getFirestore, connectFirestoreEmulator } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import { firebaseConfig } from './config.js?v=20261112l';
import {
  PRIORITIES, cleanName, validName, nameToEmail, nextItemId, itemFromForm, checkItemInput,
  groupItems, totalToGet, baht, friendlyError, moveInOrder, isHttps, itemPics, picLinksOf,
  DEFAULT_PREFS, THEME_NAMES, themeVars, FONTS, TEXT_SIZES, sanitizePrefs, parseImport, IMPORT_MAX } from './logic.js?v=20261112l';
import { logicTags, tagHits, bigHits, allTags, normTag } from './tags.js?v=20261112l';
import { makeData } from './data.js?v=20261112l';
import { runEffect } from './effect.js?v=20261112l';
import { openViewer } from './viewer.js?v=20261112l';
import { stackThumb } from './stack.js?v=20261112l';

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
  imp: { text: '', rows: null, busy: false }, screen: 'loading', panel: 'list', user: null, profile: null,
  list: null, listId: null, ticks: [], msg: '', error: false, busy: false,
  mode: 'signin', tab: 'all', reorder: false, editId: null, warn: null, pics: {}, picIdx: {}, saving: {}, showAuth: false, copied: false, showLook: false, confirmFx: false, showRename: false
};
// ---- appearance: saved on this device only, applied by setting CSS variables ----
let fxStarted = false;
let prefs = DEFAULT_PREFS;
try { prefs = sanitizePrefs(JSON.parse(localStorage.getItem('sv_prefs'))); } catch (e) { /* defaults */ }
const darkMq = window.matchMedia('(prefers-color-scheme: dark)');
function applyPrefs() {
  const root = document.documentElement, dark = prefs.theme === 'dark' || (prefs.theme === 'device' && darkMq.matches);
  if (prefs.theme === 'device') root.removeAttribute('data-theme'); else root.dataset.theme = prefs.theme;
  root.dataset.layout = prefs.layout;
  root.dataset.size = prefs.size;
  const v = themeVars(prefs.scheme, dark);
  const set = (k, val) => root.style.setProperty(k, val);
  set('--accent', v.accent); set('--accent-ink', v.accentInk); set('--on-accent', v.onAccent); set('--soft', v.soft);
  set('--touch', v.touch); set('--touch-soft', v.touchSoft); set('--extra', v.extra); set('--extra-soft', v.extraSoft);
  set('--font', prefs.layout === 'text' ? "'Courier Prime', 'Courier New', monospace" : FONTS[prefs.font]);
  set('--display', prefs.layout === 'text' ? "'Courier Prime', 'Courier New', monospace" : prefs.font === 'clean' ? "'Instrument Serif', Georgia, serif" : FONTS[prefs.font]);
  if (prefs.font === 'clean' && !document.getElementById('sv-display')) {          // title font loads late; Georgia shows until then
    document.head.append(h('link', { id: 'sv-display', rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Instrument+Serif&display=swap' }));
  }
  if (prefs.font !== 'clean' && !document.getElementById('sv-fonts')) {        // web fonts load only when someone picks one
    document.head.append(h('link', { id: 'sv-fonts', rel: 'stylesheet',
      href: 'https://fonts.googleapis.com/css2?family=Courier+Prime:wght@400;700&family=Dancing+Script:wght@500;700&family=Lora:wght@500;600&display=swap' }));
  }
}
function setPrefs(change) {
  prefs = sanitizePrefs({ ...prefs, ...change });
  try { localStorage.setItem('sv_prefs', JSON.stringify(prefs)); } catch (e) { /* ignore */ }
  applyPrefs(); render();
  if (S.user && S.profile) D.savePrefs(S.user.uid, prefs).catch(() => {});      // saved to the account too (quietly; the device copy still works)
}
darkMq.addEventListener('change', () => { applyPrefs(); });
const params = new URLSearchParams(location.search);
const sharedId = params.get('l');
const isOwner = () => !!(S.user && S.list && S.list.ownerUid === S.user.uid);
const isGoogle = () => !!(S.user && S.user.providerData.some((p) => p.providerId === 'google.com'));
const shownName = () => (prefs.shown || (S.profile && S.profile.name) || '');
// Items I chose to sign with my name before ticking them (kept on this device, per list).

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
// An error inside the item form: show it without rebuilding the page, so typed text and picked pictures stay.
function formSay(form, msg) {
  S.msg = msg; S.error = true;
  let el = document.querySelector('#app .msg');
  if (!el) { el = h('div', { class: 'msg error', role: 'status' }); form.parentElement.append(el); }
  el.className = 'msg error'; el.textContent = msg;
}
const go = (panel) => { S.panel = panel; S.msg = ''; render(); window.scrollTo(0, 0); };

// ---- derived data ---------------------------------------------------------------
const itemsArr = () => S.list.order.filter((id) => S.list.items[id]).map((id) => ({ id, ...S.list.items[id] }));
const ctx = () => ({ items: itemsArr(), repTags: S.list.repTags || [], joints: S.list.joints || [] });
// Who ticked what. Named ticks carry the shown name, anonymous ones carry no name at all.
function claims() {
  const c = {};
  for (const t of S.ticks) for (const id of t.items || []) {
    if (!c[id]) c[id] = { by: t.uid, name: t.name, named: !!t.named, all: [] };
    c[id].all.push(t.uid);
  }
  return c;
}
const myTicks = (named) => {
  const t = S.ticks.find((x) => S.user && x.uid === S.user.uid && !!x.named === named);
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
    if (next.profile) {      // the account's look wins; a new account starts with the defaults
      const p = next.profile.prefs;
      prefs = sanitizePrefs(p && Object.keys(p).length ? p : null);
      try { localStorage.setItem('sv_prefs', JSON.stringify(prefs)); } catch (e) { /* ignore */ }
      applyPrefs();
    }
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
    const shown = sanitizePrefs({ shown: form.shown.value }).shown;
    if (shown) { try { await D.savePrefs(S.user.uid, sanitizePrefs({ ...prefs, shown })); } catch (e) { /* can be set later in Account */ } }
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
    repeat: form.repeat.checked, got: form.got.checked, picUrls: form.picUrls.value
  };
  const bad = checkItemInput(v);
  if (bad) return formSay(form, bad);
  const newId = id || nextItemId(S.list.items);
  if (!newId) return formSay(form, 'The list is full (100 items).');
  try {
    const item = itemFromForm(v, S.list.items[newId] || {});
    // two upload slots: slot 0 is stored as iNN, slot 1 as iNN_1; a new version number each time keeps caches fresh
    for (const [slot, field, rmField, verKey] of [[0, 'pic', 'removePic', 'picV'], [1, 'pic2', 'removePic2', 'picV1']]) {
      const file = form[field].files[0], key = slot ? newId + '_1' : newId;
      if (file) {
        const dataUrl = await shrinkImage(file);
        await D.savePic(S.listId, key, dataUrl);
        item[verKey] = Date.now();
      } else if (form[rmField] && form[rmField].checked && item[verKey]) {
        await D.deletePic(S.listId, key); item[verKey] = 0;
      }
    }
    await D.saveItem(S.listId, S.list, newId, item);
    S.panel = 'list'; say('Saved.');
  } catch (e) { formSay(form, friendlyError(e)); }
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
// My two tick docs, rebuilt from lists of item ids. Used to show a tick at once, before the network answers.
const withMine = (ticks, open, named) => {
  const mk = (items, flag) => items.length ? [{ uid: S.user.uid, name: flag ? shownName() : '', named: flag, v: 2, items }] : [];
  return [...ticks.filter((t) => t.uid !== S.user.uid), ...mk(open, false), ...mk(named, true)];
};
let tickQueue = Promise.resolve();
// Taps are handled one after another, so a fast second tap cannot undo or race the first.
// While a tap is waiting or being saved, S.saving[item.id] is set: the row shows a spinner and "Saving…".
function track(id, run) {
  S.saving[id] = (S.saving[id] || 0) + 1;
  tickQueue = tickQueue.then(run).finally(() => { if (!--S.saving[id]) delete S.saving[id]; render(); });
  return tickQueue;
}
const tickAction = (item, tick) => track(item.id, () => doTick(item, tick));
async function doTick(item, tick) {
  if (!S.user || !S.profile) return say('Sign in to tick items.', true);
  const confirmed = S.warnOk; S.warnOk = false;              // "Tick anyway" counts for this one tick only
  try {
    const c0 = claims();
    if (tick) {
      if (c0[item.id] && item.repeat !== 'item' && c0[item.id].by !== S.user.uid) return say('Someone just ticked that one.', true);
      const hits = bigHits(item, ctx(), c0, S.user.uid);
      if (hits.length && !confirmed) { S.warn = { item, hits }; return render(); }
    }
    S.warn = null;
    const change = (open, sur) => {                           // open = anonymous, sur = named
      if (tick) open.push(item.id);                          // a new tick is always "someone"; the switch on the item changes it
      else { open = open.filter((x) => x !== item.id); sur = sur.filter((x) => x !== item.id); }
      return [[...new Set(open)], [...new Set(sur)]];
    };
    S.ticks = withMine(S.ticks, ...change(myTicks(false), myTicks(true)));
    render();                                                 // the tick shows at once
    const fresh = await D.loadTicks(S.listId, false);         // then check against the real data: two people may tick together
    S.ticks = fresh;
    if (tick && claims()[item.id] && item.repeat !== 'item' && claims()[item.id].by !== S.user.uid) { render(); return say('Someone just ticked that one.', true); }
    const [open, sur] = change(myTicks(false), myTicks(true));
    await D.writeMyTicks(S.listId, S.user, shownName(), open, sur);
    S.ticks = withMine(fresh, open, sur); render();
  } catch (e) {
    try { S.ticks = await D.loadTicks(S.listId, false); } catch (e2) { /* keep what we have */ }
    say(friendlyError(e), true);
  }
}
// The "Owner sees" switch on one ticked item: move it between my two docs (someone / my name).
const setNamed = (item, on) => track(item.id, () => setNamedRun(item, on));
async function setNamedRun(item, on) {
  const mineOpen = myTicks(false).includes(item.id), mineNamed = myTicks(true).includes(item.id);
  if (!mineOpen && !mineNamed || mineNamed === on) return;
  S.ticks = withMine(S.ticks, on ? myTicks(false).filter((x) => x !== item.id) : [...myTicks(false), item.id],
    on ? [...myTicks(true), item.id] : myTicks(true).filter((x) => x !== item.id));
  render();                                                   // switch moves at once
  try {
    S.ticks = await D.loadTicks(S.listId, false);
    const open = myTicks(false).filter((x) => x !== item.id), named = myTicks(true).filter((x) => x !== item.id);
    (on ? named : open).push(item.id);
    await D.writeMyTicks(S.listId, S.user, shownName(), open, named);
    S.ticks = await D.loadTicks(S.listId, false); render();
  } catch (e) { say(friendlyError(e), true); }
}
async function renameList(form) {
  const title = form.title.value.trim();
  if (!title || title.length > 80) return say('List name: 1 to 80 characters.', true);
  try { await D.saveTitle(S.listId, S.list, title); S.showRename = false; render(); } catch (e) { say(friendlyError(e), true); }
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
const lookBtn = () => h('button', { class: 'link', on: { click: () => { S.showLook = true; render(); } } }, 'Appearance');
// Logo: a small list card (a ticked line, two open lines) with a heart. Drawn in the accent color.
function logo() {
  const wrap = document.createElement('span'); wrap.className = 'logo'; wrap.setAttribute('aria-hidden', 'true');
  wrap.innerHTML = '<svg viewBox="0 0 32 32" width="30" height="30"><rect x="3" y="2" width="22" height="28" rx="5" fill="none" stroke="currentColor" stroke-width="2.4"/>'
    + '<path d="M7.5 10.5l2 2 3.5-4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 10.5h5.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>'
    + '<circle cx="10" cy="17.5" r="2.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M16 17.5h5.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>'
    + '<circle cx="10" cy="23.5" r="2.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M16 23.5h3.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>'
    + '<path d="M26 18.5c-1.6-1.9-4.6-.4-3.1 1.9l3.1 3.1 3.1-3.1c1.5-2.3-1.5-3.8-3.1-1.9z" fill="currentColor"/></svg>';
  return wrap;                      // fixed markup written here, no outside text
}
const topBar = (right) => h('header', { class: 'top' }, h('span', { class: 'wordmark' }, logo(), h('span', {}, 'wishlist')), h('span', { class: 'topr' }, lookBtn(), right || ''));
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
        signup ? 'I already have an account' : 'New here? Press here to create new account'))
  ];
}

function welcome() {
  return [topBar(), h('h1', {}, 'wishlist'),
    h('p', { class: 'muted' }, 'Make a list. Friends tick what they will buy. You never see who.'), ...authBlock(), msgBox()];
}
function pickNameScreen() {
  return [topBar(signOutBtn()), h('h1', {}, 'Pick a name'),
    h('p', { class: 'muted' }, 'Your username. Others see it. It cannot be changed later.'),
    h('form', { on: { submit: (e) => { e.preventDefault(); pickName(e.target); } } },
      field('Name (a-z, 0-9, _)', 'name', { autocapitalize: 'none', required: true }),
      field('Name the owner sees when you choose "Show my name" (optional)', 'shown', { maxlength: 20 }),
      h('p', { class: 'warn' }, 'When you turn on "Show my name" for an item, the list owner sees this name. Leave it empty to use your username. You can change it later in Account.'),
      h('button', { class: 'primary', type: 'submit' }, 'Save name')), msgBox()];
}
function homeNoList() {
  const out = [topBar(signOutBtn()), h('h1', {}, 'Hi ' + S.profile.name)];
  if (isGoogle()) out.push(h('p', { class: 'muted' }, 'You do not have a list yet.'), h('button', { class: 'primary', on: { click: createMyList } }, 'Create my list'));
  else out.push(h('p', { class: 'muted' }, 'Name + password accounts can tick items on a friend’s list. Open the link your friend sent. To own a list, sign in with Google.'));
  out.push(h('hr'), h('button', { class: 'link', on: { click: () => go('account') } }, 'Account'), msgBox());
  return out;
}

// One list row: picture on the left, text in the middle. Friends tick on the right, the owner sees a plain circle on the left.
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
      h('span', { class: (mine ? 'on-mine' : '') + (S.saving[it.id] ? ' saving' : '') }));
  }
  const meta = [];
  if (it.tags.length) meta.push(it.tags.join(' · '));
  if (it.repeat === 'item') meta.push('can be bought many times');
  let status = '';
  if (S.saving[it.id] && !owner) status = h('div', { class: 'status saving', role: 'status' }, h('span', { class: 'spin', 'aria-hidden': 'true' }), 'Saving…');
  else if (mine) status = h('div', { class: 'status mine' }, 'You are buying this');
  else if (claim && !owner && it.repeat !== 'item') status = h('div', { class: 'status' }, 'Someone is buying this');
  else if (owner && claim) status = h('div', { class: 'status mine' }, claim.named && claim.name ? claim.name + ' is buying this' : 'Someone is buying this');
  const named = mine && myTicks(true).includes(it.id);
  const sw = mine ? h('div', { class: 'ownersees' }, h('span', {}, 'Owner sees'),
    h('span', { class: 'seg2', role: 'group', 'aria-label': 'What the owner sees' },
      h('button', { type: 'button', 'aria-pressed': String(!named), on: { click: () => setNamed(it, false) } }, 'someone'),
      h('button', { type: 'button', 'aria-pressed': String(named), on: { click: () => setNamed(it, true) } }, shownName()))) : '';
  const note = !owner && S.user && S.profile && !taken && !mine ? smallNote(it, ctxNow, c) : null;
  const body = h('div', { class: 'body' },
    h('div', { class: 'name' + (it.got || taken ? ' dim' : '') }, it.name),
    h('div', { class: 'price' }, priceText(it), meta.length ? h('span', { class: 'meta' }, ' · ' + meta.join(' · ')) : ''),
    it.note ? h('div', { class: 'note' }, it.note) : '',
    status, sw,
    it.urls.filter(isHttps).length ? h('div', { class: 'meta links' }, it.urls.filter(isHttps).map((u) => h('a', { href: u, target: '_blank', rel: 'noopener noreferrer' }, '↗ ' + linkLabel(u) + ' '))) : '',
    note ? h('div', { class: 'note soft' }, note) : '',
    owner ? h('div', { class: 'acts' },
      S.reorder ? [h('button', { class: 'link', 'aria-label': 'Move up', on: { click: () => move(it.id, -1) } }, '▲'),
        h('button', { class: 'link', 'aria-label': 'Move down', on: { click: () => move(it.id, 1) } }, '▼')] : '',
      h('button', { class: 'link', on: { click: () => { S.editId = it.id; go('edit'); } } }, 'Edit')) : '');
  const pics = itemPics(it);
  const picKey = S.listId + it.id;
  const thumb = pics.length
    ? stackThumb({
        pics: pics.map((p) => ({ load: () => picSrc(it, p) })), start: S.picIdx[picKey] || 0,
        label: pics.length > 1 ? `Show ${pics.length} pictures of ${it.name}` : 'Show picture of ' + it.name,
        onChange: (i) => { S.picIdx[picKey] = i; },
        onOpen: (i) => { const el = document.querySelector(`[data-pk="${picKey}"]`); showPics(it, i, (j) => { S.picIdx[picKey] = j; if (el && el.setIndex) el.setIndex(j); }); }
      })
    : h('span', { class: 'pic ph', 'aria-hidden': 'true' }, (it.name || '?').slice(0, 1).toUpperCase());
  if (pics.length) thumb.dataset.pk = picKey;
  if (prefs.layout === 'text') {
    const must = it.priority === 'must' || it.priority === 'essential';
    const plabel = (PRIORITIES.find((x) => x[0] === it.priority) || [0, it.priority])[1];
    const price = it.price ? (it.approx ? 'around ' : '') + baht(it.price) + (it.priceMax > it.price ? '–' + baht(it.priceMax) : '') : '';
    const rowsD = [];
    if (it.note) rowsD.push(['Detail', it.note]);
    rowsD.push(['Priority', plabel]);
    if (it.tags.length) rowsD.push(['Tag', h('span', {}, it.tags.map((t) => h('span', { class: 'tagchip' }, t)))]);
    if (it.repeat === 'item') rowsD.push(['Repeat', 'can be bought many times']);
    const ls = it.urls.filter(isHttps);
    if (ls.length) rowsD.push(['Links', h('span', {}, ls.map((u) => h('a', { href: u, target: '_blank', rel: 'noopener noreferrer' }, '↗ ' + linkLabel(u) + ' ')))]);
    const st = body.querySelector('.status');
    if (st) rowsD.push(['Buying', st.textContent.replace('Saving…', '').trim() || (S.saving[it.id] ? 'Saving…' : '')]);
    const tb = h('div', { class: 'tbody' },
      h('div', { class: 'line' }, h('span', { class: 'name' + (must && !it.got && !taken ? ' mark' : '') + (it.got || taken ? ' dim' : '') }, it.name),
        h('span', { class: 'lead', 'aria-hidden': 'true' }), price ? h('span', { class: 'price' }, price) : ''),
      pics.length ? thumb : '',
      h('dl', { class: 'details' }, rowsD.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])),
      sw, body.querySelector('.acts') || '');
    return h('div', { class: 'row tx' + (owner ? ' owner' : '') }, lead, tb);
  }
  return h('div', { class: 'row' + (owner ? ' owner' : '') }, lead, thumb, body);
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

// One picture as an <img>: a link shows straight away, an uploaded one is loaded from Firestore (cached on the device).
function picSrc(it, p) {
  if (p.url) return Promise.resolve(p.url);
  const key = S.listId + it.id + '_' + p.slot + ':' + p.v;
  let cached = ''; try { cached = localStorage.getItem('sv_pic_' + key) || ''; } catch (e) { /* ignore */ }
  if (cached) return Promise.resolve(cached);
  return D.loadPic(S.listId, p.slot ? it.id + '_1' : it.id).then((d) => {
    if (!d.startsWith('data:image/')) return '';
    try { localStorage.setItem('sv_pic_' + key, d); } catch (e) { /* storage full: fine */ }
    return d;
  });
}
function showPics(it, start, onClose) { openViewer(itemPics(it).map((p) => ({ load: () => picSrc(it, p) })), start, it.name + ' pictures', onClose); }

function listScreen() {
  const owner = isOwner();
  const out = [], side = [];
  if (!S.list) return [topBar(S.user ? signOutBtn() : signInBtn()), h('h1', {}, 'List not found'), h('p', { class: 'muted' }, 'Check the link.'), msgBox()];
  const right = S.user
    ? h('span', {}, h('button', { class: 'link', on: { click: () => go('account') } }, 'Account'), signOutBtn())
    : signInBtn();
  const t = totalToGet(S.list), cNow = claims(), cx = ctx();
  const pct = t.count ? Math.round(100 * t.got / t.count) : 0;
  side.push(h('h1', {}, S.list.title), owner ? h('button', { class: 'link', on: { click: () => { S.showRename = true; render(); } } }, 'Rename list') : '',
    h('div', { class: 'stat' }, h('span', { class: 'big' }, `${t.got} of ${t.count}`), h('span', { class: 'muted small' }, ' items got')),
    h('div', { class: 'bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': t.count, 'aria-valuenow': t.got },
      h('div', { style: 'width:' + pct + '%' }), h('i', { style: 'left:calc((100% - 10px) * ' + (pct / 100) + ')' })));
  if (owner) {                                            // owner tools at the top
    side.push(h('button', { class: 'primary', on: { click: () => { S.editId = null; go('edit'); } } }, 'Add an item'),
      h('div', { class: 'seg' },
        h('button', { 'aria-pressed': String(S.reorder), on: { click: () => { S.reorder = !S.reorder; render(); } } }, 'Reorder'),
        h('button', { on: { click: () => go('tags') } }, 'Tags')),
      h('button', { class: 'secondary', on: { click: copyLink } }, S.copied ? 'Link copied ✓' : 'Copy share link'));
    side.push(h('button', { class: 'secondary', on: { click: () => { S.imp = { text: '', rows: null, busy: false }; go('import'); } } }, 'Import items'));
    if (!t.count) side.push(h('button', { class: 'secondary', on: { click: importOld } }, 'Import my old wishlist'));
  }
  side.push(S.showAuth && !S.user ? '' : msgBox());
  if (!owner && S.user && S.profile) {
    side.push(h('p', { class: 'muted small' }, 'The owner sees "someone" on items you tick. After you tick an item you can switch it to your name (' + shownName() + '), item by item. Change that name in Account.'));
  }
  const tabs = [['all', 'All'], ...PRIORITIES, ['got', 'Got']];
  const arr = itemsArr();
  const cnt = (k) => k === 'got' ? arr.filter((i) => i.got).length : arr.filter((i) => !i.got && (k === 'all' || i.priority === k)).length;
  out.push(h('nav', { class: 'tabs', 'aria-label': 'Priority' }, tabs.map(([k, label]) =>
    h('button', { type: 'button', 'aria-pressed': String(S.tab === k), on: { click: () => { S.tab = k; render(); } } }, prefs.layout === 'text' ? label + ' (' + cnt(k) + ')' : label))));
  const shown = S.tab === 'got' ? arr.filter((i) => i.got) : arr.filter((i) => !i.got && (S.tab === 'all' || i.priority === S.tab));
  for (const g of groupItems({ order: shown.map((i) => i.id), items: Object.fromEntries(shown.map((i) => [i.id, i])) })) {
    out.push(h('div', { class: 'sec' }, h('span', { class: 'badge b-' + g.key }, g.title), h('span', { class: 'muted small' }, g.items.length + (g.items.length === 1 ? ' item' : ' items')), h('span', { class: 'rule' })));
    g.items.forEach((it) => out.push(rowFor(it, cNow, cx, owner)));
  }
  if (!shown.length) out.push(h('p', { class: 'muted' }, owner ? 'Nothing here. Add an item above.' : 'Nothing here.'));
  return [topBar(right), h('div', { class: 'cols' }, h('aside', {}, side), h('div', { class: 'main' }, out))];
}

function lookDialog() {
  if (!S.showLook) return '';
  const seg = (key, options) => h('div', { class: 'seg' }, options.map(([v, label]) =>
    h('button', { type: 'button', 'aria-pressed': String(prefs[key] === v), on: { click: () => setPrefs({ [key]: v }) } }, label)));
  return h('div', { class: 'overlay', role: 'dialog', 'aria-label': 'Appearance' },
    h('div', { class: 'dialog' },
      h('button', { class: 'link close', on: { click: () => { S.showLook = false; render(); } } }, 'Done'),
      h('h1', {}, 'Appearance'),
      h('p', { class: 'warn' }, 'Only changes how you see the site. Saved to your account when you are signed in, and on this device.'),
      h('h2', {}, h('span', {}, 'Mode')), seg('theme', [['light', 'Light'], ['dark', 'Dark'], ['device', 'Follow device']]),
      h('h2', {}, h('span', {}, 'Color theme')),
      h('div', { class: 'themes' }, THEME_NAMES.map((name) => {
        const v = themeVars(name, false);
        return h('button', { type: 'button', class: 'themetile', 'aria-label': name, 'aria-pressed': String(prefs.scheme === name), on: { click: () => setPrefs({ scheme: name }) } },
          h('span', { class: 'dots' }, h('i', { style: 'background:' + v.accent }), h('i', { style: 'background:' + v.touch }), h('i', { style: 'background:' + v.extra })), name);
      })),
      h('h2', {}, h('span', {}, 'Font')),
      seg('font', [['clean', 'Clean'], ['type', 'Typewriter'], ['cursive', 'Cursive'], ['serif', 'Serif']]),
      h('h2', {}, h('span', {}, 'Text size')),
      h('div', { class: 'seg sizes' }, TEXT_SIZES.map(([v, label, px]) =>
        h('button', { type: 'button', style: 'font-size:' + px + 'px', 'aria-pressed': String(prefs.size === v), on: { click: () => setPrefs({ size: v }) } }, label))),
      h('h2', {}, h('span', {}, 'Layout')), seg('layout', [['app', 'App'], ['text', 'Plain text']]),
      h('h2', {}, h('span', {}, 'Page build effect')),
      h('div', { class: 'seg' }, [[false, 'Off'], [true, 'On']].map(([v, label]) =>
        h('button', { type: 'button', 'aria-pressed': String(prefs.effect === v),
          on: { click: () => { if (v && !prefs.effect) { S.confirmFx = true; render(); } else if (!v) setPrefs({ effect: false }); } } }, label))),
      h('p', { class: 'muted small' }, 'Cursors build the page when it opens. It uses more data and battery, can feel confusing or slow, and may cause other display problems. Takes effect the next time you open the page.'),
      h('button', { class: 'secondary', on: { click: () => setPrefs({ ...DEFAULT_PREFS, shown: prefs.shown }) } }, 'Reset to Rose')));
}

function renameDialog() {
  if (!S.showRename || !S.list) return '';
  return h('div', { class: 'overlay', role: 'dialog', 'aria-label': 'Rename list' },
    h('div', { class: 'dialog' }, h('h1', {}, 'Rename list'),
      h('form', { on: { submit: (e) => { e.preventDefault(); renameList(e.target); } } },
        field('List name', 'title', { value: S.list.title, maxlength: 80, required: true }),
        h('button', { class: 'primary', type: 'submit' }, 'Save'),
        h('button', { class: 'secondary', type: 'button', on: { click: () => { S.showRename = false; render(); } } }, 'Cancel'))));
}
function fxConfirm() {
  if (!S.confirmFx) return '';
  const close = () => { S.confirmFx = false; render(); };
  return h('div', { class: 'overlay', role: 'alertdialog', 'aria-label': 'Turn on page build effect' },
    h('div', { class: 'dialog' },
      h('h1', {}, 'Are you sure?'),
      h('ul', {}, h('li', {}, 'It uses more data and battery.'), h('li', {}, 'Parts of the page stay covered until a cursor builds them, which can feel confusing or slow.'),
        h('li', {}, 'It may cause other display problems. Turn it off if the page acts strange.')),
      h('button', { class: 'primary', on: { click: () => { S.confirmFx = false; setPrefs({ effect: true }); } } }, 'Yes, turn it on'),
      h('button', { class: 'secondary', on: { click: close } }, 'No, keep it off')));
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
    textarea('Picture links (one per line, https, max 8)', 'picUrls', it ? picLinksOf(it).join('\n') : '', 3),
    h('label', { class: 'field' }, 'Upload picture 1 (small)', h('input', { type: 'file', name: 'pic', accept: 'image/*' })),
    it && it.picV ? check('Remove uploaded picture 1', 'removePic', false) : '',
    h('label', { class: 'field' }, 'Upload picture 2 (small)', h('input', { type: 'file', name: 'pic2', accept: 'image/*' })),
    it && it.picV1 ? check('Remove uploaded picture 2', 'removePic2', false) : '',
    check('Can be bought many times', 'repeat', it && it.repeat === 'item'),
    check('Got it already', 'got', it && it.got),
    h('button', { class: 'primary', type: 'submit' }, 'Save'));
  return [topBar(backBtn()), h('h1', {}, it ? 'Edit item' : 'Add an item'), form,
    it ? h('button', { class: 'secondary danger', on: { click: () => { if (confirm('Delete this item?')) deleteItem(id); } } }, 'Delete item') : '', msgBox()];
}

// ---- import many items at once: paste text (Notes, chat), paste from Sheets, or pick a .csv / .txt file ----
function importScreen() {
  const I = S.imp, have = S.list.order.length, room = Math.max(0, IMPORT_MAX - have);
  const dup = new Set(itemsArr().map((i) => i.name.trim().toLowerCase()));
  const preview = () => {
    I.rows = parseImport(I.text).map((r, k) => ({ ...r, use: !dup.has(r.name.toLowerCase()), dup: dup.has(r.name.toLowerCase()) }));
    let left = room; I.rows.forEach((r) => { if (r.use) { if (left > 0) left--; else { r.use = false; r.over = true; } } });
    S.msg = I.rows.length ? '' : 'Nothing found. Paste one item per line.'; S.error = !I.rows.length; render();
  };
  const ta = h('textarea', { name: 'text', rows: 8, placeholder: 'One item per line, for example:\nBlack backpack ฿2,500 https://shop.com/bag\nHeadphones around 3000\n\nOr paste cells from Google Sheets / Excel (columns: name, price, note, link, priority, tags).', on: { input: (e) => { I.text = e.target.value; } } }, I.text);
  const file = h('input', { type: 'file', accept: '.csv,.tsv,.txt,text/csv,text/plain', 'aria-label': 'Pick a file', on: { change: (e) => {
    const f = e.target.files[0]; if (!f) return;
    if (f.size > 500000) return say('That file is too big (max 500 KB).', true);
    f.text().then((t) => { I.text = t; preview(); }).catch(() => say('Could not read that file.', true));
  } } });
  const out = [topBar(backBtn('list')), h('h1', {}, 'Import items'),
    h('p', { class: 'muted' }, 'Move your list here in one go. Paste it or pick a file, check the preview, then add. Free space on this list: ' + room + ' items.'),
    h('label', { class: 'field' }, 'Paste your list', ta),
    h('label', { class: 'field' }, 'Or pick a file (.csv, .txt)', file),
    h('button', { class: 'primary', type: 'button', on: { click: preview } }, 'Preview'), msgBox()];
  if (I.rows && I.rows.length) {
    const n = I.rows.filter((r) => r.use).length;
    out.push(h('h2', {}, h('span', {}, 'Preview')), h('p', { class: 'warn' }, 'Untick what you do not want. Fix names and prices here. Items with the same name as one on your list are unticked.'));
    I.rows.forEach((r) => out.push(h('div', { class: 'improw' },
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: r.use, 'aria-label': 'Add ' + r.name, on: { change: (e) => { r.use = e.target.checked; const c = I.rows.filter((x) => x.use).length; const b = document.getElementById('impgo'); if (b) b.textContent = 'Add ' + c + ' items'; } } })),
      h('div', {},
        h('input', { class: 'impname', value: r.name, maxlength: 120, 'aria-label': 'Name', on: { input: (e) => { r.name = e.target.value.slice(0, 120); } } }),
        h('div', { class: 'impmeta' },
          h('input', { class: 'impprice', value: r.price || '', inputmode: 'numeric', placeholder: 'price', 'aria-label': 'Price', on: { input: (e) => { r.price = Number(String(e.target.value).replace(/[^\d]/g, '')) || 0; } } }),
          h('span', { class: 'muted small' }, [r.urls.length ? r.urls.length + ' link' + (r.urls.length > 1 ? 's' : '') : '', r.dup ? 'already on your list' : r.over ? 'list is full' : r.note ? r.note.slice(0, 40) : ''].filter(Boolean).join(' · ')))))));
    out.push(h('label', { class: 'field' }, 'Priority for all new items',
      h('select', { name: 'prio', on: { change: (e) => { I.prio = e.target.value; } } }, PRIORITIES.map(([k, l]) => h('option', { value: k, selected: (I.prio || 'want') === k }, l)))),
      h('button', { class: 'primary', id: 'impgo', type: 'button', disabled: I.busy, on: { click: runImport } }, 'Add ' + n + ' items'));
  }
  return out;
}
async function runImport() {
  const I = S.imp, rows = I.rows.filter((r) => r.use && r.name.trim());
  if (!rows.length) return say('Nothing ticked.', true);
  I.busy = true;
  try {
    const prio = I.prio || 'want';
    const items = rows.map((r) => ({ ...r, priority: r.priority && r.priority !== 'want' ? r.priority : prio }));
    const n = await D.importOld(S.listId, S.list, { items }, new URL('../', location.href).href, (a, b) => { S.msg = `Adding ${a}/${b}…`; S.error = false; render(); });
    I.busy = false; I.rows = null; I.text = ''; S.panel = 'list'; say(`Added ${n} items.`);
  } catch (e) { I.busy = false; say(e.code ? friendlyError(e) : 'Could not add the items.', true); }
}

function tagsScreen() {
  const arr = itemsArr(), tags = allTags(arr);
  const rep = new Set(S.list.repTags || []);
  const joints = (S.list.joints || []).map((j) => ({ name: j.name, tags: j.tags.slice() }));
  const chip = (label, name, on) => { const l = check(label, name, on); l.className = 'chip'; return l; };
  const repBoxes = tags.map((t) => chip(t.label, 'rep', rep.has(t.key)));
  repBoxes.forEach((lab, i) => { lab.firstChild.value = tags[i].key; });
  const repForm = h('form', { on: { submit: (e) => { e.preventDefault();
    const keys = [...e.target.querySelectorAll('input[name=rep]:checked')].map((x) => x.value);
    saveTags(keys, S.list.joints || []); } } },
    h('h3', {}, 'Repeatable tags'), h('p', { class: 'muted' }, 'Items with these tags can be bought many times. They never warn.'),
    tags.length ? h('div', { class: 'chips' }, repBoxes) : h('p', { class: 'muted' }, 'No tags yet.'),
    h('button', { class: 'primary', type: 'submit' }, 'Save repeatable tags'));
  const jointRows = joints.map((j, n) => h('div', { class: 'row-sm' }, h('span', {}, h('b', {}, j.name), h('span', { class: 'muted' }, ' = ' + j.tags.join(' + '))),
    h('button', { class: 'link', on: { click: () => saveTags([...rep], joints.filter((_, i) => i !== n)) } }, 'Remove')));
  const jointForm = h('form', { on: { submit: (e) => { e.preventDefault();
    const name = e.target.jname.value.trim().slice(0, 30);
    const picked = [...e.target.querySelectorAll('input[name=jt]:checked')].map((x) => x.value);
    if (!name || picked.length < 2) return say('Give it a name and pick at least 2 tags.', true);
    if (joints.length >= 20) return say('Max 20 joint tags.', true);
    saveTags([...rep], [...joints, { name, tags: picked }]); } } },
    h('h3', {}, 'Joint tags'),
    h('p', { class: 'muted' }, 'A joint tag is a hidden tag for items that have all of its tags. Friends never see it. It only decides which items count as the same kind.'),
    jointRows.length ? h('div', { class: 'jointlist' }, jointRows) : '',
    h('h4', {}, 'New joint tag'),
    field('Name', 'jname', { maxlength: 30, placeholder: 'e.g. big bag' }),
    h('p', { class: 'warn' }, 'Pick 2 or more tags'),
    h('div', { class: 'chips' }, tags.map((t) => { const lab = chip(t.label, 'jt', false); lab.firstChild.value = t.label; return lab; })),
    h('button', { class: 'primary', type: 'submit' }, 'Add joint tag'));
  return [topBar(backBtn()), h('h1', {}, 'Tags'),
    h('p', { class: 'muted' }, 'Tags warn your friends when two items are the same kind, so nobody buys both.'),
    repForm, h('hr'), jointForm, msgBox()];
}

function accountScreen() {
  const form = h('form', { on: { submit: (e) => { e.preventDefault(); if (confirm('Delete everything? This cannot be undone.')) deleteAccount(e.target); } } },
    h('h2', {}, h('span', {}, 'Delete my account')),
    h('p', { class: 'warn' }, 'Removes your ticks, your list, pictures and your name. Friends’ ticks on your list are left behind and no longer shown.'),
    field('Type your name to confirm', 'confirm', { autocapitalize: 'none', required: true }),
    isGoogle() ? '' : field('Password', 'pass', { type: 'password', required: true }),
    h('button', { class: 'secondary danger', type: 'submit' }, 'Delete my account'));
  const shownForm = h('form', { on: { submit: (e) => { e.preventDefault(); setPrefs({ shown: e.target.shown.value }); say('Saved.'); } } },
    h('h2', {}, h('span', {}, 'Name the owner sees')),
    field('Shown when you tick "Show my name" (empty = your username)', 'shown', { value: prefs.shown, maxlength: 20 }),
    h('p', { class: 'warn' }, 'This name is displayed to list owners on items where you turn on "Show my name". It is not unique and does not change your username.'),
    h('button', { class: 'primary', type: 'submit' }, 'Save shown name'));
  return [topBar(backBtn()), h('h1', {}, S.profile.name), h('p', { class: 'muted' }, isGoogle() ? 'Signed in with Google.' : 'Signed in with name + password.'), shownForm, form, msgBox()];
}

function render() {
  const root = document.getElementById('app');
  let content;
  if (S.screen === 'welcome') content = welcome();
  else if (S.screen === 'error') content = [topBar(signOutBtn()), h('h1', {}, 'Could not load'), msgBox(), h('button', { class: 'primary', on: { click: () => route(S.user) } }, 'Try again')];
  else if (S.screen === 'pickname') content = pickNameScreen();
  else if (S.screen === 'home') content = S.panel === 'account' ? accountScreen() : homeNoList();
  else if (S.screen === 'list') {
    content = S.panel === 'edit' && isOwner() ? editScreen() : S.panel === 'tags' && isOwner() ? tagsScreen() : S.panel === 'import' && isOwner() ? importScreen()
      : S.panel === 'account' && S.profile ? accountScreen() : listScreen();
  } else content = [h('p', { class: 'loading' }, 'Loading…')];
  if (!(S.screen === 'list' && S.panel === 'list')) content = [h('div', { class: 'narrow' }, content)];   // forms stay narrow on wide screens
  content.push(warnBox(), authDialog(), lookDialog(), fxConfirm(), renameDialog());
  if (prefs.effect && S.screen === 'list' && !fxStarted) { fxStarted = true; requestAnimationFrame(() => runEffect()); }
  root.dataset.view = S.screen === 'list' && S.panel === 'list' && isOwner() ? 'owner' : 'other';
  root.replaceChildren(...content);
}
applyPrefs();
render();
