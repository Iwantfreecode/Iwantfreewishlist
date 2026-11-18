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
    # --- the ends: the card fights you, a ring fills, a full pull loops with a shuffle ---
    tswipe(int(cx+15),int(cx-15)); ok('a quick 30 px flick at the last picture does NOT loop (needs a full pull)',cnt()=='4/4',cnt())
    tswipe(int(cx+8),int(cx-7)); ok('a short drag at the last picture does NOT loop (stays 4/4)',cnt()=='4/4',cnt())
    cdp=ctx.new_cdp_session(pg)
    def touch(t_,x_=None): cdp.send('Input.dispatchTouchEvent',{'type':t_,'touchPoints':[] if x_ is None else [{'x':x_,'y':cy}]}); time.sleep(.05)
    ind=lambda: pg.evaluate("(()=>{const e=document.querySelector('.row .thumb .loopind');return {o:parseFloat(e.style.opacity||0),ready:e.classList.contains('ready'),off:parseFloat(e.querySelector('.bar').style.strokeDashoffset)};})()")
    topT=lambda: pg.evaluate("(()=>{const cs=[...document.querySelectorAll('.row .thumb .card')];return cs[cs.length-1].style.transform;})()")
    touch('touchStart',int(cx+24)); touch('touchMove',int(cx+4)); touch('touchMove',int(cx-4))     # finger moved 28 px: not far enough yet
    i1=ind(); ok('pulling at the end: the ring shows and is not full yet',i1['o']>0 and not i1['ready'],i1)
    touch('touchMove',int(cx-24))                                                                    # finger moved 48 px: far enough
    i2=ind(); ok('pulled far enough: the ring is full and turns solid',i2['ready'] and i2['off']<1,i2)
    pulled=topT(); ok('at the end the card moves at about a third of the finger (48 px finger, 16.8 px card)',pulled.startswith('translateX(-16.8'),pulled)
    pg.screenshot(path='/tmp/emu/pull_ready.png',clip={'x':box['x']-30,'y':box['y']-20,'width':box['width']+60,'height':box['height']+40})
    TOPS_JS="(()=>{window.__tops=[];window.__t0=performance.now();window.__done=null;window.__started=false;const f=()=>{const cs=[...document.querySelectorAll('.row .thumb .card')];let best=-1,bz=-1e9;cs.forEach((c,i)=>{const z=parseInt(getComputedStyle(c).zIndex)||0;if(parseFloat(getComputedStyle(c).opacity)>0.3&&z>bz){bz=z;best=i;}});const L=window.__tops;if(L[L.length-1]!==best)L.push(best);const run=cs.some(c=>c.getAnimations().length>0);if(run)window.__started=true;if(window.__started&&!run&&window.__done===null)window.__done=performance.now()-window.__t0;if(performance.now()-window.__t0<2400)requestAnimationFrame(f);};requestAnimationFrame(f);})()"
    pg.evaluate(TOPS_JS)                                                           # watches which picture is on top, every screen frame
    touch('touchEnd'); time.sleep(.12)
    ok('letting go loops with the go-under animation (cards are animating)',pg.evaluate("[...document.querySelectorAll('.row .thumb .card')].some(c=>c.getAnimations().length>0)"))
    for k in range(6):                                                              # frames of the animation, for a contact sheet by eye
        pg.screenshot(path=f'/tmp/emu/shuffle_{k}.png',clip={'x':box['x']-30,'y':box['y']-20,'width':box['width']+60,'height':box['height']+40}); time.sleep(.1)
    time.sleep(1.7)
    ok('the animation ends and the first picture is on top (1/4)',cnt()=='1/4' and not pg.evaluate("[...document.querySelectorAll('.row .thumb .card')].some(c=>c.getAnimations().length>0)"),cnt())
    ok('ring is hidden again',ind()['o']==0,ind())
    tops=pg.evaluate('window.__tops'); done=pg.evaluate('window.__done')
    ok('from the last picture the pictures go under one after another: 4, 3, 2, 1 (top picture over time)',tops==[3,2,1,0],tops)
    ok('the whole loop takes about 0.6 s (0.4 to 0.9 s)',done is not None and 400<done<900,done)
    ok('looping did not open the big viewer',pg.locator('#viewer').count()==0)
    pg.evaluate(TOPS_JS); tswipe(int(cx-30),int(cx+30)); ok('a full pull at the first picture loops back to the last (4/4)',cnt()=='4/4',cnt())
    time.sleep(1.3); tops=pg.evaluate('window.__tops'); ok('from the first picture the pictures go under one after another: 1, 2, 3, 4',tops==[0,1,2,3],tops)
    tswipe(int(cx-5),int(cx+25)); tswipe(int(cx+20),int(cx-20)); time.sleep(1.7)      # two quick swipes while the animation is still playing
    ok('swiping during the animation works (3/4 then 4/4) and nothing is left animating',cnt()=='4/4' and not pg.evaluate("[...document.querySelectorAll('.row .thumb .card')].some(c=>c.getAnimations().length>0)"),cnt())
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
