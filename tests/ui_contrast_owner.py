# Real contrast check: every visible text on the friend view and the sign-in dialog, for 8 themes x light/dark x 2 layouts.
import time, subprocess, json, sys
from playwright.sync_api import sync_playwright
srv = subprocess.Popen(['python3','-m','http.server','8123','--bind','127.0.0.1'],cwd='/home/claude/iwantfreewishlist',stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
time.sleep(1)
BASE='http://localhost:8123/service/index.html'
THEMES=['Rose','Clay','Honey','Moss','Teal','Ocean','Plum','Ink']
JS = r"""
() => {
  const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const L = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const over = (top, bot) => ({ r: top.r * top.a + bot.r * (1 - top.a), g: top.g * top.a + bot.g * (1 - top.a), b: top.b * top.a + bot.b * (1 - top.a), a: 1 });
  const bgOf = (el) => { const stack = []; let n = el; let skip = false;
    while (n) { const cs = getComputedStyle(n); if (cs.backgroundImage !== 'none' && !cs.backgroundImage.startsWith('url')) skip = true;
      const c = parse(cs.backgroundColor); if (c && c.a > 0) { stack.push(c); if (c.a === 1) break; } n = n.parentElement; }
    let base = { r: 255, g: 255, b: 255, a: 1 }; while (stack.length) base = over(stack.pop(), base); return { base, skip }; };
  const out = []; const seen = new Set();
  const walker = document.createTreeWalker(document.getElementById('app'), NodeFilter.SHOW_TEXT);
  let t; while ((t = walker.nextNode())) {
    const txt = t.nodeValue.trim(); if (!txt) continue; const el = t.parentElement; if (!el) continue;
    const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden') continue;
    let op = 1; for (let n = el; n; n = n.parentElement) op *= Number(getComputedStyle(n).opacity);
    const fg0 = parse(cs.color); if (!fg0) continue; const { base, skip } = bgOf(el);
    const fg = over({ ...fg0, a: fg0.a * op }, base);
    const l1 = L(fg), l2 = L(base); const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    const px = parseFloat(cs.fontSize), bold = parseInt(cs.fontWeight) >= 700; const large = px >= 24 || (px >= 18.66 && bold);
    const key = (el.className || el.tagName) + '|' + txt.slice(0, 24); if (seen.has(key)) continue; seen.add(key);
    out.push({ txt: txt.slice(0, 30), cls: String(el.className || el.tagName), ratio: Math.round(ratio * 100) / 100, need: large ? 3 : 4.5, skip });
  }
  // control rings (checkbox circles, inputs): 3:1 against the page
  document.querySelectorAll('.tick span, input, select, textarea, .seg button').forEach((el) => {
    const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); if (!r.width) return;
    const b = parse(cs.borderTopColor); if (!b || b.a === 0 || parseFloat(cs.borderTopWidth) === 0) return;
    const { base } = bgOf(el.parentElement); const f = over(b, base);
    const l1 = L(f), l2 = L(base); out.push({ txt: '[border]', cls: String(el.className || el.tagName), ratio: Math.round((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05) * 100) / 100, need: 3, skip: false });
  });
  return out;
}
"""
fails={}; checked=0; skipped=0
def collect(pg,layout,mode,th,screen):
    global checked,skipped
    for r in pg.evaluate(JS):
        if r['skip']: skipped+=1; continue
        checked+=1
        if r['ratio']<r['need']: fails.setdefault((screen,r['cls'],r['txt']),[]).append((layout,mode,th,r['ratio'],r['need']))
try:
  with sync_playwright() as p:
    b=p.chromium.launch()
    oc=b.new_context(viewport={'width':390,'height':844}); oc.grant_permissions(['clipboard-read','clipboard-write'],origin='http://localhost:8123')
    O=oc.new_page(); O.goto(BASE+'?emu=1'); O.wait_for_selector('text=Continue with Google')
    with O.expect_popup() as pop: O.click('button:has-text("Continue with Google")')
    po=pop.value; po.wait_for_load_state(); po.click('text=Add new account'); po.click('text=Auto-generate user information'); po.click('button:has-text("Sign in with Google")')
    O.wait_for_selector('text=Pick a name',timeout=20000); O.fill('input[name=name]','mika'); O.click('button:has-text("Save name")')
    O.wait_for_selector('text=Create my list'); O.click('text=Create my list'); O.wait_for_selector("text=mika's list")
    for name,pri,price in [('Black bag','must','2400'),('Watch','want','900')]:
        O.click('button:has-text("Add an item")'); O.wait_for_selector('h1:has-text("Add an item")'); O.fill('input[name=name]',name); O.fill('input[name=price]',price)
        O.select_option('select[name=priority]',pri); O.fill('input[name=tags]','bag, gift'); O.click('button:has-text("Save")'); O.wait_for_selector('text=Saved.',timeout=15000)
    for layout in ['app','text']:
      for mode in ['light','dark']:
        for th in THEMES:
          O.evaluate("v=>localStorage.setItem('sv_prefs',v)", json.dumps({'theme':mode,'scheme':th,'layout':layout}))
          O.reload(); O.wait_for_selector('text=Black bag'); time.sleep(.2)
          collect(O,layout,mode,th,'owner list')
          for label,wait,screen in [('Add an item','h1:has-text("Add an item")','edit form'),('Tags','h1:has-text("Tags")','tags'),('Account','h1:has-text("mika")','account'),('Import items','h1:has-text("Import")','import')]:
            O.click('button:has-text("%s")'%label); O.wait_for_selector(wait,timeout=10000); time.sleep(.15); collect(O,layout,mode,th,screen)
            O.click('button:has-text("Back")'); O.wait_for_selector('text=Black bag')
    b.close()
finally:
  srv.terminate()
print('CHECKED',checked,'values; skipped',skipped)
if not fails: print('ALL PASS')
for k,v in sorted(fails.items(), key=lambda kv:-len(kv[1])):
    worst=min(v,key=lambda x:x[3]); print('FAIL',k,len(v),'combos; worst',worst)
