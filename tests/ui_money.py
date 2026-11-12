import time, subprocess, json
from playwright.sync_api import sync_playwright
srv = subprocess.Popen(['python3','-m','http.server','8123','--bind','127.0.0.1'],cwd='/home/claude/iwantfreewishlist',stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
time.sleep(1)
BASE='http://localhost:8123/service/index.html'
res=[]; errs=[]
def ok(name,cond,extra=''):
    res.append((name,bool(cond))); print(('PASS ' if cond else 'FAIL ')+name,extra if not cond else '')
def txt(pg): return pg.inner_text('#app')
def mock(pg, fail=()):   # the exchange-rate source is mocked: the real one is not reachable from the test box
    def h(route):
        u=route.request.url
        if any('symbols='+c in u for c in fail): return route.abort()
        sym=u.split('symbols=')[1]; rate={'USD':0.0277,'EUR':0.0255}[sym]
        route.fulfill(status=200,content_type='application/json',headers={'access-control-allow-origin':'*'},body=json.dumps({'amount':1,'base':'THB','date':'2026-11-12','rates':{sym:rate}}))
    pg.route('https://api.frankfurter.dev/**',h)
try:
  with sync_playwright() as p:
    b=p.chromium.launch()
    oc=b.new_context(viewport={'width':390,'height':844}); oc.grant_permissions(['clipboard-read','clipboard-write'],origin='http://localhost:8123')
    O=oc.new_page(); O.on('pageerror',lambda e:errs.append(str(e))); O.on('dialog',lambda d:d.accept()); O.goto(BASE+'?emu=1'); O.wait_for_selector('text=Continue with Google')
    with O.expect_popup() as pop: O.click('button:has-text("Continue with Google")')
    po=pop.value; po.wait_for_load_state(); po.click('text=Add new account'); po.click('text=Auto-generate user information'); po.click('button:has-text("Sign in with Google")')
    O.wait_for_selector('text=Pick a name',timeout=20000); O.fill('input[name=name]','mika'); O.click('button:has-text("Save name")')
    O.wait_for_selector('text=Create my list'); O.click('text=Create my list'); O.wait_for_selector("text=mika's list")
    for name,price in [('Black bag','2400'),('Watch','900')]:
        O.click('button:has-text("Add an item")'); O.wait_for_selector('h1:has-text("Add an item")')
        ok('0 price label shows the list currency','Price (฿)' in txt(O)) if name=='Black bag' else None
        O.fill('input[name=name]',name); O.fill('input[name=price]',price); O.click('button:has-text("Save")'); O.wait_for_selector('text=Saved.',timeout=15000)
    O.click('button:has-text("Copy share link")'); lid=O.evaluate('navigator.clipboard.readText()').split('?l=')[1].split('&')[0]
    SHARE=BASE+'?emu=1&l='+lid
    F=b.new_context(viewport={'width':390,'height':844}).new_page(); F.on('pageerror',lambda e:errs.append(str(e))); mock(F,fail=['EUR'])
    F.goto(SHARE); F.wait_for_selector('text=Black bag')
    ok('1 friend starts in the list currency, owner prices', '฿2,400' in txt(F) and 'around $' not in txt(F))
    F.select_option('select[name=cur]','USD'); F.wait_for_selector('text=around $63–$70')
    ok('2 converted as a rough range, with the real price beside it', 'around $63–$70 (฿2,400)' in txt(F), txt(F)[:400])
    ok('3 disclaimer shows (rough, about 5%, date, check the shop)', all(x in txt(F) for x in ['rough guesses','5%','2026-11-12','Check the shop']))
    F.fill('input[name=budget]','30'); F.press('input[name=budget]','Tab'); F.wait_for_selector('text=1 item is over your budget')
    ok('4 budget hides the item that is too expensive', F.locator('.row:has-text("Black bag")').count()==0 and F.locator('.row:has-text("Watch")').count()==1)
    F.screenshot(path='/tmp/money_friend.png')
    F.click('button:has-text("Show all")'); F.wait_for_selector('text=Black bag')
    ok('5 Show all brings it back', 'Black bag' in txt(F))
    F.select_option('select[name=cur]','EUR'); F.wait_for_selector('text=Could not get the exchange rate')
    ok('6 rate failure: owner prices kept, plain message', '฿2,400' in txt(F) and 'around €' not in txt(F))
    F.select_option('select[name=cur]','USD'); F.wait_for_selector('text=around $63–$70')
    F.reload(); F.wait_for_selector('text=around $63–$70',timeout=15000)
    ok('7 friend currency is remembered on the device', True)
    # owner changes the list currency to USD
    O.select_option('select[name=listcur]','USD'); O.wait_for_selector('text=$2,400',timeout=15000)
    ok('8 owner changes list currency; prices use its symbol', '$2,400' in txt(O))
    O.click('button:has-text("Add an item")'); O.wait_for_selector('h1:has-text("Add an item")'); ok('9 edit form label follows the currency','Price ($)' in txt(O))
    ok('10 no page errors', not errs, errs)
    b.close()
finally:
  srv.terminate()
print('TOTAL',sum(1 for _,c in res if c),'/',len(res))
