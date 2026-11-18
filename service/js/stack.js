// Little swipeable picture stack for a list row (like the iMessage photo stack).
// The top card is the current picture. The next ones peek out behind it to the right; the ones already seen stack up behind it to the left.
// Swipe left/right on it to change picture. It loops: pull past the last picture (or the first) by a set length and the pictures shuffle round to the other end.
// At the ends the card pulls back and a ring fills while you pull; when the ring is full, let go to loop. A tap (no swipe) calls onOpen(index) to show the big viewer.
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

  // The loop ring: shows how far you have pulled at an end. Full ring (it turns solid) = let go now and it loops.
  const RING = 2 * Math.PI * 12;
  const ind = document.createElement('span'); ind.className = 'loopind'; ind.setAttribute('aria-hidden', 'true');
  ind.innerHTML = '<svg viewBox="0 0 32 32"><circle class="trk" cx="16" cy="16" r="12" fill="none" stroke-width="2.4"/>'
    + '<circle class="bar" cx="16" cy="16" r="12" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="' + RING + '" stroke-dashoffset="' + RING + '"/>'
    + '<path d="M20.2 13.2A5 5 0 1 0 21 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
    + '<path d="M20.6 9.6v3.9h-3.9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const bar = ind.querySelector('.bar');
  if (n > 1) btn.append(ind);
  function showPull(p) {
    ind.style.opacity = p < 0.12 ? '0' : String(Math.min(1, p + 0.25));
    bar.style.strokeDashoffset = String(RING * (1 - Math.min(1, p)));
    ind.classList.toggle('ready', p >= 1);
  }

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

  // where each card sits: top, or behind it (1 or 2 deep) on the right (next) or the left (already seen); deeper ones are hidden
  const POS = [
    'translateX(0)',
    'translate(7px,-4px) rotate(4deg) scale(.95)',
    'translate(13px,-7px) rotate(8deg) scale(.9)'
  ];
  const POS_SEEN = [
    'translateX(0)',
    'translate(-7px,-4px) rotate(-4deg) scale(.95)',
    'translate(-13px,-7px) rotate(-8deg) scale(.9)'
  ];
  let dx = 0;
  function place() {
    cards.forEach((c, i) => {
      const d = i - cur;
      c.style.transition = reduce ? 'none' : 'transform .22s ease-out, opacity .22s ease-out';
      c.style.zIndex = String(100 - Math.abs(d) * 2 + (d < 0 ? -1 : 0));
      c.style.pointerEvents = 'none';
      if (d < 0) { c.style.transform = POS_SEEN[Math.min(-d, 2)]; c.style.opacity = d < -2 ? '0' : '1'; }
      else if (d === 0) { c.style.transform = dx ? `translateX(${dx}px) rotate(${dx / 12}deg)` : POS[0]; c.style.opacity = '1'; }
      else { c.style.transform = POS[Math.min(d, 2)]; c.style.opacity = d > 2 ? '0' : '1'; }
    });
    if (badge) badge.textContent = `${cur + 1}/${n}`;
    ensure(cur); ensure(cur + 1); ensure(cur + 2);
  }
  // Shuffle: going round from one end to the other, the cards fan out like a deck being riffled, then settle with the new picture on top.
  // Each card travels along ONE smooth curve from where it was to where it ends up, with a sideways "fan" bump in the middle
  // (sine shaped, so it never stops or changes speed suddenly). The card order (z-index) flips at the top of the bump, and the picture that ends on top
  // is lifted a little at that moment so it hops over the others.
  const SHUFFLE_MS = 900, STEPS = 60;
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);          // slow in, slow out
  const pose = (matrixText) => { const m = new DOMMatrix(matrixText === 'none' ? undefined : matrixText); return { x: m.e, y: m.f, r: Math.atan2(m.b, m.a) * 180 / Math.PI, s: Math.hypot(m.a, m.b) }; };
  function shuffle(before, was) {
    cards.forEach((c, i) => {
      c.style.transition = 'none';                                                  // stop the normal slide: this animation moves the card instead
      const from = pose(before[i].t), to = pose(getComputedStyle(c).transform);
      const fromO = parseFloat(before[i].o), toO = parseFloat(c.style.opacity), finalZ = c.style.zIndex;
      const near = Math.abs(i - was) <= 2 || Math.abs(i - cur) <= 2;               // only the cards near either end join in
      const side = i % 2 ? 1 : -1, fx = side * (10 + (i % 3) * 3), fy = -5 - (i % 3) * 2, fr = side * (9 + (i % 4) * 3);
      const frames = [];
      for (let k = 0; k <= STEPS; k++) {
        const t = k / STEPS, e = ease(t), bump = Math.sin(Math.PI * t);
        const hop = i === cur ? bump : 0;                                           // the picture that ends on top lifts as it hops to the front, so the change of order does not look like a pop
        const x = from.x + (to.x - from.x) * e + fx * bump, y = from.y + (to.y - from.y) * e + fy * bump - 9 * hop;
        const r = from.r + (to.r - from.r) * e + fr * bump, sc = from.s + (to.s - from.s) * e - 0.04 * bump + 0.12 * hop;
        const o = near ? Math.max(fromO + (toO - fromO) * e, bump) : fromO + (toO - fromO) * e;
        frames.push({ transform: `translate(${x}px,${y}px) rotate(${r}deg) scale(${sc})`, opacity: o, zIndex: t < 0.5 ? before[i].z : finalZ });
      }
      c.animate(frames, { duration: SHUFFLE_MS, delay: Math.min(i, 6) * 35, easing: 'linear', fill: 'backwards' });
    });
  }
  const set = (i, tell = true, round = false) => {
    const was = cur;
    const before = round && !reduce ? cards.map((c) => { const k = getComputedStyle(c); return { t: k.transform, o: k.opacity, z: c.style.zIndex || '0' }; }) : null;
    cards.forEach((c) => c.getAnimations().forEach((an) => an.cancel()));    // a new change replaces a shuffle that is still playing
    cur = Math.min(Math.max(i, 0), n - 1); dx = 0; place();
    if (before) shuffle(before, was);
    if (tell && cur !== was && onChange) onChange(cur);
  };

  // swipe: the top card follows the finger; let go past ~20 px (or a quick flick) and it changes
  let down = null, swiped = false;
  btn.addEventListener('pointerdown', (e) => {
    if (n < 2 || (e.pointerType === 'mouse' && e.button !== 0)) return;
    down = { x: e.clientX, t: Date.now() }; swiped = false;
    btn.setPointerCapture(e.pointerId);
  });
  const atEdge = (mx) => (mx > 0 && cur === 0) || (mx < 0 && cur === n - 1);
  const PULL = 0.35, PULL_MAX = 22;                               // how much the card moves for each px of finger at an end, and its limit
  const needed = () => Math.max(40, btn.getBoundingClientRect().width * 0.6);   // how far to pull at an end before it loops
  btn.addEventListener('pointermove', (e) => {
    if (!down) return;
    const mx = e.clientX - down.x;
    if (Math.abs(mx) > 6) swiped = true;
    if (!swiped) return;
    const edge = atEdge(mx);
    dx = edge ? Math.sign(mx) * Math.min(Math.abs(mx) * PULL, PULL_MAX) : mx;   // at an end the card fights you: it moves at about a third of your finger
    showPull(edge ? Math.abs(mx) / needed() : 0);
    cards[cur].style.transition = 'none';
    cards[cur].style.transform = `translateX(${dx}px) rotate(${dx / 12}deg)`;
  });
  const end = (e) => {
    if (!down) return;
    const d = down; down = null;
    if (!swiped) return;
    const mx = e.clientX - d.x, w = btn.getBoundingClientRect().width;
    showPull(0);
    if (atEdge(mx)) {                                    // at an end: only a full pull loops (a quick flick does not)
      if (Math.abs(mx) >= needed()) set((cur + (mx < 0 ? 1 : -1) + n) % n, true, true); else set(cur);
    } else {
      const fast = Math.abs(mx) > 12 && Date.now() - d.t < 250;
      if (Math.abs(mx) > Math.max(20, w * 0.3) || fast) set(cur + (mx < 0 ? 1 : -1)); else set(cur);
    }
    setTimeout(() => { swiped = false; }, 0);          // the click that follows a swipe is ignored (below)
  };
  btn.addEventListener('pointerup', end);
  btn.addEventListener('pointercancel', () => { down = null; swiped = false; showPull(0); set(cur); });
  btn.addEventListener('click', (e) => {
    if (swiped) { e.preventDefault(); return; }
    onOpen(cur);
  });

  btn.setIndex = (i) => set(i, false);
  place();
  return btn;
}
