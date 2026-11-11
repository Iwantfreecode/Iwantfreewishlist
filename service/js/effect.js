// Page-build effect (ported from the personal wishlist). Off by default; each person turns it on in Appearance.
// Cursors build the page part by part, then everything removes itself. If anything breaks, the covers are removed.
let ran = false;
export function runEffect() {
  if (ran) return; ran = true;
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  // Cursor icons (the "pic").
  var arrow = function (fill, edge) { return '<svg viewBox="0 0 18 18"><path d="M2 1l13 7-6 1.5L6.5 16z" fill="' + fill + '" stroke="' + edge + '" stroke-width="1.3" stroke-linejoin="round"/></svg>'; };
  var cross  = '<svg viewBox="0 0 18 18"><path d="M9 1v16M1 9h16" stroke="#1A1A1A" stroke-width="3.2" stroke-linecap="round"/><path d="M9 1v16M1 9h16" stroke="#FFD166" stroke-width="1.6" stroke-linecap="round"/></svg>';
  var wifi   = '<svg viewBox="0 0 18 18" fill="none" stroke="#7BDFF2" stroke-width="2.4" stroke-linecap="round"><path d="M1.5 6.5a11 11 0 0 1 15 0"/><path d="M4.5 9.7a6.8 6.8 0 0 1 9 0"/><path d="M7.4 12.8a2.6 2.6 0 0 1 3.2 0"/><circle cx="9" cy="15.6" r="1" fill="#7BDFF2"/></svg>';
  var target = '<svg viewBox="0 0 18 18"><circle cx="9" cy="9" r="6.5" fill="#B8F2A0" stroke="#1A1A1A" stroke-width="1.4"/><circle cx="9" cy="9" r="2" fill="#1A1A1A"/></svg>';
  var smile  = '<svg viewBox="0 0 18 18"><circle cx="9" cy="9" r="7.5" fill="#C9A7FF" stroke="#1A1A1A" stroke-width="1.4"/><circle cx="6.3" cy="7.5" r="1" fill="#1A1A1A"/><circle cx="11.7" cy="7.5" r="1" fill="#1A1A1A"/><path d="M5.5 11a4 4 0 0 0 7 0" fill="none" stroke="#1A1A1A" stroke-width="1.4" stroke-linecap="round"/></svg>';

  // Each character: name, label colour, icon, HOW it builds (how), speed (bigger = slower), box look.
  var COMMON = [
    { name: 'balish',        color: '#FF7EC0', text: '#1A1A1A', icon: arrow('#FF7EC0', '#1A1A1A'), how: 'drag',   speed: 1,   box: 'border:1.5px dashed var(--ink);background:rgba(255,126,192,.14)' },
    { name: 'balright',      color: '#FFD166', text: '#1A1A1A', icon: cross,                      how: 'sweepX', speed: 0.9, box: 'border:2px solid var(--ink);background:rgba(255,209,102,.2)' },
    { name: 'iwantfreewifi', color: '#7BDFF2', text: '#1A1A1A', icon: wifi,                       how: 'center', speed: 1.1, box: 'border:1.5px dotted var(--ink);background:rgba(123,223,242,.2)' },
    { name: 'wifipls',       color: '#B8F2A0', text: '#1A1A1A', icon: target,                     how: 'sweepY', speed: 1,   box: 'border:3px double var(--ink);background:rgba(184,242,160,.22)' },
    { name: 'c:',            color: '#C9A7FF', text: '#1A1A1A', icon: smile,                      how: 'pop',    speed: 0.7, box: 'border:1.5px solid var(--ink);border-radius:12px;background:rgba(201,167,255,.22)' },
    { name: 'OSCS',          color: '#FFB36B', text: '#1A1A1A', icon: '<svg viewBox="0 0 18 18"><path d="M9 1l8 8-8 8-8-8z" fill="#FFB36B" stroke="#1A1A1A" stroke-width="1.4" stroke-linejoin="round"/></svg>', how: 'rtl', speed: 0.95, box: 'border:2px dashed var(--ink);background:rgba(255,179,107,.2)' },
    { name: 'BMR',           color: '#5AA9FF', text: '#1A1A1A', icon: '<svg viewBox="0 0 18 18"><path d="M10.5 1L3 10h5l-1 7 8-9.5H10z" fill="#5AA9FF" stroke="#1A1A1A" stroke-width="1.2" stroke-linejoin="round"/></svg>', how: 'btt', speed: 0.85, box: 'border:2px solid #5AA9FF;background:rgba(90,169,255,.16)' },
    { name: 'plugaz',        color: '#9AE6B4', text: '#1A1A1A', icon: '<i class="swemoji">🔌</i>', how: 'drag', speed: 0.8, box: 'border:2px solid var(--ink);box-shadow:3px 3px 0 var(--ink);background:rgba(154,230,180,.2)' },
    { name: 'ARK',  color: '#FF9F43', text: '#1A1A1A', icon: arrow('#FF9F43', '#1A1A1A'), how: 'sweepY', speed: 0.9, box: 'border:2px dashed #FF9F43;background:rgba(255,159,67,.18)' },
    { name: 'Y2X',  color: '#A77BFF', text: '#1A1A1A', icon: '<svg viewBox="0 0 18 18"><path d="M9 1l2.4 5.4 5.9.6-4.4 4 1.3 5.8L9 13.7l-5.2 3.1 1.3-5.8-4.4-4 5.9-.6z" fill="#A77BFF" stroke="#1A1A1A" stroke-width="1.2" stroke-linejoin="round"/></svg>', how: 'pop', speed: 0.8, box: 'border:2px dotted #A77BFF;border-radius:12px;background:rgba(167,123,255,.18)' },
    { name: 'SNY',  color: '#FFE45C', text: '#1A1A1A', icon: '<svg viewBox="0 0 18 18"><path d="M9 2l8 14H1z" fill="#FFE45C" stroke="#1A1A1A" stroke-width="1.3" stroke-linejoin="round"/></svg>', how: 'center', speed: 1, box: 'border:2px solid #E0B800;background:rgba(255,228,92,.22)' },
    { name: 'NSR',  color: '#1A1A1A', text: '#FFFFFF', icon: '<svg viewBox="0 0 18 18"><path d="M3 3h12v12H3z" fill="#1A1A1A" stroke="#FFFFFF" stroke-width="1.4" stroke-linejoin="round"/></svg>', how: 'snap', speed: 0.6, box: 'border:3px solid var(--ink);background:rgba(0,0,0,.08)' },
    { name: 'YBG',  color: '#A9754F', text: '#FFFFFF', icon: '<svg viewBox="0 0 18 18"><circle cx="9" cy="9" r="7" fill="#A9754F" stroke="#1A1A1A" stroke-width="1.3"/><circle cx="9" cy="9" r="2.5" fill="#FFFFFF"/></svg>', how: 'rtl', speed: 1.05, box: 'border:2px dashed #A9754F;background:rgba(169,117,79,.18)' },
    { name: 'JDAB', color: '#4CD38A', text: '#1A1A1A', icon: '<svg viewBox="0 0 18 18"><path d="M9 1l7 4v8l-7 4-7-4V5z" fill="#4CD38A" stroke="#1A1A1A" stroke-width="1.3" stroke-linejoin="round"/></svg>', how: 'sweepX', speed: 0.9, box: 'border:3px double #2E9E64;background:rgba(76,211,138,.18)' },
    { name: 'RED',  color: '#FF5A5A', text: '#1A1A1A', icon: '<svg viewBox="0 0 18 18"><path d="M3 3l12 12M15 3L3 15" stroke="#1A1A1A" stroke-width="4" stroke-linecap="round"/><path d="M3 3l12 12M15 3L3 15" stroke="#FF5A5A" stroke-width="2.2" stroke-linecap="round"/></svg>', how: 'drag', speed: 0.75, box: 'border:2px solid #FF5A5A;background:rgba(255,90,90,.16)' }
  ];
  // Rare easter eggs: about 1 in 8 new cursors, and never two of the same at once.
  var RARE = [
    { name: 'porsche', color: '#FF9AD5', text: '#1A1A1A', icon: '<i class="swemoji">🩷</i>', how: 'center', speed: 1.5, box: 'border:2px solid #FF4FA3;border-radius:14px;background:rgba(255,79,163,.16)' },
    { name: 'L',      color: '#1A1A1A', text: '#FFFFFF', icon: arrow('#FF7EC0', '#1A1A1A'), how: 'snap',   speed: 0.5, box: 'border:3px solid var(--ink);background:rgba(0,0,0,.07)' },
    { name: '',       color: '',        text: '',        icon: '<i class="swemoji">🫶</i>', how: 'pop',    speed: 1,   box: 'border:2px solid #FF7EC0;border-radius:20px;background:rgba(255,126,192,.2)' },
    { name: 'xv_xvvl', color: '#FF9AD5', text: '#1A1A1A', icon: '<i class="swemoji">💗</i>', how: 'center', speed: 1.5, box: 'border:2px solid #FF4FA3;border-radius:14px;background:rgba(255,79,163,.16)' }
  ];
  var FLY = 550, DRAW = 800;            // ms per move / per box
  var MAX = 8;                          // cursors working at the same time
  var ease = function (t) { return 1 - Math.pow(1 - t, 3); };

  start();

  function start() {
    window.scrollTo(0, 0);
    // Every part of the page we cover and build. Found as the page draws, because the list loads late.
    var targets = [];
    var scanUntil = 0;     // keep looking for new parts of the page until this time

    // The layer that holds the covers, boxes and cursors.
    var layer = document.createElement('div');
    layer.id = 'swlayer';
    layer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(layer);

    // A white cover sits over each part of the page until a cursor finishes building it.
    function scan() {                  // cover any part of the page that has no cover yet
      // Big parts first (the card), then each small part inside an item: name, price, picture, each detail label and value, buttons.
      document.querySelectorAll('h1, aside > *, .row, .row .name, .row .price, .row .pic').forEach(function (el) {
        if (el.__sw) return;
        if (el.getBoundingClientRect().height <= 4) return;
        var cv = document.createElement('div');
        cv.className = 'swcover';
        layer.appendChild(cv);
        el.__sw = true;
        targets.push({ el: el, cover: cv, x: -1, y: -1, w: 0, h: 0, claimed: false, done: false,
          el2: null,
          k: el.matches('.row, aside > *') ? 1 : 0.4 });            // k: small parts build faster
      });
    }
    function sync() {                  // keep every cover glued to its part of the page, top to bottom
      // The layer is exactly as tall as the page and clips everything outside it, so flying cursors
      // can never make the page wider or taller (that is what made scrolling shake).
      var wrap = document.getElementById('app');
      var pageH = Math.round(wrap ? wrap.getBoundingClientRect().bottom + pageYOffset : innerHeight);
      if (layer.__h !== pageH) { layer.__h = pageH; layer.style.height = pageH + 'px'; }
      var live = [];
      targets.forEach(function (t) {   // first read every position...
        if (t.done) return;
        if (!t.el.isConnected) { t.done = true; t.claimed = true; t.cover.remove(); return; }   // page redrew it
        var r = t.el.getBoundingClientRect(), l = r.left, tp = r.top, rt = r.right, b = r.bottom;
        if (t.el2) {
          var r2 = t.el2.getBoundingClientRect();
          l = Math.min(l, r2.left); tp = Math.min(tp, r2.top); rt = Math.max(rt, r2.right); b = Math.max(b, r2.bottom);
        }
        live.push([t, l + pageXOffset, tp + pageYOffset, rt - l, b - tp]);
      });
      live.forEach(function (a) {      // ...then write, and only when something really moved
        var t = a[0], s = t.cover.style;
        if (Math.abs(t.x - a[1]) < 0.5 && Math.abs(t.y - a[2]) < 0.5 && Math.abs(t.w - a[3]) < 0.5 && Math.abs(t.h - a[4]) < 0.5) return;
        t.x = a[1]; t.y = a[2]; t.w = a[3]; t.h = a[4];
        s.left = t.x - 2 + 'px'; s.top = t.y - 2 + 'px'; s.width = t.w + 4 + 'px'; s.height = t.h + 4 + 'px';
      });
      targets.sort(function (a, b) { return a.y - b.y; });
    }

    var cursors = [], spawned = 0, lastSpawn = 0, lastSync = 0;

    // The topmost target that is unclaimed and has scrolled into view (or above it).
    function peek() {
      var bottom = pageYOffset + innerHeight;
      for (var i = 0; i < targets.length; i++) {
        if (!targets[i].claimed && !targets[i].done && targets[i].y < bottom) return targets[i];
      }
      return null;
    }
    // Regular cursors all show an arrow in their own colour. Only the wifi one and the easter eggs keep their own icon.
    function iconFor(g) {
      if (g.name === 'wifipls') return wifi;     // wifipls shares iwantfreewifi's wifi icon
      if (COMMON.indexOf(g) < 0 || g.name === 'iwantfreewifi') return g.icon;
      return arrow(g.color, g.color === '#1A1A1A' ? '#FFFFFF' : '#1A1A1A');
    }
    function spawn(now) {              // a new cursor drops in from the top of the screen
      var g = COMMON[Math.floor(Math.random() * COMMON.length)];   // names can repeat
      spawned++;
      if (Math.random() < 0.125) {     // rare easter egg, unless that one is already on screen
        var r = RARE[Math.floor(Math.random() * RARE.length)];
        if (!cursors.some(function (o) { return o.ch === r; })) g = r;
      }
      var el = document.createElement('div');
      el.className = 'swc';
      el.innerHTML = iconFor(g) + (g.name ? '<span style="background:' + g.color + ';color:' + g.text + '">' + g.name + '</span>' : '');
      layer.appendChild(el);
      var c = { el: el, ch: g, x: 20 + Math.random() * innerWidth * 0.7, y: pageYOffset - 30, phase: 'idle', t0: now, box: null, tgt: null };
      cursors.push(c);
      lastSpawn = now;
    }
    function give(c, now) {            // hand a cursor the next target, or send it away
      var t = peek();
      if (!t) { c.phase = 'leave'; c.t0 = now; c.el.style.opacity = '0'; return; }
      t.claimed = true;
      c.tgt = t;
      c.fx = c.x; c.fy = c.y; c.phase = 'fly'; c.t0 = now;
    }
    function put(c, x, y) { c.x = x; c.y = y; c.el.style.transform = 'translate(' + x + 'px,' + y + 'px)'; }

    function frame(now) {
      try {
      if (!scanUntil) scanUntil = now + 6000;
      if (now - lastSync > 60) {       // not every frame: measuring the whole page every frame made scrolling jerky
        if (now < scanUntil) scan();   // cover new parts as they appear
        sync();
        lastSync = now;
      }
      // Parts the user scrolled far past are simply shown, so nothing stays hidden.
      targets.forEach(function (t) {
        if (!t.claimed && !t.done && t.y + t.h < pageYOffset - 40) { t.claimed = true; t.done = true; t.cover.remove(); }
      });
      // New cursor when there is something to build and room for one (one per 400ms).
      if (cursors.length < MAX && peek() && now - lastSpawn > 250) spawn(now);

      cursors.slice().forEach(function (c) {
        if (c.phase === 'idle') give(c, now);
        if (c.phase === 'leave') {
          put(c, c.x + 3, c.y - 4);
          if (now - c.t0 > 450) { c.el.remove(); cursors.splice(cursors.indexOf(c), 1); }
        }
        if (c.phase === 'fly') {           // fly to the top-left corner of the target
          var t = Math.min((now - c.t0) / (FLY * c.tgt.k), 1), e = ease(t);
          put(c, c.fx + (c.tgt.x - c.fx) * e, c.fy + (c.tgt.y - c.fy) * e);
          if (t >= 1) {
            c.box = document.createElement('div');
            c.box.className = 'swbox';
            c.box.style.cssText = 'left:' + c.tgt.x + 'px;top:' + c.tgt.y + 'px;width:0;height:0;' + c.ch.box;
            layer.insertBefore(c.box, layer.firstChild);
            c.phase = 'draw'; c.t0 = now;
          }
        } else if (c.phase === 'draw') {   // drag to the bottom-right corner, growing the box
          var t2 = Math.min((now - c.t0) / (DRAW * c.ch.speed * c.tgt.k), 1), e2 = ease(t2);
          var T = c.tgt, b = c.box.style, w, h;
          if (c.ch.how === 'sweepX') {          // full height, sweeps left to right
            b.width = T.w * e2 + 'px'; b.height = T.h + 'px';
            put(c, T.x + T.w * e2, T.y + T.h / 2);
          } else if (c.ch.how === 'sweepY') {   // full width, sweeps top to bottom
            b.width = T.w + 'px'; b.height = T.h * e2 + 'px';
            put(c, T.x + T.w / 2, T.y + T.h * e2);
          } else if (c.ch.how === 'center') {   // grows outward from the middle
            w = T.w * e2; h = T.h * e2;
            b.left = T.x + (T.w - w) / 2 + 'px'; b.top = T.y + (T.h - h) / 2 + 'px';
            b.width = w + 'px'; b.height = h + 'px';
            put(c, T.x + (T.w + w) / 2, T.y + (T.h + h) / 2);
          } else if (c.ch.how === 'pop') {      // appears full size and pops up
            b.width = T.w + 'px'; b.height = T.h + 'px';
            b.transform = 'scale(' + (0.6 + 0.4 * e2) + ')';
            put(c, T.x + T.w / 2, T.y + T.h / 2);
          } else if (c.ch.how === 'rtl') {      // sweeps right to left
            w = T.w * e2;
            b.left = T.x + T.w - w + 'px'; b.width = w + 'px'; b.height = T.h + 'px';
            put(c, T.x + T.w - w, T.y + T.h / 2);
          } else if (c.ch.how === 'btt') {      // sweeps bottom to top
            h = T.h * e2;
            b.top = T.y + T.h - h + 'px'; b.width = T.w + 'px'; b.height = h + 'px';
            put(c, T.x + T.w / 2, T.y + T.h - h);
          } else if (c.ch.how === 'snap') {     // no animation, the box just lands
            b.width = T.w + 'px'; b.height = T.h + 'px';
            put(c, T.x + T.w, T.y + T.h);
          } else {                               // drag: corner to corner
            b.width = T.w * e2 + 'px'; b.height = T.h * e2 + 'px';
            put(c, T.x + T.w * e2, T.y + T.h * e2);
          }
          if (t2 >= 1) {
            var tg = c.tgt, bx = c.box;
            tg.cover.style.opacity = '0';                              // the real page shows through
            setTimeout(function () { bx.style.opacity = '0'; }, 150);  // the dashed box fades
            setTimeout(function () { tg.cover.remove(); bx.remove(); }, 800);
            tg.done = true;
            give(c, now);
          }
        }
      });
      // Everything built and every cursor gone: remove the whole thing.
      var allDone = targets.every(function (t) { return t.done; });
      if (now > scanUntil && allDone && !cursors.length) { setTimeout(function () { layer.remove(); }, 900); return; }
      } catch (err) { layer.remove(); return; }   // if anything breaks, never leave the page covered
      requestAnimationFrame(frame);
    }
    scan(); sync();                    // cover what is already on the page before the first paint
    requestAnimationFrame(frame);
  }
}
