from playwright.sync_api import sync_playwright
BASE='http://localhost:3000'
with sync_playwright() as p:
    b=p.chromium.launch()
    for w,h in [(360,740),(768,1024),(1280,800)]:
        ctx=b.new_context(viewport={'width':w,'height':h}, bypass_csp=True); pg=ctx.new_page()
        pg.goto(BASE+'/login'); pg.fill('#email','mara@example.com'); pg.fill('#password','correct horse 42'); pg.click('button[type=submit]'); pg.wait_for_url('**/dashboard')
        for path in ['/', '/how-it-works','/dashboard','/letters/','/letters/edit','/letters/view?id=1','/mixtapes/','/mixtapes/edit?id=1','/responses','/account']:
            pg.goto(BASE+path); pg.wait_for_timeout(500)
            over=pg.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
            print(w, path, 'OVERFLOW %dpx'%over if over>0 else 'ok')
        if w==360:
            pg.goto(BASE+'/dashboard'); pg.click('.menu-toggle'); pg.screenshot(path='/tmp/shots/12-mobile-menu.png')
            pg.goto(BASE+'/letters/view?id=1'); pg.wait_for_timeout(500); pg.screenshot(path='/tmp/shots/13-view-mobile.png', full_page=True)
        ctx.close()
    b.close()
