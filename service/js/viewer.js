// Picture viewer (like the iMessage photo viewer). Opens over the page and manages its own little DOM,
// so the app's render() never touches it.
//   slides: [{ load: () => Promise<string> }]  (each returns an image address: https link or data: URL)
// Tap the left half = back, right half = next. Swipe left/right. Arrow keys. Esc or Close button closes.

const make = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v; else el.setAttribute(k, v);
  }
  kids.flat().forEach((c) => el.append(c));
  return el;
};

export function openViewer(slides, start = 0, title = 'Pictures') {
  if (!slides.length || document.getElementById('viewer')) return;
  let i = Math.min(Math.max(start, 0), slides.length - 1);
  const opener = document.activeElement;
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // --- build ---
  const track = make('div', { class: 'vtrack' });
  const cells = slides.map(() => {
    const c = make('div', { class: 'vcell' });
    track.append(c);
    return c;
  });
  const count = make('div', { class: 'vcount', 'aria-live': 'polite' });
  const dots = make('div', { class: 'vdots', 'aria-hidden': 'true' });
  const dotEls = slides.length <= 5 ? slides.map(() => dots.appendChild(make('i'))) : [];
  const prevHint = make('span', { class: 'vhint left', 'aria-hidden': 'true' }, '‹');
  const nextHint = make('span', { class: 'vhint right', 'aria-hidden': 'true' }, '›');
  const stage = make('div', { class: 'vstage' }, track, prevHint, nextHint);
  const closeBtn = make('button', { class: 'vclose', type: 'button', 'aria-label': 'Close pictures' }, 'Close');
  const box = make('div', { id: 'viewer', class: 'viewer', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    make('div', { class: 'vbar' }, count, closeBtn), stage, dots);
  const prevOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  document.body.append(box);

  // --- loading: only the current picture and its neighbours ---
  const started = {};
  function ensure(n) {
    if (n < 0 || n >= slides.length || started[n]) return;
    started[n] = true;
    const cell = cells[n];
    cell.textContent = 'Loading…';
    Promise.resolve().then(() => slides[n].load()).then((src) => {
      if (!src) throw new Error('empty');
      const img = make('img', { alt: '', draggable: 'false', referrerpolicy: 'no-referrer' });
      img.onload = () => { cell.textContent = ''; cell.append(img); };
      img.onerror = () => { cell.textContent = 'This picture could not be loaded.'; };
      img.src = src;
    }).catch(() => { cell.textContent = 'This picture could not be loaded.'; });
  }

  // --- show picture n ---
  let dx = 0;
  function show() {
    track.style.transition = reduce ? 'none' : 'transform .25s ease-out';
    track.style.transform = `translateX(calc(${-i * 100}% + ${dx}px))`;
    count.textContent = `${i + 1} / ${slides.length}`;
    dotEls.forEach((d, n) => d.classList.toggle('on', n === i));
    prevHint.style.visibility = i > 0 ? 'visible' : 'hidden';
    nextHint.style.visibility = i < slides.length - 1 ? 'visible' : 'hidden';
    ensure(i - 1); ensure(i); ensure(i + 1);
  }
  const go = (n) => { i = Math.min(Math.max(n, 0), slides.length - 1); dx = 0; show(); };

  // --- tap and swipe (one pointer; vertical scrolling is switched off on the stage) ---
  let down = null;
  stage.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    down = { x: e.clientX, y: e.clientY, t: Date.now(), moved: false };
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener('pointermove', (e) => {
    if (!down) return;
    const mx = e.clientX - down.x;
    if (Math.abs(mx) > 8) down.moved = true;
    if (!down.moved) return;
    // pull with the finger; resist at both ends
    const atEdge = (mx > 0 && i === 0) || (mx < 0 && i === slides.length - 1);
    dx = atEdge ? mx / 4 : mx;
    track.style.transition = 'none';
    track.style.transform = `translateX(calc(${-i * 100}% + ${dx}px))`;
  });
  const finish = (e) => {
    if (!down) return;
    const d = down; down = null;
    const mx = e.clientX - d.x, w = stage.getBoundingClientRect().width;
    if (d.moved) {
      const fast = Math.abs(mx) > 30 && Date.now() - d.t < 300;
      if (Math.abs(mx) > w * 0.2 || fast) go(i + (mx < 0 ? 1 : -1)); else go(i);
    } else {
      const r = stage.getBoundingClientRect();
      go(i + (e.clientX < r.left + r.width / 2 ? -1 : 1));
    }
  };
  stage.addEventListener('pointerup', finish);
  stage.addEventListener('pointercancel', () => { down = null; go(i); });

  // --- keys and closing ---
  function close() {
    document.removeEventListener('keydown', onKey, true);
    box.remove();
    document.body.style.overflow = prevOverflow;
    if (opener && opener.focus) opener.focus();
  }
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowLeft') go(i - 1);
    else if (e.key === 'ArrowRight') go(i + 1);
    else if (e.key === 'Tab') { e.preventDefault(); closeBtn.focus(); }      // the Close button is the only control
  }
  document.addEventListener('keydown', onKey, true);
  closeBtn.addEventListener('click', close);
  show();
  closeBtn.focus();
}
