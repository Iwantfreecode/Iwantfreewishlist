import time, subprocess
from playwright.sync_api import sync_playwright
srv=subprocess.Popen(['python3','-m','http.server','8123','--bind','127.0.0.1'],cwd='/home/claude/iwantfreewishlist',stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
URL='http://localhost:8123/service/index.html?emu=1'
res=[]
def ok(n,c,x=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ')+n,'' if c else x)
try:
  with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':390,'height':844}); O=ctx.new_page(); O.on('dialog',lambda d:d.accept())
    O.goto(URL); O.wait_for_selector('text=Continue with Google')
    with O.expect_popup() as pop: O.click('button:has-text("Continue with Google")')
    po=pop.value; po.wait_for_load_state(); po.wait_for_timeout(1500)
    if po.locator('text=Add new account').count(): po.click('text=Add new account')
    po.click('text=Auto-generate user information'); po.click('button:has-text("Sign in with Google")')
    O.wait_for_selector('text=Pick a name'); O.fill('input[name=name]','sowner'); O.click('button:has-text("Save name")')
    O.wait_for_selector('text=Create my list'); O.click('text=Create my list'); O.wait_for_selector("text=sowner's list")
    O.click('button:has-text("Add an item")'); O.fill('input[name=name]','Cap'); O.fill('input[name=price]','50'); O.click('button:has-text("Save")'); O.wait_for_selector('text=Saved.')
    ctx.grant_permissions(['clipboard-read','clipboard-write'],origin='http://localhost:8123')
    O.click('button:has-text("Copy share link")'); O.wait_for_selector('text=Link copied'); link=O.evaluate('navigator.clipboard.readText()')
    B=b.new_context(viewport={'width':390,'height':844}).new_page(); B.on('dialog',lambda d:d.accept())
    errs=[]; B.on('pageerror',lambda e:errs.append(str(e)))
    B.goto(link+'&emu=1'); B.wait_for_selector('button.pill'); B.click('button.pill'); B.click('text=Press here to create new account')
    B.fill('input[name=name]','sbob'); B.fill('input[name=pass]','secret1'); B.click('button:has-text("Create account")'); B.wait_for_selector('text=Change that name in Account',timeout=20000)
    cdp=B.context.new_cdp_session(B); cdp.send('Network.enable'); cdp.send('Network.emulateNetworkConditions',{'offline':False,'latency':900,'downloadThroughput':-1,'uploadThroughput':-1})
    B.click('[aria-label="Tick Cap"]')
    B.wait_for_selector('.row .tick span.saving',timeout=3000); ok('spinner on the tick circle while saving',True)
    ok('"Saving…" text shown',B.locator('.row .status.saving:has-text("Saving")').count()==1)
    B.wait_for_selector('.row .tick span.on-mine:not(.saving)',timeout=30000); ok('spinner gone, tick shown',B.locator('.row .tick span.saving').count()==0)
    ok('"You are buying this" shown after',B.locator('text=You are buying this').count()==1)
    B.screenshot(path='/tmp/emu/saving_done.png')
    # untick shows saving too
    B.click('[aria-label="Untick Cap"]'); B.wait_for_selector('.row .tick span.saving',timeout=3000); ok('spinner on untick',True)
    B.wait_for_selector('.row .tick span:not(.saving):not(.on-mine)',timeout=30000); ok('untick finishes',B.locator('[aria-label="Tick Cap"]').count()==1)
    # fast double tap: queue works, ends ticked once
    cdp.send('Network.emulateNetworkConditions',{'offline':False,'latency':0,'downloadThroughput':-1,'uploadThroughput':-1})
    B.click('[aria-label="Tick Cap"]'); B.wait_for_selector('.row .tick span.on-mine:not(.saving)',timeout=20000)
    ok('no page errors',not errs,errs[:2])
finally: srv.terminate()
print('TOTAL',sum(res),'/',len(res))
