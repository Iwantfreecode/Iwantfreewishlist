import re, time, subprocess, json
from playwright.sync_api import sync_playwright
srv = subprocess.Popen(['python3','-m','http.server','8123','--bind','127.0.0.1'],cwd='/home/claude/iwantfreewishlist',stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
time.sleep(1)
BASE='http://localhost:8123/service/index.html'
URL=BASE+'?emu=1'
res=[]
def ok(name,cond,extra=''):
    res.append((name,bool(cond))); print(('PASS ' if cond else 'FAIL ')+name,extra if not cond else '')
def txt(pg): return pg.inner_text('#app')
def google(ctx,url,name=None):
    pg=ctx.new_page(); pg.on('dialog',lambda d:d.accept())
    pg.goto(url)
    if '?l=' in url or '&l=' in url:
        pg.wait_for_selector('button.pill'); pg.click('button.pill')
    pg.wait_for_selector('text=Continue with Google')
    with pg.expect_popup() as pop: pg.click('button:has-text("Continue with Google")')
    po=pop.value; po.wait_for_load_state(); po.click('text=Add new account'); po.click('text=Auto-generate user information'); po.click('button:has-text("Sign in with Google")')
    if name:
        pg.wait_for_selector('text=Pick a name',timeout=20000); pg.fill('input[name=name]',name); pg.click('button:has-text("Save name")')
    return pg
def add_item(pg,name,price='',pri='want',tags='',extra=None):
    pg.click('button:has-text("Add an item")'); pg.wait_for_selector('h1:has-text("Add an item")')
    pg.fill('input[name=name]',name)
    if price: pg.fill('input[name=price]',price)
    pg.select_option('select[name=priority]',pri)
    if tags: pg.fill('input[name=tags]',tags)
    if extra: extra(pg)
    pg.click('button:has-text("Save")'); pg.wait_for_selector('text=Saved.',timeout=15000)
try:
  with sync_playwright() as p:
    b=p.chromium.launch()
    # ---------- owner ----------
    O=google(b.new_context(viewport={'width':390,'height':844}),URL,'mika')
    O.wait_for_selector('text=Create my list'); O.click('text=Create my list'); O.wait_for_selector("text=mika's list")
    add_item(O,'Travel bag','2400','should','bag, travel bag')
    add_item(O,'Laptop bag','1890','must','bag, laptop bag')
    add_item(O,'Big case','900','want','bag')
    add_item(O,'Cologne','2900','want','cologne')
    add_item(O,'Hoodie','1200','want','clothes',lambda pg: pg.check('input[name=repeat]'))
    add_item(O,'Photo thing','500','someday','pic',lambda pg: pg.set_input_files('input[name=pic]','/tmp/emu/big.jpg'))
    ok('1 six items added', '0 of 6' in txt(O), txt(O)[:120])
    ok('2 sorted by priority groups', txt(O).index('Must have')<txt(O).index('Need this')<txt(O).index('Want'))
    # picture stored small
    time.sleep(1)
    pic=O.evaluate("document.querySelector('.row .thumb img') && document.querySelector('.row .thumb img').src.length")
    ok('3 picture shown, under 60000 chars', pic and 1000<pic<=60000, pic)
    # edit item
    O.click('.row:has-text("Cologne") >> text=Edit'); O.wait_for_selector('h1:has-text("Edit item")')
    O.fill('input[name=price]','3100'); O.fill('textarea[name=note]','Blue one'); O.click('button:has-text("Save")'); O.wait_for_selector('text=Saved.')
    ok('4 edit saved', '฿3,100' in txt(O) and 'Blue one' in txt(O))
    # reorder: move Big case up within Want
    O.click('button:has-text("Reorder")'); 
    before=O.eval_on_selector_all('.row .name','els=>els.map(e=>e.textContent)')
    O.click('.row:has-text("Cologne") >> [aria-label="Move up"]'); time.sleep(1)
    after=O.eval_on_selector_all('.row .name','els=>els.map(e=>e.textContent)')
    ok('5 reorder moves item', before!=after, (before,after))
    # tags: joint
    O.click('button:has-text("Tags")'); O.wait_for_selector('h1:has-text("Tags")')
    O.check('input[name=rep][value="clothes"]'); O.click('button:has-text("Save repeatable tags")'); O.wait_for_selector('text=Tags saved.')
    O.fill('input[name=jname]','big bag'); O.check('input[name=jt][value="travel bag"]'); O.check('input[name=jt][value="laptop bag"]'); O.click('button:has-text("Add joint tag")'); time.sleep(2); print('MSG', O.locator('.msg').all_inner_texts(), 'JOINTS', O.locator('.row-sm').all_inner_texts()); O.wait_for_selector('text=big bag = laptop bag + travel bag',timeout=15000)
    ok('6 repeatable + joint tag saved', True)
    O.click('text=Back')
    O.context.grant_permissions(['clipboard-read','clipboard-write'],origin='http://localhost:8123')
    O.click('button:has-text("Copy share link")'); O.wait_for_selector('text=Link copied')
    link=O.evaluate('navigator.clipboard.readText()'); ok('7b copy button puts the link in the clipboard', '?l=' in link, link)
    O.screenshot(path='/tmp/emu/owner_top.png')
    # delete an item
    add_item(O,'Temp','1','want'); O.click('.row:has-text("Temp") >> text=Edit'); O.click('button:has-text("Delete item")'); O.wait_for_selector('text=Deleted.')
    ok('7 delete item', 'Temp' not in txt(O))
    # ---------- friend bob (name + password) ----------
    cb=b.new_context(viewport={'width':390,'height':844}); B=cb.new_page(); B.on('dialog',lambda d:d.accept())
    B.goto(link+'&emu=1'); B.wait_for_selector('button.pill')
    ok('8 anonymous sees list + Sign in button at top, no edit buttons', 'Travel bag' in txt(B) and B.locator('text=Add an item').count()==0 and B.locator('.overlay').count()==0)
    B.click('button.pill'); B.wait_for_selector('.overlay'); B.screenshot(path='/tmp/emu/dialog.png')
    ok('8b dialog has new wording', B.locator('text=Press here to create new account').count()==1)
    B.click('text=Press here to create new account'); B.fill('input[name=name]','bob'); B.fill('input[name=pass]','secret1'); B.click('button:has-text("Create account")')
    B.wait_for_selector('text=Change that name in Account',timeout=20000)
    B.click('[aria-label="Tick Travel bag"]'); B.wait_for_selector("text=You are buying this",timeout=15000)
    ok('9 bob ticks Travel bag', True)
    ok('10 small note on Laptop bag (shares only "bag")', 'you are buying a Travel bag item with the same bag tag' in txt(B), txt(B)[:400])
    B.click('[aria-label="Tick Laptop bag"]'); B.wait_for_selector('.row:has-text("Laptop bag") >> text=You are buying',timeout=15000)
    ok('11 small note: no popup, tick goes through', B.locator('.overlay').count()==0)
    B.click('[aria-label="Tick Big case"]'); B.wait_for_selector('.overlay',timeout=10000)
    ok('12 big popup for item whose only tag is already picked', 'Travel bag' in B.inner_text('.overlay'))
    B.click('button:has-text("Go back")'); ok('13 go back leaves it unticked', B.locator('[aria-label="Tick Big case"]').count()==1)
    B.click('[aria-label="Tick Hoodie"]'); B.wait_for_selector('.row:has-text("Hoodie") >> text=You are buying',timeout=15000)
    # ---------- friend carl (Google) sees bob's ticks ----------
    C=google(b.new_context(viewport={'width':390,'height':844}),link+'&emu=1','carl'); C.wait_for_selector('text=Change that name in Account',timeout=20000)
    ok('14 carl sees Travel bag taken', C.locator('.row:has-text("Travel bag") >> text=someone is buying this').count()==1)
    ok('15 carl can still tick repeat item Hoodie', C.locator('[aria-label="Tick Hoodie"]').count()==1)
    C.click('[aria-label="Tick Hoodie"]'); C.wait_for_selector('[aria-label="Untick Hoodie"]',timeout=15000)
    C.set_viewport_size({'width':1180,'height':820}); time.sleep(.5); C.screenshot(path='/tmp/emu/friend_ipad.png'); C.set_viewport_size({'width':390,'height':844}); time.sleep(.3); C.screenshot(path='/tmp/emu/friend_phone.png')
    ok('15b second ticker of a repeat item can untick (regression)', True)
    # ---------- owner sees open ticks ----------
    O.reload(); O.wait_for_selector("text=mika's list")
    ok('16 owner sees ticks as someone', O.locator('.row:has-text("Travel bag") >> text=someone is buying this').count()==1)
    ok('17 owner never sees names of tickers', 'bob' not in txt(O).replace('big bag',''))
    # ---------- show my name (per item) ----------
    B.click('.row:has-text("Travel bag") .seg2 button:has-text("bob")'); time.sleep(2)
    O.reload(); O.wait_for_selector("text=mika's list")
    ok('18 named item: owner sees bob; other items stay someone', O.locator('.row:has-text("Travel bag") >> text=bob is buying this').count()==1 and O.locator('.row:has-text("Hoodie") >> text=someone is buying this').count()==1)
    B.reload(); B.wait_for_selector('text=Change that name in Account'); B.wait_for_selector("text=You are buying this")
    ok('19 bob still sees his own ticks, box stays checked', B.locator("text=You are buying this").count()>=2 and B.locator('.row:has-text("Travel bag") .seg2 button[aria-pressed=true]').inner_text()=='bob')
    C.reload(); C.wait_for_selector('text=Change that name in Account')
    ok('20 carl still sees them as someone', C.locator('.row:has-text("Travel bag") >> text=someone is buying this').count()==1)
    B.click('button:has-text("Account")'); B.fill('input[name=shown]','Bobby'); B.click('button:has-text("Save shown name")'); time.sleep(2); B.click('text=Back')
    B.click('.row:has-text("Travel bag") .seg2 button:has-text("someone")'); time.sleep(1.5); B.click('.row:has-text("Travel bag") .seg2 button:nth-child(2)'); time.sleep(2)
    O.reload(); O.wait_for_selector("text=mika's list")
    ok('21 shown name Bobby is what the owner sees', O.locator('.row:has-text("Travel bag") >> text=Bobby is buying this').count()==1 and 'bob is buying' not in txt(O))
    B.click('.row:has-text("Travel bag") .seg2 button:has-text("someone")'); time.sleep(2)
    O.reload(); O.wait_for_selector("text=mika's list")
    ok('21b unchecked: owner sees someone again', O.locator('.row:has-text("Travel bag") >> text=someone is buying this').count()==1)
    ok('21c owner can rename list', (O.click('button:has-text("Rename list")'), O.fill('input[name=title]','Mika wishes'), O.click('button:has-text("Save")'), O.wait_for_selector('h1:has-text("Mika wishes")', timeout=10000))[3] is not None)
    # untick
    B.click('[aria-label="Untick Travel bag"]'); time.sleep(2); B.reload(); B.wait_for_selector('text=Change that name in Account')
    ok('22 untick frees item', B.locator('[aria-label="Tick Travel bag"]').count()==1)
    # ---------- race: bob and carl tick same item ----------
    B.click('[aria-label="Tick Cologne"]'); B.wait_for_selector('.row:has-text("Cologne") >> text=You are buying',timeout=15000)
    time.sleep(1.5)   # the page shows the tick at once; give the server write time to land before carl tries
    C.click('[aria-label="Tick Cologne"]'); time.sleep(2)
    ok('23 carl cannot tick what bob took (conflict message)', 'Someone just ticked that one.' in txt(C), txt(C)[-200:])
    # ---------- bob deletes his account ----------
    B.click('text=Account'); B.fill('input[name=confirm]','bob'); B.fill('input[name=pass]','secret1'); B.click('button:has-text("Delete my account")')
    B.wait_for_selector('text=Continue with Google',timeout=30000)
    ok('24 bob account deleted -> welcome', True)
    B2=b.new_context().new_page(); B2.on('dialog',lambda d:d.accept()); B2.goto(link+'&emu=1'); B2.wait_for_selector('button.pill'); B2.click('button.pill')
    B2.click('text=Press here to create new account'); B2.fill('input[name=name]','bob'); B2.fill('input[name=pass]','secret2'); B2.click('button:has-text("Create account")'); B2.wait_for_selector('text=Change that name in Account',timeout=20000)
    ok('25 name freed: bob can sign up again', True)
    ok('26 bob old ticks are gone', B2.locator('.row:has-text("Cologne") >> text=someone is buying this').count()==0)
    # ---------- import old list ----------
    I=google(b.new_context(viewport={'width':390,'height':844}),URL,'imp1'); I.wait_for_selector('text=Create my list'); I.click('text=Create my list'); I.wait_for_selector('text=Import my old wishlist')
    I.click('text=Import my old wishlist'); I.wait_for_selector('text=Imported',timeout=90000)
    old=json.load(open('/home/claude/iwantfreewishlist/wishlist.json')); n=len([x for x in old['items'] if not x.get('example')])
    ok('27 old list imported', f'Imported {n} items' in txt(I), txt(I)[-120:])
    I.reload(); I.wait_for_selector("text=imp1's list"); ok('28 import survives reload', f'0 of {n}' in txt(I), txt(I)[:200])
    ok('29 import (http local base) shows no unsafe picture', I.locator('.row .thumb img').count()==0)
    # ---------- owner deletes account ----------
    import urllib.request
    H={'Authorization':'Bearer owner','Content-Type':'application/json'}
    def rq(url,data=None):
        r=urllib.request.Request(url,data=data,headers=H,method='POST' if data else 'GET'); return json.load(urllib.request.urlopen(r))
    docs=rq('http://127.0.0.1:8080/v1/projects/wishlist-service-39517/databases/(default)/documents/users')['documents']
    uid=[d['name'].split('/')[-1] for d in docs if d['fields']['name']['stringValue']=='mika'][0]
    accs=rq('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/wishlist-service-39517/accounts:query',b'{}')['userInfo']
    email=[a['email'] for a in accs if a['localId']==uid][0]
    O.click('text=Account'); O.fill('input[name=confirm]','mika')
    with O.expect_popup() as pop: O.click('button:has-text("Delete my account")')
    po=pop.value; po.wait_for_load_state(); po.click('text='+email)
    O.wait_for_selector('text=Continue with Google',timeout=40000)
    ok('30 owner deleted account', True)
    A=b.new_context().new_page(); A.goto(link+'&emu=1'); A.wait_for_selector('text=List not found',timeout=15000)
    ok('31 deleted list is gone', True)
    M=google(b.new_context(),URL,'mika'); M.wait_for_selector('text=Create my list',timeout=20000)
    ok('32 name mika is free again', True)
except Exception as e:
    import traceback; traceback.print_exc()
finally:
  srv.terminate()
print('TOTAL', sum(1 for _,v in res if v), '/', len(res))
