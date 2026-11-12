import time, subprocess
from playwright.sync_api import sync_playwright
srv = subprocess.Popen(['python3','-m','http.server','8123','--bind','127.0.0.1'],cwd='/home/claude/iwantfreewishlist',stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
time.sleep(1)
BASE='http://localhost:8123/service/index.html'
res=[]
def ok(name,cond,extra=''):
    res.append((name,bool(cond))); print(('PASS ' if cond else 'FAIL ')+name,extra if not cond else '')
def txt(pg): return pg.inner_text('#app')
errs=[]
def newpage(ctx):
    pg=ctx.new_page(); pg.on('dialog',lambda d:d.accept()); pg.on('pageerror',lambda e:errs.append(str(e))); return pg
def google_owner(ctx,name):
    pg=newpage(ctx); pg.goto(BASE+'?emu=1'); pg.wait_for_selector('text=Continue with Google')
    with pg.expect_popup() as pop: pg.click('button:has-text("Continue with Google")')
    po=pop.value; po.wait_for_load_state(); po.click('text=Add new account'); po.click('text=Auto-generate user information'); po.click('button:has-text("Sign in with Google")')
    pg.wait_for_selector('text=Pick a name',timeout=20000); pg.fill('input[name=name]',name); pg.click('button:has-text("Save name")')
    return pg
def add_item(pg,name):
    pg.click('button:has-text("Add an item")'); pg.wait_for_selector('h1:has-text("Add an item")')
    pg.fill('input[name=name]',name); pg.click('button:has-text("Save")'); pg.wait_for_selector('text=Saved.',timeout=15000)
try:
  with sync_playwright() as p:
    b=p.chromium.launch()
    octx=b.new_context(viewport={'width':390,'height':844}); octx.grant_permissions(['clipboard-read','clipboard-write'],origin='http://localhost:8123')
    O=google_owner(octx,'mika')
    O.wait_for_selector('text=Create my list'); O.click('text=Create my list'); O.wait_for_selector("text=mika's list")
    add_item(O,'Gift A'); add_item(O,'Gift B')
    O.wait_for_selector('text=Gift B')
    ok('1 owner switch starts OFF', 'Guests can tick without an account: OFF' in txt(O))
    O.click('button:has-text("Copy share link")'); link=O.evaluate('navigator.clipboard.readText()'); lid=link.split('?l=')[1].split('&')[0]
    SHARE=BASE+'?emu=1&l='+lid
    G=newpage(b.new_context(viewport={'width':390,'height':844})); G.goto(SHARE); G.wait_for_selector('text=Gift A')
    G.click('button[aria-label="Sign in to tick Gift A"]'); G.wait_for_selector('.overlay')
    ok('2 guest door hidden while owner switch is OFF', 'Continue as guest' not in txt(G))
    G.close()
    O.click('button:has-text("Guests can tick without an account")'); O.wait_for_selector('text=Guests can tick without an account: ON',timeout=15000)
    ok('3 owner turns it ON', True)
    O.reload(); O.wait_for_selector('text=Gift A'); ok('3b switch stays ON after reload', 'account: ON' in txt(O))
    # guest 1
    gctx=b.new_context(viewport={'width':390,'height':844}); G1=newpage(gctx); G1.goto(SHARE); G1.wait_for_selector('text=Gift A')
    ok('4 friend line shows owner name', 'List by mika. Tick what you are buying' in txt(G1))
    G1.click('button[aria-label="Sign in to tick Gift A"]'); G1.wait_for_selector('text=Continue as guest')
    G1.click('button:has-text("Continue as guest")')
    ok('5 empty guest name is refused', G1.locator('input[name=gname]:invalid').count()==1)
    G1.fill('input[name=gname]','Pim'); G1.click('button:has-text("Continue as guest")')
    G1.wait_for_selector('button[aria-label="Tick Gift A"]',timeout=20000)
    ok('6 guest signed in, no Sign out button', 'Sign out' not in txt(G1))
    G1.click('button[aria-label="Tick Gift A"]'); G1.wait_for_selector('text=You are buying this',timeout=15000); time.sleep(1)
    G1.wait_for_function("!document.querySelector('.status.saving')",timeout=15000)
    ok('7 guest ticked an item', 'You are buying this' in txt(G1))
    G1.click('.ownersees button:has-text("Pim")'); time.sleep(1.5)
    G1.reload(); G1.wait_for_selector('text=You are buying this',timeout=20000)
    ok('8 guest still ticked after reload (same guest)', 'You are buying this' in txt(G1))
    O.reload(); O.wait_for_selector('text=Gift A'); O.wait_for_selector('text=Pim (guest) is buying this',timeout=15000)
    ok('9 owner sees "Pim (guest)"', True)
    # guest 2
    G2=newpage(b.new_context(viewport={'width':390,'height':844})); G2.goto(SHARE); G2.wait_for_selector('text=Gift A')
    G2.click('button[aria-label="Sign in to tick Gift B"]'); G2.fill('input[name=gname]','Mai'); G2.click('button:has-text("Continue as guest")')
    G2.wait_for_selector('text=Someone is buying this',timeout=20000)
    ok('10 second guest sees Gift A as taken', 'Someone is buying this' in txt(G2))
    # owner removes the claim (big warning first)
    O.reload(); O.wait_for_selector('text=Pim (guest) is buying this',timeout=15000)
    O.click('button[aria-label="Remove the claim on Gift A"]'); O.wait_for_selector('.dialog.big')
    ok('10b big warning shows, button is off until the box is ticked', 'Warning' in txt(O) and O.locator('.dialog.big button:has-text("Remove the claim")').is_disabled())
    O.click('.dialog.big button:has-text("Keep it")'); ok('10c Keep it leaves the claim', 'Pim (guest) is buying this' in txt(O))
    O.click('button[aria-label="Remove the claim on Gift A"]'); O.check('.dialog.big input[name=sure]'); O.click('.dialog.big button:has-text("Remove the claim")')
    O.wait_for_selector('text=The claim on "Gift A" was removed.',timeout=15000)
    ok('10d claim removed for the owner', 'Pim (guest) is buying this' not in txt(O))
    G1.reload(); G1.wait_for_selector('button[aria-label="Tick Gift A"]',timeout=20000)
    ok('10e guest sees the item free again', 'You are buying this' not in txt(G1))
    G1.click('button[aria-label="Tick Gift A"]'); G1.wait_for_selector('text=You are buying this',timeout=15000); time.sleep(1.5)
    # owner turns OFF
    O.click('button:has-text("Guests can tick without an account")'); O.wait_for_selector('text=account: OFF',timeout=15000)
    G2.click('button[aria-label="Tick Gift B"]'); time.sleep(2.5)
    ok('11 new tick refused when OFF', 'You are buying this' not in txt(G2), txt(G2)[:200])
    G1.reload(); G1.wait_for_selector('text=You are buying this',timeout=20000)
    G1.click('button[aria-label="Untick Gift A"]'); time.sleep(2)
    ok('12 guest can still untick when OFF', 'You are buying this' not in txt(G1))
    G1.click('button[aria-label="Tick Gift B"]'); time.sleep(2)  # may be refused
    # leave
    G2.click('button:has-text("Account")'); G2.wait_for_selector('text=Remove my ticks and leave')
    G2.click('button:has-text("Remove my ticks and leave")'); G2.wait_for_selector('text=Gift A',timeout=20000); time.sleep(1)
    ok('13 guest leaves, back to signed-out list', 'Sign in' in txt(G2) and 'Pim' not in txt(G2))
    ok('14 no page errors', not errs, errs)
    b.close()
finally:
  srv.terminate()
print('TOTAL',sum(1 for _,c in res if c),'/',len(res))
