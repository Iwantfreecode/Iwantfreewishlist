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
    pg.wait_for_selector('text=Create my list'); pg.click('text=Create my list'); pg.wait_for_selector('text=Import items')

    pg.click('button:has-text("Import items")'); pg.wait_for_selector('h1:has-text("Import items")')
    pg.fill('textarea[name=text]','- Black backpack ฿2,500 https://shop.com/bag\nNike mind 001\n[x] Body cam 680\nHeadphones 3000-3700 baht\n\n')
    pg.click('button:has-text("Preview")'); pg.wait_for_selector('.improw')
    ok('preview shows 4 rows', pg.locator('.improw').count()==4, pg.locator('.improw').count())
    ok('price parsed in preview', pg.locator('.impprice').first.input_value()=='2500', pg.locator('.impprice').first.input_value())
    pg.locator('.impname').nth(1).fill('Nike Mind 001 shoes')
    pg.locator('.improw input[type=checkbox]').nth(3).uncheck()
    ok('button counts ticked rows', pg.inner_text('#impgo')=='Add 3 items', pg.inner_text('#impgo'))
    pg.select_option('select[name=prio]','must'); pg.screenshot(path='imp_preview.png', full_page=True)
    pg.click('#impgo'); pg.wait_for_selector('text=Added 3 items')
    ok('items on the list', pg.locator('.row:has-text("Black backpack")').count()==1 and pg.locator('.row:has-text("Nike Mind 001 shoes")').count()==1)
    ok('price shown', pg.locator('.row:has-text("Black backpack")').inner_text().count('2,500')>=1, pg.locator('.row:has-text("Black backpack")').inner_text())
    ok('priority set to must', pg.locator('.sec:has-text("Must have")').count()==1)
    pg.click('.tabs button:has-text("Got")'); ok('[x] line became got', pg.locator('.row:has-text("Body cam")').count()==1); pg.click('.tabs button:has-text("All")')
    # second import: duplicates are unticked
    pg.click('button:has-text("Import items")'); pg.fill('textarea[name=text]','Black backpack 2500\nNew lamp 400'); pg.click('button:has-text("Preview")'); pg.wait_for_selector('.improw')
    ok('duplicate unticked', pg.locator('.improw input[type=checkbox]').nth(0).is_checked()==False and pg.locator('.improw input[type=checkbox]').nth(1).is_checked()==True)
    ok('duplicate labelled', pg.is_visible('text=same name already added'))
    # csv file
    open('/tmp/imp.csv','w').write('name,price,note,link,priority\n"Shoe, red",1200,size 42,https://s.co/x,Want\nSock,80,,,someday\n')
    pg.set_input_files('input[type=file]','/tmp/imp.csv'); pg.wait_for_function("document.querySelector('.impname') && document.querySelector('.impname').value==='Shoe, red'")
    ok('csv parsed', pg.locator('.improw').count()==2 and pg.locator('.impprice').first.input_value()=='1200')
    # text layout
    pg.click('button:has-text("Appearance")'); pg.click('button:has-text("Plain text")'); pg.click('button:has-text("Done")'); time.sleep(.4); pg.screenshot(path='imp_text.png', full_page=True)
    ok('text layout import row square', pg.evaluate("getComputedStyle(document.querySelector('.impname')).borderRadius")=='0px')
    pg.click('#impgo'); pg.wait_for_selector('text=Added 2 items'); ok('csv items added', pg.locator('.row:has-text("Shoe, red")').count()==1)
    # list full: empty text shows message
    pg.click('button:has-text("Import items")'); pg.click('button:has-text("Preview")'); ok('empty paste says so', pg.is_visible('text=Nothing found'))
    ok('no page errors', not errs, errs[:2])
    b.close()
finally: srv.terminate()
print('TOTAL',sum(res),'/',len(res))
