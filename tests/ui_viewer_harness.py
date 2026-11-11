import subprocess,time
from playwright.sync_api import sync_playwright
srv=subprocess.Popen(['python3','-m','http.server','8124','--bind','127.0.0.1'],cwd='/tmp/vt',stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
res=[]
def ok(n,c,x=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ')+n,'' if c else x)
try:
  with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':390,'height':844},has_touch=True); pg=ctx.new_page()
    errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('http://127.0.0.1:8124/index.html'); pg.click('#go'); pg.wait_for_selector('#viewer img')
    cnt=lambda: pg.inner_text('.vcount')
    ok('opens on 1 / 4',cnt()=='1 / 4',cnt())
    ok('dots hidden state: 4 dots',pg.locator('.vdots i').count()==4)
    ok('back hint hidden on first',pg.eval_on_selector('.vhint.left','e=>e.style.visibility')=='hidden')
    pg.mouse.click(350,400); time.sleep(.4); ok('tap right = next',cnt()=='2 / 4',cnt())
    pg.mouse.click(40,400); time.sleep(.4); ok('tap left = back',cnt()=='1 / 4',cnt())
    pg.mouse.click(40,400); time.sleep(.4); ok('tap left on first stays',cnt()=='1 / 4',cnt())
    # swipe left via touch events
    def swipe(x0,x1):
        cdp=ctx.new_cdp_session(pg)
        for t,x in [('touchStart',x0),('touchMove',(x0+x1)//2),('touchMove',x1),('touchEnd',x1)]:
            cdp.send('Input.dispatchTouchEvent',{'type':t,'touchPoints':[] if t=='touchEnd' else [{'x':x,'y':400}]}); time.sleep(.03)
        time.sleep(.5)
    swipe(300,60); ok('swipe left = next',cnt()=='2 / 4',cnt())
    swipe(60,300); ok('swipe right = back',cnt()=='1 / 4',cnt())
    swipe(200,170); ok('tiny drag does not turn page',cnt()=='1 / 4',cnt())
    pg.keyboard.press('ArrowRight'); pg.keyboard.press('ArrowRight'); pg.keyboard.press('ArrowRight'); time.sleep(.5)
    ok('arrows reach last',cnt()=='4 / 4',cnt())
    pg.wait_for_function("document.querySelectorAll('.vcell')[3].textContent.includes('could not')",timeout=5000); ok('dead link shows message',True)
    ok('next hint hidden on last',pg.eval_on_selector('.vhint.right','e=>e.style.visibility')=='hidden')
    pg.screenshot(path='/tmp/vt/last.png')
    pg.click('.vclose'); ok('close removes viewer',pg.locator('#viewer').count()==0)
    ok('body scroll restored',pg.evaluate("document.body.style.overflow")=='')
    pg.click('#go'); pg.wait_for_selector('#viewer'); pg.keyboard.press('Escape'); ok('Esc closes',pg.locator('#viewer').count()==0)
    pg.click('#go'); pg.wait_for_selector('#viewer img'); pg.screenshot(path='/tmp/vt/first.png')
    ok('no page errors',not errs,errs)
finally: srv.terminate()
print('TOTAL',sum(res),'/',len(res))
