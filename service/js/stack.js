// Little swipeable picture stack for a list row (like the iMessage photo stack).
// The top card is the current picture; the next ones peek out behind it, a bit to the right.
// Swipe left/right on it to change picture. A tap (no swipe) calls onOpen(index) to show the big viewer.
//   pics: [{ load: () => Promise<string> }]   start: first index   onChange(i): called after each change
export function stackThumb({ pics, start = 0, label, onOpen, onChange }) {
  const n = pics.length;
  let cur = Math.min(Math.max(start, 0), n - 1);
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'thumb stack'; btn.setAttribute('aria-label', label);
  const cards = pics.map(() => {
    const c = document.createElement('span'); c.className = 'card';
    btn.append(c);
    return c;
  });
  let badge = null;
  if (n > 1) { badge = document.createElement('span'); badge.className = 'count'; badge.setAttribute('aria-hidden', 'true'); btn.append(badge); }

  // load a picture into its card the first time it is near the top
  const started = {};
  function ensure(i) {
    if (i < 0 || i >= n || started[i]) return;
    started[i] = true;
    Promise.resolve().then(() => pics[i].load()).then((src) => {
      if (!src) return;
      const img = document.createElement('img');
      img.alt = ''; img.draggable = false; img.referrerPolicy = 'no-referrer';
      img.onload = () => cards[i].replaceChildren(img);
      img.src = src;
    }).catch(() => {});
  }

  // where each card sits: gone to the left (already seen), top, or behind (1, 2, hidden deeper)
  const POS = [
    'translateX(0)',
    'translate(7px,-4px) rotate(4deg) scale(.95)',
    'translate(13px,-7px) rotate(8deg) scale(.9)'
  ];
  let dx = 0;
  function place() {
    cards.forEach((c, i) => {
      const d = i - cur;
      c.style.transition = reduce ? 'none' : 'transform .22s ease-out, opacity .22s ease-out';
      c.style.zIndex = String(100 - Math.abs(d) * 2 + (d < 0 ? -1 : 0));
      c.style.pointerEvents = 'none';
      if (d < 0) { c.style.transform = 'translateX(-130%) rotate(-10deg)'; c.style.opacity = '0'; }
      else if (d === 0) { c.style.transform = dx ? `translateX(${dx}px) rotate(${dx / 12}deg)` : POS[0]; c.style.opacity = '1'; }
      else { c.style.transform = POS[Math.min(d, 2)]; c.style.opacity = d > 2 ? '0' : '1'; }
    });
    if (badge) badge.textContent = `${cur + 1}/${n}`;
    ensure(cur); ensure(cur + 1); ensure(cur + 2);
  }
  const set = (i, tell = true) => {
    const was = cur;
    cur = Math.min(Math.max(i, 0), n - 1); dx = 0; place();
    if (tell && cur !== was && onChange) onChange(cur);
  };

  // swipe: the top card follows the finger; let go past ~20 px (or a quick flick) and it changes
  let down = null, swiped = false;
  btn.addEventListener('pointerdown', (e) => {
    if (n < 2 || (e.pointerType === 'mouse' && e.button !== 0)) return;
    down = { x: e.clientX, t: Date.now() }; swiped = false;
    btn.setPointerCapture(e.pointerId);
  });
  btn.addEventListener('pointermove', (e) => {
    if (!down) return;
    const mx = e.clientX - down.x;
    if (Math.abs(mx) > 6) swiped = true;
    if (!swiped) return;
    const atEdge = (mx > 0 && cur === 0) || (mx < 0 && cur === n - 1);
    dx = atEdge ? mx / 4 : mx;
    cards[cur].style.transition = 'none';
    cards[cur].style.transform = `translateX(${dx}px) rotate(${dx / 12}deg)`;
  });
  const end = (e) => {
    if (!down) return;
    const d = down; down = null;
    if (!swiped) return;
    const mx = e.clientX - d.x, w = btn.getBoundingClientRect().width;
    const fast = Math.abs(mx) > 12 && Date.now() - d.t < 250;
    if (Math.abs(mx) > Math.max(20, w * 0.3) || fast) set(cur + (mx < 0 ? 1 : -1)); else set(cur);
    setTimeout(() => { swiped = false; }, 0);          // the click that follows a swipe is ignored (below)
  };
  btn.addEventListener('pointerup', end);
  btn.addEventListener('pointercancel', () => { down = null; swiped = false; set(cur); });
  btn.addEventListener('click', (e) => {
    if (swiped) { e.preventDefault(); return; }
    onOpen(cur);
  });

  btn.setIndex = (i) => set(i, false);
  place();
  return btn;
}
