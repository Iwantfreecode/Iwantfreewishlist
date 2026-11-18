// Little swipeable picture stack for a list row (like the iMessage photo stack).
// The top card is the current picture. The next ones peek out behind it to the right; the ones already seen stack up behind it to the left.
// Swipe left/right on it to change picture. It loops: pull past the last picture (or the first) by a set length and the pictures go under the stack, one after another, round to the other end.
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
  // Going round (from one end to the other): the pictures go UNDER the stack one after another, each one sliding out to the side you pulled
  // and tucking under, until the picture at the other end is on top. Pulling right on the first picture sends 1, 2, 3 ... under to the right
  // until the last is on top; pulling left on the last sends them under to the left until the first is on top. Then the pile settles into place.
  const TOTAL_MS = 900, SETTLE_MS = 140, SLIDE = 0.85;
  const PILE = [[0, 0, 0, 1], [7, -4, 4, .95], [13, -7, 8, .9]];                  // same numbers as POS above, as numbers: x, y, rotation, scale
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);   // slow in, slow out
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const clamp01 = (t) => Math.min(1, Math.max(0, t));
  const pose = (matrixText) => { const m = new DOMMatrix(matrixText === 'none' ? undefined : matrixText); return { x: m.e, y: m.f, r: Math.atan2(m.b, m.a) * 180 / Math.PI, s: Math.hypot(m.a, m.b), o: 1 }; };
  const mix = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, r: a.r + (b.r - a.r) * t, s: a.s + (b.s - a.s) * t, o: a.o + (b.o - a.o) * t });
  function cascade(before, was, side) {
    const steps = n - 1, T = Math.min(300, Math.max(120, (TOTAL_MS - SETTLE_MS) / steps)), D = steps * T + SETTLE_MS;
    const order = []; for (let k = 0; k < n; k++) order.push((was + (side > 0 ? k : -k) + n * 2) % n);   // top to bottom, as they will leave
    const rank = []; order.forEach((ci, r) => { rank[ci] = r; });
    const slot = (k) => { const q = PILE[Math.min(k, 2)]; return { x: q[0] * side, y: q[1], r: q[2] * side, s: q[3], o: k > 2 ? 0 : 1 }; };   // a place in the pile (on the side the pictures slide to)
    const slotAt = (i, st) => (rank[i] >= st ? rank[i] - st : n - (st - rank[i]));                        // where card i sits after st pictures have gone under
    const W = cards[0].offsetWidth;
    cards.forEach((c, i) => {
      c.style.transition = 'none';                                                    // stop the normal slide: this animation moves the card instead
      const start = { ...pose(before[i].t), o: parseFloat(before[i].o) };
      const end = { ...pose(getComputedStyle(c).transform), o: parseFloat(c.style.opacity) }, endZ = parseInt(c.style.zIndex || '0', 10);
      const frames = [], zs = [];
      for (let ms = 0; ; ms = Math.min(D, ms + 16)) {
        let p, z;
        if (ms >= steps * T) {                                                       // the pile settles into its final places
          const u = ease(clamp01((ms - steps * T) / SETTLE_MS)), k = slotAt(i, steps);
          p = mix(slot(k), end, u); z = u < 0.5 ? 100 - 2 * k : endZ;
        } else {
          const st = Math.floor(ms / T), u = (ms - st * T) / T;
          if (rank[i] === st) {                                                       // the top picture: slides out to the side, then tucks under the pile
            const home = st === 0 ? start : slot(0), out = { x: side * W * SLIDE, y: -4, r: side * 12, s: 1, o: 1 };
            if (u < 0.45) { p = mix(home, out, easeOut(u / 0.45)); z = 130; }
            else { p = mix(out, slot(n - 1), ease((u - 0.45) / 0.55)); z = 100 - 2 * n; }
          } else {                                                                    // every other picture moves up one place in the pile
            const k0 = slotAt(i, st), k1 = slotAt(i, st + 1), t = ease(clamp01((u - 0.3) / 0.7));
            p = mix(st === 0 ? start : slot(k0), slot(k1), t); z = 100 - 2 * (u > 0.5 ? k1 : k0);
          }
        }
        frames.push({ transform: `translate(${p.x}px,${p.y}px) rotate(${p.r}deg) scale(${p.s})`, opacity: p.o });
        zs.push({ zIndex: Math.round(z), at: ms / D });
        if (ms >= D) break;
      }
      frames.forEach((f, k) => { f.offset = k / (frames.length - 1); });
      c.animate(frames, { duration: D, easing: 'linear', fill: 'backwards' });         // movement only (transform + opacity): the phone's graphics chip can run this by itself, so it stays smooth
      const zf = zs.filter((f, k) => k === 0 || f.zIndex !== zs[k - 1].zIndex).map((f) => ({ zIndex: f.zIndex, offset: f.at, easing: 'step-end' }));   // stacking order changes only at a few moments
      if (zf.length > 1) { zf[0].offset = 0; zf.push({ zIndex: zf[zf.length - 1].zIndex, offset: 1 }); c.animate(zf, { duration: D, easing: 'linear', fill: 'backwards' }); }
    });
  }
  const set = (i, tell = true, round = 0) => {                    // round: +1 / -1 = going round the end, the side the pictures slide to
    const was = cur;
    const before = round && !reduce ? cards.map((c) => { const k = getComputedStyle(c); return { t: k.transform, o: k.opacity, z: c.style.zIndex || '0' }; }) : null;
    cards.forEach((c) => c.getAnimations().forEach((an) => an.cancel()));    // a new change replaces a loop that is still playing
    cur = Math.min(Math.max(i, 0), n - 1); dx = 0; place();
    if (before) cascade(before, was, round);
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
      if (Math.abs(mx) >= needed()) set((cur + (mx < 0 ? 1 : -1) + n) % n, true, mx > 0 ? 1 : -1); else set(cur);
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
