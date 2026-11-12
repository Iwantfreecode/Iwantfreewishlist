// All Firestore reads and writes live here. The rules allow ONE item change per write.
import {
  doc, getDoc, getDocs, setDoc, deleteDoc, updateDoc, writeBatch, collection, collectionGroup,
  query, where, serverTimestamp, deleteField
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import { newListId, mapOldItem, nextItemId } from './logic.js?v=20261112l';
import { normTag } from './tags.js?v=20261112l';

export function makeData(db) {
  const listRef = (id) => doc(db, 'lists', id);
  const picRef = (id, item) => doc(db, 'lists', id, 'pics', item);
  const ticksCol = (id) => collection(db, 'lists', id, 'ticks');

  async function getProfile(uid) {
    const s = await getDoc(doc(db, 'users', uid));
    return s.exists() ? s.data() : null;
  }
  async function savePrefs(uid, prefs) { await updateDoc(doc(db, 'users', uid), { prefs }); }
  async function getList(id) {
    const s = await getDoc(listRef(id));
    return s.exists() ? s.data() : null;
  }

  // name + profile in ONE batch: the rules refuse it if the name already exists
  async function reserveName(user, name) {
    const b = writeBatch(db);
    b.set(doc(db, 'users', user.uid), { name, l0: '', l1: '', l2: '', prefs: {} });
    b.set(doc(db, 'names', name), { uid: user.uid });
    await b.commit();
    return { name, l0: '', l1: '', l2: '', prefs: {} };
  }

  async function createList(user, profile) {
    const id = newListId();
    const b = writeBatch(db);
    b.set(listRef(id), {
      ownerUid: user.uid, ownerName: profile.name, title: profile.name + "'s list",
      repTags: [], joints: [], items: {}, order: [], lastId: '', updatedAt: serverTimestamp()
    });
    b.update(doc(db, 'users', user.uid), { l0: id });
    await b.commit();
    return id;
  }

  // ---- items (one per write) ----
  async function saveItem(listId, list, id, item) {
    const isNew = !(id in list.items);
    const order = isNew ? [...list.order, id] : list.order;
    await updateDoc(listRef(listId), { ['items.' + id]: item, order, lastId: id, updatedAt: serverTimestamp() });
    list.items[id] = item; list.order = order; list.lastId = id;
  }
  async function removeItem(listId, list, id) {
    const gone = list.items[id];
    if (gone && gone.picV) await deleteDoc(picRef(listId, id));
    if (gone && gone.picV1) await deleteDoc(picRef(listId, id + '_1'));
    const order = list.order.filter((x) => x !== id);
    await updateDoc(listRef(listId), { ['items.' + id]: deleteField(), order, lastId: id, updatedAt: serverTimestamp() });
    delete list.items[id]; list.order = order; list.lastId = id;
  }
  async function saveOrder(listId, list, order) {
    await updateDoc(listRef(listId), { order, lastId: list.lastId, updatedAt: serverTimestamp() });
    list.order = order;
  }
  async function saveTagSettings(listId, list, repTags, joints) {
    await updateDoc(listRef(listId), { repTags, joints, lastId: list.lastId, updatedAt: serverTimestamp() });
    list.repTags = repTags; list.joints = joints;
  }

  // ---- ticks ----
  // A ticker has 2 docs per list: uid_a (anonymous: the owner sees "someone") and uid_n (named: the owner sees the shown name).
  // Version 2 docs only (v: 2). Older doc types are ignored.
  async function loadTicks(listId, isOwner) {
    const q = isOwner ? query(ticksCol(listId), where('v', '==', 2)) : ticksCol(listId);
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data()).filter((t) => t.v === 2);
  }
  async function writeMyTicks(listId, user, shown, anon, named) {
    const b = writeBatch(db);
    [['_a', anon, false, ''], ['_n', named, true, shown]].forEach(([suffix, items, flag, name]) => {
      const ref = doc(db, 'lists', listId, 'ticks', user.uid + suffix);
      if (items.length) b.set(ref, { uid: user.uid, name, named: flag, v: 2, items, updatedAt: serverTimestamp() });
      else b.delete(ref);
    });
    await b.commit();
  }
  async function saveTitle(listId, list, title) {
    await updateDoc(listRef(listId), { title, lastId: list.lastId, updatedAt: serverTimestamp() });
    list.title = title;
  }

  // ---- pictures (one small data URL per item, inside Firestore) ----
  async function savePic(listId, itemId, dataUrl) { await setDoc(picRef(listId, itemId), { data: dataUrl }); }
  async function loadPic(listId, itemId) {
    const s = await getDoc(picRef(listId, itemId));
    return s.exists() ? s.data().data : '';
  }
  async function deletePic(listId, itemId) { await deleteDoc(picRef(listId, itemId)); }

  // ---- import the old list once (needs an empty list; one write per item) ----
  async function importOld(listId, list, old, baseUrl, onProgress) {
    const rep = new Set(list.repTags || []);
    const items = (old.items || []).filter((x) => !x.example);
    let n = 0;
    for (const o of items) {
      const id = nextItemId(list.items);
      if (!id) break;
      const { item, repTagsAdd } = mapOldItem(o, baseUrl);
      repTagsAdd.forEach((k) => rep.add(k));
      await saveItem(listId, list, id, item);
      n++; if (onProgress) onProgress(n, items.length);
    }
    const joints = Array.isArray(old.joints) ? old.joints.filter((j) => j && j.name && Array.isArray(j.tags)).slice(0, 20) : list.joints;
    (Array.isArray(old.repTags) ? old.repTags : []).forEach((k) => rep.add(normTag(k)));
    if (n) await saveTagSettings(listId, list, [...rep].slice(0, 30), joints);
    return n;
  }

  // ---- delete my account data. Order matters (the rules check it). ----
  async function deleteMyData(user, profile, list, onStep) {
    onStep('Removing my ticks');
    const mine = await getDocs(query(collectionGroup(db, 'ticks'), where('uid', '==', user.uid)));
    for (const d of mine.docs) await deleteDoc(d.ref);
    for (const k of ['l0', 'l1', 'l2']) {
      const id = profile[k];
      if (!id) continue;
      onStep('Removing my list');
      const l = id === profile.l0 && list ? list : await getList(id);
      if (l) {
        for (const itemId of Object.keys(l.items || {})) {
          if (l.items[itemId].picV) await deleteDoc(picRef(id, itemId));
          if (l.items[itemId].picV1) await deleteDoc(picRef(id, itemId + '_1'));
        }
        await deleteDoc(listRef(id));
      }
    }
    onStep('Removing my name');
    const b = writeBatch(db);
    b.delete(doc(db, 'users', user.uid));
    b.delete(doc(db, 'names', profile.name));
    await b.commit();
  }

  return { getProfile, savePrefs, saveTitle, getList, reserveName, createList, saveItem, removeItem, saveOrder, saveTagSettings,
    loadTicks, writeMyTicks, savePic, loadPic, deletePic, importOld, deleteMyData };
}
