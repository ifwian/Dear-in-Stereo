import re, json, sys
from playwright.sync_api import sync_playwright
BASE='http://localhost:3000'
errors=[]
def watch(page,name):
    page.on('console', lambda m: errors.append((name,m.type,m.text)) if m.type in ('error','warning') else None)
    page.on('pageerror', lambda e: errors.append((name,'pageerror',str(e))))
with sync_playwright() as p:
    b=p.chromium.launch()
    ctx=b.new_context(viewport={'width':1280,'height':900}); page=ctx.new_page(); watch(page,'owner')
    page.goto(BASE); page.click('#open-sample'); page.wait_for_selector('.letter'); page.screenshot(path='/tmp/shots/01-landing.png', full_page=True)
    page.goto(BASE+'/register'); page.fill('#display_name','Mara'); page.fill('#email','mara@example.com'); page.fill('#password','correct horse 42'); page.click('button[type=submit]')
    page.wait_for_url('**/dashboard'); page.screenshot(path='/tmp/shots/02-dashboard-empty.png')
    page.goto(BASE+'/letters/edit'); 
    page.fill('#song_url','https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=x'); page.fill('#song_title','Dreams'); page.fill('#artist','Fleetwood Mac')
    page.fill('#recipient_name','Sam'); page.fill('#title','For the long drive'); page.fill('#message','I heard this this morning.\n\nPlay it loud.')
    page.select_option('#reason_category','custom'); page.fill('#custom_reason','Because of Tuesday'); page.check('input[name=theme][value=dusk]', force=True)
    page.wait_for_timeout(400); page.screenshot(path='/tmp/shots/03-editor.png', full_page=True)
    assert 'Sam' in page.inner_text('#preview'), 'preview'
    page.click('#btn-publish'); page.wait_for_url('**/letters/view?id=*')
    url=page.input_value('.link-box input'); print('share url', url)
    page.screenshot(path='/tmp/shots/04-letter-view.png', full_page=True)
    # public view in a fresh context
    c2=b.new_context(viewport={'width':390,'height':800}); pub=c2.new_page(); watch(pub,'recipient')
    pub.goto(url); pub.click('text=Open the letter'); pub.wait_for_selector('.letter'); pub.fill('#rf-msg','Thank you, <b>so</b> much'); pub.fill('#rf-name','Sam'); pub.click('text=Send reply'); pub.wait_for_selector('text=Sent')
    pub.screenshot(path='/tmp/shots/05-recipient-mobile.png', full_page=True)
    # owner sees response
    page.goto(BASE+'/responses'); page.wait_for_selector('.response-card'); assert '<b>so</b>' in page.inner_text('.response-card'); page.screenshot(path='/tmp/shots/06-responses.png')
    # letters list
    page.goto(BASE+'/letters/'); page.wait_for_selector('.row'); page.fill('#q','Dreams'); page.wait_for_timeout(700); page.screenshot(path='/tmp/shots/07-library.png')
    # mixtape
    page.goto(BASE+'/mixtapes/'); page.click('#new-tape'); page.fill('#nt-title','Night drive'); page.click('dialog button[type=submit]'); page.wait_for_url('**/mixtapes/edit?id=*')
    page.select_option('#pick-letter', index=1); page.click('text=Add letter’s song'); page.wait_for_selector('.tracks .track')
    page.click('role=tab[name="A new song"]'); page.fill('#tr-url','https://youtu.be/dQw4w9WgXcQ'); page.fill('#tr-title','Never Gonna'); page.fill('#tr-artist','Rick'); page.fill('#tr-note','classic'); page.click('text=Add song'); page.wait_for_selector('aside .track >> nth=1')
    page.click('.tracks >> nth=0 >> [data-move="1"]'); page.wait_for_timeout(600)
    first=page.inner_text('.tracks .track >> nth=0'); print('first after move:', first.split('\n')[0])
    page.click('text=Publish and get link'); page.wait_for_selector('.link-box input'); murl=page.input_value('.link-box input')
    page.screenshot(path='/tmp/shots/08-mixtape-editor.png', full_page=True)
    pub.goto(murl); pub.wait_for_selector('.tape-sheet'); pub.screenshot(path='/tmp/shots/09-mixtape-public.png', full_page=True)
    page.goto(BASE+'/account'); page.screenshot(path='/tmp/shots/10-account.png', full_page=True)
    page.goto(BASE+'/dashboard'); page.wait_for_selector('.stats'); page.screenshot(path='/tmp/shots/11-dashboard.png', full_page=True)
    pub.goto(BASE+'/l/'+'A'*43); pub.wait_for_selector('h1'); print('bad link ->', pub.inner_text('h1'))
    b.close()
print('ERRORS:'); [print(e) for e in errors if 'fonts.g' not in e[2] and 'ERR_' not in e[2] or 'Content Security' in e[2]]
