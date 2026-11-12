# A tick that cannot be saved must not stay on screen (no "phantom tick"). Needs the emulators (see README).
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
    O.wait_for_selector('text=Pick a name'); O.fill('input[name=name]','oowner'); O.click('button:has-text("Save name")')
    O.wait_for_selector('text=Create my list'); O.click('text=Create my list'); O.wait_for_selector("text=oowner's list")
    O.click('button:has-text("Add an item")'); O.fill('input[name=name]','Cap'); O.fill('input[name=price]','50'); O.click('button:has-text("Save")'); O.wait_for_selector('text=Saved.')
    ctx.grant_permissions(['clipboard-read','clipboard-write'],origin='http://localhost:8123')
    O.click('button:has-text("Copy share link")'); O.wait_for_selector('text=Link copied'); link=O.evaluate('navigator.clipboard.readText()')
    B=b.new_context(viewport={'width':390,'height':844}).new_page(); B.on('dialog',lambda d:d.accept())
    B.goto(link+'&emu=1'); B.wait_for_selector('button.pill'); B.click('button.pill'); B.click('text=Press here to create new account')
    B.fill('input[name=name]','obob'); B.fill('input[name=pass]','secret1'); B.click('button:has-text("Create account")'); B.wait_for_selector('text=Change that name in Account',timeout=20000)
    cdp=B.context.new_cdp_session(B); cdp.send('Network.enable')
    # 1. Browser says offline: no tick appears at all, plain message.
    cdp.send('Network.emulateNetworkConditions',{'offline':True,'latency':0,'downloadThroughput':-1,'uploadThroughput':-1}); B.wait_for_timeout(500)
    B.click('[aria-label="Tick Cap"]'); B.wait_for_selector('text=No connection. Your change was not saved.',timeout=3000)
    ok('offline: plain message shown',True)
    ok('offline: item still not ticked',B.locator('[aria-label="Tick Cap"]').count()==1 and B.locator('.row .tick span.on-mine').count()==0)
    cdp.send('Network.emulateNetworkConditions',{'offline':False,'latency':0,'downloadThroughput':-1,'uploadThroughput':-1}); B.wait_for_timeout(500)
    # 2. Browser says online but the server cannot be reached: the tick is queued in the browser. We must NOT say "saved".
    #    "Saving…" stays and a plain message explains. When the connection is back, it finishes and is really saved.
    B.route('**://localhost:8080/**',lambda r:r.abort())
    B.click('[aria-label="Tick Cap"]')
    B.wait_for_selector('.row .status.saving',timeout=3000)
    B.wait_for_selector('text=Still saving. Your connection is slow.',timeout=40000)
    ok('slow connection: plain message shown after a while',True)
    ok('slow connection: still says "Saving…" (never "saved" too early)',B.locator('.row .status.saving').count()==1)
    B.screenshot(path='/tmp/emu/offline_slow.png')
    B.unroute('**://localhost:8080/**')
    B.wait_for_function("!document.querySelector('.row .status.saving')",timeout=120000)
    ok('connection back: saving finishes, tick stays',B.locator('[aria-label="Untick Cap"]').count()==1 and B.locator('text=You are buying this').count()==1)
    ok('connection back: slow message cleared',B.locator('text=Still saving').count()==0)
    # 3. The tick is really on the server: a fresh load of the page still shows it.
    B.reload(); B.wait_for_selector('[aria-label="Untick Cap"]',timeout=30000)
    ok('really saved: still ticked after reload',True)
finally: srv.terminate()
print('TOTAL',sum(res),'/',len(res))
