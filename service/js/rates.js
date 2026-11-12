// Exchange rate for the friend's "prices in" choice. Free public source (ECB data), asked from the browser, no key.
// A rate is kept on the device for 12 hours. If the source cannot be reached the page shows the owner's prices instead.
const URL_BASE = 'https://api.frankfurter.dev/v1/latest';
const KEEP_MS = 12 * 3600 * 1000;

export async function getRate(from, to, fetchFn = fetch, store = (typeof localStorage !== 'undefined' ? localStorage : null)) {
  if (from === to) return { rate: 1, date: '' };
  const key = 'sv_rate_' + from + '_' + to;
  try {
    const old = store && JSON.parse(store.getItem(key) || 'null');
    if (old && old.rate > 0 && Date.now() - old.t < KEEP_MS) return { rate: old.rate, date: old.date };
  } catch (e) { /* ignore a broken saved value */ }
  const res = await fetchFn(URL_BASE + '?base=' + encodeURIComponent(from) + '&symbols=' + encodeURIComponent(to));
  if (!res.ok) throw new Error('rate source answered ' + res.status);
  const j = await res.json();
  const rate = j && j.rates && Number(j.rates[to]);
  if (!(rate > 0)) throw new Error('no rate for ' + to);
  const out = { rate, date: String(j.date || '') };
  try { if (store) store.setItem(key, JSON.stringify({ ...out, t: Date.now() })); } catch (e) { /* ignore */ }
  return out;
}
