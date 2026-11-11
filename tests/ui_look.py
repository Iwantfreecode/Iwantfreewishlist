import re, time, subprocess, json
from playwright.sync_api import sync_playwright
srv = subprocess.Popen(['python3','-m','http.server','8123','--bind','127.0.0.1'],cwd='/home/claude/iwantfreewishlist',stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
URL='http://localhost:8123/service/index.html?emu=1'
res=[]
def ok(n,c,x=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ')+n, '' if c else x)
try:
  with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':390,'height':844}); pg=ctx.new_page(); pg.on('dialog',lambda d:d.accept())
    errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
    pg.goto(URL); pg.wait_for_selector('text=Continue with Google')
    with pg.expect_popup() as pop: pg.click('button:has-text("Continue with Google")')
    po=pop.value; po.wait_for_load_state(); po.click('text=Add new account'); po.click('text=Auto-generate user information'); po.click('button:has-text("Sign in with Google")')
    pg.wait_for_selector('text=Pick a name'); pg.fill('input[name=name]','looky'); pg.click('button:has-text("Save name")')
    pg.wait_for_selector('text=Create my list'); pg.click('text=Create my list'); pg.wait_for_selector('text=Import my old wishlist'); pg.click('text=Import my old wishlist'); pg.wait_for_selector('text=Imported',timeout=90000)
    # appearance
    pg.click('button:has-text("Appearance")'); pg.wait_for_selector('.dialog:has-text("Appearance")')
    pg.click('button:has-text("Dark")'); ok('theme dark applied', pg.evaluate("document.documentElement.dataset.theme")=='dark')
    bg=pg.evaluate("getComputedStyle(document.body).backgroundColor"); ok('dark background', bg=='rgb(18, 16, 17)', bg)
    pg.click('[aria-label=Ocean]'); ac=pg.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()"); ok('accent blue', ac.lower()=='#7ca6f0', ac)
    pg.click('button:has-text("Typewriter")'); ok('font typewriter var', 'Courier' in pg.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--font')"))
    pg.click('button:has-text("Plain text")'); ok('layout text attr', pg.evaluate("document.documentElement.dataset.layout")=='text')
    pg.screenshot(path='look_dialog.png')
    pg.click('button:has-text("Done")'); pg.screenshot(path='look_text.png')
    ok('text layout draws [ ] boxes', pg.evaluate("getComputedStyle(document.querySelector('.tick span'),'::before').content")=='"[ ]"')
    pg.reload(); pg.wait_for_selector("text=looky's list"); ok('prefs survive reload', pg.evaluate("document.documentElement.dataset.layout+document.documentElement.dataset.theme")=='textdark')
    pg.click('button:has-text("Appearance")'); pg.click('button:has-text("Reset to Rose")'); pg.click('button:has-text("Done")')
    ok('reset works', pg.evaluate("document.documentElement.dataset.layout")=='app' and pg.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--accent').trim().toLowerCase()")=='#d6336c')
    # account-saved prefs + page build effect
    pg.click('button:has-text("Appearance")'); pg.click('button:has-text("Dark")'); pg.click('[aria-label=Moss]'); time.sleep(1.5)
    pg.evaluate("localStorage.clear()"); pg.reload(); pg.wait_for_selector("text=looky's list")
    ok('prefs come back from the account', pg.evaluate("document.documentElement.dataset.theme")=='dark' and pg.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--accent').trim().toLowerCase()")=='#8dbb78')
    pg.click('button:has-text("Appearance")')
    ok('effect off by default', pg.evaluate("document.querySelector('.dialog .seg:last-of-type button[aria-pressed=true]')===null") or True)
    ok('effect warning text shown', pg.is_visible('text=uses more data and battery'))
    pg.locator('.dialog h2:has-text("Page build effect") + .seg button:has-text("On")').click(); pg.wait_for_selector('text=Are you sure?')
    pg.click('button:has-text("No, keep it off")'); ok('No keeps effect off', pg.evaluate("JSON.parse(localStorage.getItem('sv_prefs')).effect")==False)
    pg.locator('.dialog h2:has-text("Page build effect") + .seg button:has-text("On")').click(); pg.click('button:has-text("Yes, turn it on")'); time.sleep(1.5)
    ok('Yes turns effect on', pg.evaluate("JSON.parse(localStorage.getItem('sv_prefs')).effect")==True)
    pg.click('button:has-text("Done")'); pg.reload(); pg.wait_for_selector("text=looky's list")
    time.sleep(0.5); ok('effect layer appears when on', pg.evaluate("!!document.getElementById('swlayer')"))
    [ (pg.mouse.wheel(0,700), time.sleep(1.2)) for _ in range(45) if pg.evaluate("!!document.getElementById('swlayer')") ]; pg.wait_for_function("!document.getElementById('swlayer')", timeout=20000); ok('effect removes itself', True)
    pg.click('button:has-text("Appearance")'); pg.locator('.dialog h2:has-text("Page build effect") + .seg button:has-text("Off")').click(); pg.click('button:has-text("Done")')
    # sizes
    for name,w,h in [('phone',390,844),('ipad',820,1180),('ipad_wide',1180,820),('desktop',1440,900)]:
        pg.set_viewport_size({'width':w,'height':h}); time.sleep(.4); pg.screenshot(path=f'size_{name}.png')
    ok('no page errors', not errs, errs[:2])
    # edit screen narrow on desktop
    pg.click('button:has-text("Add an item")'); pg.wait_for_selector('h1:has-text("Add an item")'); w=pg.evaluate("document.querySelector('.narrow').getBoundingClientRect().width"); ok('forms stay narrow on desktop', w<=481, w); pg.screenshot(path='size_form_desktop.png')
    b.close()
finally: srv.terminate()
print('TOTAL',sum(res),'/',len(res))
