// Tag logic (same rules as the old site, now pure: no globals).
//   taga  normal tag: two items with the same tag warn each other
//   tagb  repeatable tag: ignored
//   tagc  joint tag: a hidden extra tag, given to items that have ALL its member tags
// ctx = { items: [{id, tags[], repeat, name}], repTags: [normalized keys], joints: [{name, tags[]}] }
// claims = { itemId: { by: uid } }   (items somebody ticked)

export const normTag = (t) => String(t || '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');

export function logicTags(item, ctx) {
  const have = {};
  item.tags.forEach((t) => { have[normTag(t)] = t; });
  (ctx.joints || []).forEach((j) => {
    const keys = j.tags.map(normTag);
    if (keys.length && keys.every((k) => have[k])) have['\u0001' + normTag(j.name)] = j.tags.join(' + ');
  });
  const rep = {};
  (ctx.repTags || []).forEach((k) => { rep[k] = true; });
  Object.keys(have).forEach((k) => { if (rep[k]) delete have[k]; });
  return have;
}

// Picks that share a tag with this item. big = every tag of this item is already picked.
export function tagHits(item, ctx, claims, uid) {
  if (item.repeat === 'item') return [];
  const mine = logicTags(item, ctx), keys = Object.keys(mine);
  if (!keys.length) return [];
  const picked = {}, ticked = {}, out = [];
  ctx.items.forEach((y) => {
    const c = claims[y.id];
    if (y.id === item.id || y.repeat === 'item' || !c) return;
    y.tags.forEach((t) => { ticked[normTag(t)] = true; });
    const theirs = logicTags(y, ctx);
    const shared = keys.filter((k) => theirs[k]);
    if (!shared.length) return;
    shared.forEach((k) => { picked[k] = true; });
    out.push({ name: y.name, mine: !!uid && c.by === uid, tags: shared.map((k) => mine[k]) });
  });
  // a joint tag also counts when all its tags are ticked on separate plain items
  (ctx.joints || []).forEach((j) => {
    const jk = '\u0001' + normTag(j.name);
    if (mine[jk] && j.tags.every((t) => ticked[normTag(t)])) picked[jk] = true;
  });
  const big = keys.every((k) => picked[k]);
  out.forEach((h) => { h.big = big; });
  return out;
}

export const bigHits = (item, ctx, claims, uid) => tagHits(item, ctx, claims, uid).filter((h) => h.big);

// Every tag used in the list, as { key, label } sorted by label.
export function allTags(items) {
  const m = {};
  items.forEach((i) => i.tags.forEach((t) => { m[normTag(t)] = m[normTag(t)] || t; }));
  return Object.keys(m).map((k) => ({ key: k, label: m[k] })).sort((a, b) => a.label.localeCompare(b.label));
}
