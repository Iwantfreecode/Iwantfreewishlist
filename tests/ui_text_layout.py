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
    pg.click('button:has-text("Appearance")'); pg.wait_for_selector('.dialog:has-text("Appearance")')
    pg.click('button:has-text("Plain text")'); pg.screenshot(path='tx_look.png')
    ok('theme tiles have no dots in text', pg.evaluate("getComputedStyle(document.querySelector('.themetile .dots')).display")=='none')
    ok('theme tile border square', pg.evaluate("getComputedStyle(document.querySelector('.themetile')).borderRadius")=='0px')
    pg.click('button:has-text("Done")'); time.sleep(.5)
    pg.screenshot(path='tx_list.png', full_page=True)
    ok('row is text row', pg.locator('.row.tx').count()>0)
    ok('name uses mono font', 'Courier' in pg.evaluate("getComputedStyle(document.querySelector('.row.tx .name')).fontFamily"))
    ok('tabs show counts', pg.locator('.tabs button:has-text("All (")').count()==1)
    pg.click('button:has-text("Account")'); time.sleep(.4); pg.screenshot(path='tx_account.png'); pg.click('button:has-text("Back")')
    pg.click('button:has-text("Tags")'); time.sleep(.4); pg.screenshot(path='tx_tags.png'); pg.click('button:has-text("Back")')
    pg.click('button:has-text("Add an item")'); time.sleep(.4); pg.screenshot(path='tx_edit.png', full_page=True); pg.click('button:has-text("Back")')
    pg.click('button:has-text("Rename list")'); time.sleep(.3); pg.screenshot(path='tx_rename.png'); pg.click('button:has-text("Cancel")')
    pg.evaluate("localStorage.setItem('sv_prefs', JSON.stringify({...JSON.parse(localStorage.getItem('sv_prefs')),theme:'dark'}))"); pg.reload(); pg.wait_for_selector('.row.tx'); pg.screenshot(path='tx_dark.png')
    ok('no page errors', not errs, errs[:2])
    b.close()
finally: srv.terminate()
print('TOTAL',sum(res),'/',len(res))
