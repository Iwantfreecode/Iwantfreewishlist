import time, subprocess
from playwright.sync_api import sync_playwright
srv=subprocess.Popen(['python3','-m','http.server','8123','--bind','127.0.0.1'],cwd='/home/claude/iwantfreewishlist',stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
URL='http://localhost:8123/service/index.html?emu=1'
res=[]
def ok(n,c,x=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ')+n,'' if c else x)
try:
  with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_context(viewport={'width':390,'height':844}).new_page(); pg.on('dialog',lambda d:d.accept())
    errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(URL); pg.wait_for_selector('text=Continue with Google')
    with pg.expect_popup() as pop: pg.click('button:has-text("Continue with Google")')
    po=pop.value; po.wait_for_load_state(); po.wait_for_timeout(1500)
    if po.locator('text=Add new account').count(): po.click('text=Add new account')
    po.click('text=Auto-generate user information'); po.click('button:has-text("Sign in with Google")')
    pg.wait_for_selector('text=Pick a name'); pg.fill('input[name=name]','looker'); pg.click('button:has-text("Save name")')
    pg.wait_for_selector('text=Create my list'); pg.click('text=Create my list'); pg.wait_for_selector("text=looker's list")
    for t in ['Cologne','Hoodie']:
        pg.click('button:has-text("Add an item")'); pg.fill('input[name=name]',t); pg.fill('input[name=price]','100'); pg.click('button:has-text("Save")'); pg.wait_for_selector('text=Saved.')
    fs=lambda sel='.row .name': pg.evaluate("s=>parseFloat(getComputedStyle(document.querySelector(s)).fontSize)",sel)
    base=fs()
    pg.click('button:has-text("Appearance")'); pg.wait_for_selector('.dialog:has-text("Appearance")')
    ok('Medium selected by default',pg.locator('.sizes button[aria-pressed=true]').inner_text()=='Medium')
    sizes={}
    for label,key in [('Small','small'),('Large','large'),('Super large','xl'),('Medium','medium')]:
        pg.click(f'.sizes button:has-text("{label}")'); time.sleep(.2)
        ok(f'{label}: data-size={key}',pg.evaluate("document.documentElement.dataset.size")==key)
        sizes[key]=fs()
    print(sizes)
    ok('sizes grow small<medium<large<xl',sizes['small']<sizes['medium']<sizes['large']<sizes['xl'],sizes)
    ok('medium keeps the old size',abs(sizes['medium']-base)<0.01,(sizes['medium'],base))
    pg.click('.sizes button:has-text("Super large")'); time.sleep(.5)
    ok('header still fits the phone (no sideways scroll)',pg.evaluate("document.documentElement.scrollWidth<=window.innerWidth+1"),pg.evaluate("document.documentElement.scrollWidth"))
    pg.click('button:has-text("Done")'); pg.screenshot(path='/tmp/emu/xl_list.png')
    ok('xl: header buttons stay on one line',pg.evaluate("[...document.querySelectorAll('header.top .topr button')].every(b=>b.getBoundingClientRect().height<50)"))
    ok('xl: no sideways scroll on the list',pg.evaluate("document.documentElement.scrollWidth<=window.innerWidth+1"),pg.evaluate("document.documentElement.scrollWidth"))
    pg.reload(); pg.wait_for_selector("text=looker's list"); ok('size survives reload',pg.evaluate("document.documentElement.dataset.size")=='xl')
    pg.evaluate("localStorage.clear()"); pg.reload(); pg.wait_for_selector("text=looker's list"); time.sleep(1)
    ok('size comes back from the account',pg.evaluate("document.documentElement.dataset.size")=='xl')
    # text layout: highlight of chosen options
    pg.click('button:has-text("Appearance")'); pg.click('.sizes button:has-text("Medium")'); pg.click('button:has-text("Plain text")'); time.sleep(.3)
    def hl(text): 
        return pg.evaluate("t=>{const b=[...document.querySelectorAll('.dialog .seg button')].find(x=>x.textContent.trim()===t);const cs=getComputedStyle(b);return [b.getAttribute('aria-pressed'),cs.borderTopStyle,getComputedStyle(b,'::before').content]}",text)
    ok('text layout: Plain text shows [ ] and solid border',hl('Plain text')==['true','solid','"["'],hl('Plain text'))
    ok('text layout: Medium highlighted',hl('Medium')[0]=='true' and hl('Medium')[2]=='"["',hl('Medium'))
    ok('text layout: unchosen App is dotted, no bracket',hl('App')[1]=='dotted' and hl('App')[2] in ('none','normal'),hl('App'))
    pg.click('button:has-text("Dark")'); pg.click('button:has-text("Typewriter")'); time.sleep(.3)
    ok('text layout: Dark + Typewriter highlighted',hl('Dark')[0]=='true' and hl('Typewriter')[0]=='true' and hl('Dark')[2]=='"["')
    pg.screenshot(path='/tmp/emu/text_dialog.png',full_page=False)
    pg.click('button:has-text("Reset to Rose")'); time.sleep(.3)
    ok('reset puts size back to medium and layout to app',pg.evaluate("document.documentElement.dataset.size+document.documentElement.dataset.layout")=='mediumapp')
    ok('no page errors',not errs,errs[:2])
finally: srv.terminate()
print('TOTAL',sum(res),'/',len(res))
