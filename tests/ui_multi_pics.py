import time, subprocess, json, urllib.request
from playwright.sync_api import sync_playwright
srv=subprocess.Popen(['python3','-m','http.server','8123','--bind','127.0.0.1'],cwd='/home/claude/iwantfreewishlist',stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
URL='http://localhost:8123/service/index.html?emu=1'
res=[]
def ok(n,c,x=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ')+n,'' if c else x)
def pics_count():
    r=urllib.request.Request('http://127.0.0.1:8080/v1/projects/wishlist-service-39517/databases/(default)/documents/lists',headers={'Authorization':'Bearer owner'})
    lid=json.load(urllib.request.urlopen(r))['documents'][0]['name'].split('/')[-1]
    r=urllib.request.Request(f'http://127.0.0.1:8080/v1/projects/wishlist-service-39517/databases/(default)/documents/lists/{lid}/pics',headers={'Authorization':'Bearer owner'})
    d=json.load(urllib.request.urlopen(r)); return sorted(x['name'].split('/')[-1] for x in d.get('documents',[]))
try:
  with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':390,'height':844},has_touch=True); pg=ctx.new_page(); pg.on('dialog',lambda d:d.accept())
    errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(URL); pg.wait_for_selector('text=Continue with Google')
    with pg.expect_popup() as pop: pg.click('button:has-text("Continue with Google")')
    po=pop.value; po.wait_for_load_state(); po.click('text=Add new account'); po.click('text=Auto-generate user information'); po.click('button:has-text("Sign in with Google")')
    pg.wait_for_selector('text=Pick a name'); pg.fill('input[name=name]','multi'); pg.click('button:has-text("Save name")')
    pg.wait_for_selector('text=Create my list'); pg.click('text=Create my list'); pg.wait_for_selector("text=multi's list")
    pg.click('button:has-text("Add an item")'); pg.wait_for_selector('h1:has-text("Add an item")')
    pg.fill('input[name=name]','Bag'); pg.fill('input[name=price]','100')
    pg.set_input_files('input[name=pic]','/tmp/emu/s0.jpg'); pg.set_input_files('input[name=pic2]','/tmp/emu/s1.jpg')
    pg.fill('textarea[name=picUrls]','https://localhost:1/a.jpg\nhttps://localhost:1/b.jpg\nhttp://bad.example/c.jpg')
    pg.click('button:has-text("Save")'); time.sleep(.5); ok('bad link blocked',pg.locator('text=Each picture link must be a secure web address').count()==1)
    ok('typed name survives the error',pg.input_value('input[name=name]')=='Bag'); ok('picked file survives',pg.evaluate("document.querySelector('input[name=pic]').files.length")==1)
    pg.fill('textarea[name=picUrls]','https://localhost:1/a.jpg\nhttps://localhost:1/b.jpg')
    pg.wait_for_selector('text=Saved.',timeout=1) if False else None
    pg.click('button:has-text("Save")'); time.sleep(1)
    pg.wait_for_selector('text=Saved.',timeout=20000); time.sleep(1)
    ok('two upload docs stored',pics_count()==['i00','i00_1'],pics_count())
    badge=pg.inner_text('.row .thumb .count'); ok('badge shows 1/4',badge=='1/4',badge)
    pg.click('.row .thumb'); pg.wait_for_selector('#viewer img',timeout=10000)
    ok('viewer 1 / 4',pg.inner_text('.vcount')=='1 / 4')
    pg.mouse.click(350,400); time.sleep(.5); ok('tap right -> 2 / 4',pg.inner_text('.vcount')=='2 / 4')
    pg.wait_for_function("document.querySelectorAll('.vcell')[1].querySelector('img')",timeout=8000); ok('2nd upload image loaded',True)
    pg.mouse.click(350,400); time.sleep(.5); pg.mouse.click(350,400); time.sleep(.5)
    ok('reach 4 / 4',pg.inner_text('.vcount')=='4 / 4')
    pg.wait_for_function("document.querySelectorAll('.vcell')[3].textContent.includes('could not')",timeout=8000); ok('dead link message',True)
    pg.screenshot(path='/tmp/emu/viewer_app.png')
    pg.click('.vclose'); ok('closed',pg.locator('#viewer').count()==0)
    ok('closing viewer moves the little stack to 4/4',pg.inner_text('.row .thumb .count')=='4/4',pg.inner_text('.row .thumb .count'))
    box=pg.locator('.row .thumb').bounding_box(); cy=box['y']+box['height']/2; cx=box['x']+box['width']/2
    def tswipe(x0,x1):
        cdp=ctx.new_cdp_session(pg)
        for t,x in [('touchStart',x0),('touchMove',(x0+x1)//2),('touchMove',x1),('touchEnd',x1)]:
            cdp.send('Input.dispatchTouchEvent',{'type':t,'touchPoints':[] if t=='touchEnd' else [{'x':x,'y':cy}]}); time.sleep(.03)
        time.sleep(.5)
    cnt=lambda: pg.inner_text('.row .thumb .count')
    tswipe(int(cx-5),int(cx+25)); ok('swipe right on little stack = back (3/4)',cnt()=='3/4',cnt())
    ok('swipe did not open the big viewer',pg.locator('#viewer').count()==0)
    tswipe(int(cx+20),int(cx-20)); ok('swipe left = next (4/4)',cnt()=='4/4',cnt())
    tswipe(int(cx+20),int(cx-20)); ok('swipe left at the end stays 4/4',cnt()=='4/4',cnt())
    tswipe(int(cx-5),int(cx+25)); tswipe(int(cx-5),int(cx+25)); ok('back twice = 2/4',cnt()=='2/4',cnt())
    pg.locator('.row .thumb').tap(); pg.wait_for_selector('#viewer img',timeout=10000)
    ok('tap opens viewer on the current picture (2 / 4)',pg.inner_text('.vcount')=='2 / 4',pg.inner_text('.vcount'))
    pg.click('.vclose'); pg.screenshot(path='/tmp/emu/stack.png')
    ok('seen picture stacks up on the LEFT behind the top one', pg.evaluate("(()=>{const c=document.querySelectorAll('.row .thumb .card')[0];return c.style.transform.startsWith('translate(-7px')&&c.style.opacity==='1';})()"))
    pg.locator('.row .thumb').first.screenshot(path='/tmp/emu/stack_left.png')
    # a picture must never float on top of a popup (seen on the iPad, 2026-11-12)
    pg.set_viewport_size({'width':1180,'height':820}); time.sleep(.5)   # iPad Air landscape
    pg.click('button:has-text("Appearance")'); pg.wait_for_selector('.overlay'); time.sleep(.3)
    ok('pictures stay below the Appearance popup', pg.evaluate("(()=>{const t=document.querySelector('.row .thumb img, .row .thumb .card');const r=t.getBoundingClientRect();const e=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return !!(e&&e.closest('.overlay'));})()"))
    pg.click('.overlay >> text=Done'); time.sleep(.2)
    pg.set_viewport_size({'width':390,'height':844}); time.sleep(.3)
    pg.reload(); pg.wait_for_selector("text=multi's list"); ok('survives reload',pg.inner_text('.row .thumb .count')=='1/4')
    # edit: remove upload 2, links shrink to 1
    pg.click('.row >> text=Edit'); pg.wait_for_selector('h1:has-text("Edit item")')
    ok('links prefilled',pg.input_value('textarea[name=picUrls]').count('https://')==2)
    pg.check('input[name=removePic2]'); pg.fill('textarea[name=picUrls]','https://localhost:1/a.jpg'); pg.click('button:has-text("Save")'); pg.wait_for_selector('text=Saved.')
    time.sleep(1); ok('slot 2 doc deleted',pics_count()==['i00'],pics_count())
    ok('badge now 1/2',pg.inner_text('.row .thumb .count')=='1/2')
    # delete item removes pic docs
    pg.click('.row >> text=Edit'); pg.click('button:has-text("Delete item")'); pg.wait_for_selector('text=Deleted.'); time.sleep(1)
    ok('delete item removes pics',pics_count()==[],pics_count())
    # item with a single legacy-free link only: no badge, still opens
    pg.click('button:has-text("Add an item")'); pg.fill('input[name=name]','Solo'); pg.fill('textarea[name=picUrls]','https://localhost:1/s.jpg'); pg.click('button:has-text("Save")'); pg.wait_for_selector('text=Saved.')
    ok('single picture: no badge but opens',pg.locator('.row .thumb .count').count()==0 and pg.locator('.row .thumb').count()==1)
    ok('no page errors',not errs,errs[:2])
    b.close()
finally: srv.terminate()
print('TOTAL',sum(res),'/',len(res))
