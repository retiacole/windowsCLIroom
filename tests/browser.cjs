'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const Data = require('../src/data.js');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'test-artifacts');
fs.mkdirSync(output, {recursive:true});

(async () => {
  const server = http.createServer((req, res) => { res.writeHead(200, {'Content-Type':'text/html; charset=utf-8'}); res.end(fs.readFileSync(path.join(root, 'windowsCLIroom.html'))); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({headless:true, ...(process.env.WCR_BROWSER_CHANNEL ? {channel:process.env.WCR_BROWSER_CHANNEL} : {})});
    const context = await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
    const page = await context.newPage(), errors = [], unexpectedRequests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', req => { if (!req.url().startsWith('http://127.0.0.1:') && !req.url().startsWith('file:')) unexpectedRequests.push(req.url()); });
    page.on('dialog', dialog => dialog.accept());
    const url = `http://127.0.0.1:${server.address().port}/`;
    await page.goto(url); await page.locator('.hero').waitFor();
    assert.equal(await page.locator('.course-card').count(), 6);
    await page.locator('#home-button').click();
    assert.equal(await page.locator('.map-lesson').count(), Data.lessons.length);
    await page.locator('#dialog-close').click();
    await page.screenshot({path:path.join(output,'home-desktop.png'),fullPage:true});
    await page.locator('.hero-actions [data-open]').click();
    const input = () => page.locator('#command-input');
    const run = async command => { await input().fill(command); await input().press('Enter'); };
    for (const lesson of Data.lessons) {
      await page.locator(`.lesson-item[data-open="${lesson.id}"]`).click();
      assert.equal(await page.locator('#feedback .success').count(), 0, lesson.id+' starts fresh');
      await page.locator('[data-action="check"]').click();
      assert.equal(await page.locator('#feedback .success').count(), 0);
      await page.locator('[data-action="solution"]').click();
      const displayedSolution = await page.locator('.solution pre').textContent();
      for (const command of displayedSolution.split('\n')) await run(command);
      if (lesson.id === 'help-first') assert.match(await page.locator('#console-output').textContent(),/対応コマンド|使い方|フォルダー/);
      if (lesson.id === 'renew-dhcp-lease') for(let i=0;i<90;i++) await run('echo practice-'+i);
      if (lesson.question) {
        let attempts=0;
        for (const wrong of lesson.question.choices.filter(ch => ch.id !== lesson.question.answer)) {
          await page.locator(`input[name="answer"][value="${wrong.id}"]`).check();
          await page.locator('[data-action="check"]').click();
          assert.equal(await page.locator('#feedback .success').count(), 0, lesson.id+' rejects wrong interpretation');
          assert.equal(await page.locator('.choice-feedback').textContent(),wrong.feedback.ja);
          assert.ok((await page.locator('.answer-attempts').textContent()).endsWith(String(++attempts)));
          if(lesson.id==='inspect-dns-cache' && attempts===1) await page.screenshot({path:path.join(output,'review-answer-feedback.png'),fullPage:true});
        }
        await page.locator(`input[name="answer"][value="${lesson.question.answer}"]`).check();
        await page.locator('[data-action="check"]').click();
      }
      assert.equal(await page.locator('#feedback .success').count(), 1, lesson.id+' completes');
      if (lesson.id.includes('curl') && !fs.existsSync(path.join(output,'lesson-desktop.png'))) await page.screenshot({path:path.join(output,'lesson-desktop.png'),fullPage:true});
    }
    const completed = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem(WCREngine.KEY)).completed).length);
    assert.equal(completed, Data.lessons.length);
    console.log(`Browser displayed Japanese solutions: ${completed}/${Data.lessons.length} completed with correct interpretation.`);

    // Japanese keyboards can enter actual yen characters rather than U+005C.
    // Exercise the form, grading, completion and persistence in a clean profile.
    const pathContext = await browser.newContext(), pathPage = await pathContext.newPage();
    const pathErrors = [];
    pathPage.on('pageerror', error => pathErrors.push(error.message));
    pathPage.on('dialog', dialog => dialog.accept());
    const pathInput = () => pathPage.locator('#command-input');
    const pathRun = async command => { await pathInput().fill(command); await pathInput().press('Enter'); };
    await pathPage.goto(url);
    await pathPage.locator('.hero-actions [data-open]').click();
    for (const separator of ['\\', '/', '\u00a5', '\uffe5']) {
      await pathPage.locator('.lesson-item[data-open="current-directory"]').click();
      await pathPage.locator('[data-action="reset"]').last().click();
      await pathRun('cd'); await pathRun(`cd /d c:${separator}Lab`);
      assert.equal(await pathPage.locator('#feedback .success').count(), 1, `L02 separator ${separator}`);
      assert.ok((await pathPage.locator('#prompt-path').textContent()).includes('C:\\Lab'));
      await pathInput().fill(`type C:${separator}Lab${separator}read`);
      await pathInput().press('Tab');
      assert.equal(await pathInput().inputValue(), 'type C:\\Lab\\readme.txt');
      await pathPage.locator('.lesson-item[data-open="quoted-path"]').click();
      await pathPage.locator('[data-action="reset"]').last().click();
      await pathRun(`type "C:${separator}Lab${separator}Shared Files${separator}guide.txt"`);
      assert.equal(await pathPage.locator('#feedback .success').count(), 1, `L05 separator ${separator}`);
    }
    // The requested L05 text, example insertion and solution follow the UI language.
    await pathPage.locator('[data-action="reset"]').last().click();
    assert.ok((await pathPage.locator('.task').textContent()).includes('C:¥Lab¥Shared Files¥guide.txt'));
    const jaExample = await pathPage.locator('.example pre').textContent();
    assert.equal(jaExample, 'type "C:¥Lab¥readme.txt"');
    await pathPage.locator('.example [data-insert]').click();
    assert.equal(await pathInput().inputValue(), jaExample);
    for (let i=0; i<3; i++) await pathPage.locator('[data-action="hint"]').click();
    assert.ok((await pathPage.locator('#hints').textContent()).includes('C:¥Lab¥Shared Files¥guide.txt'));
    await pathPage.locator('[data-action="solution"]').click();
    const jaSolution = await pathPage.locator('.solution pre').textContent();
    assert.equal(jaSolution, 'type "C:¥Lab¥Shared Files¥guide.txt"');
    await pathRun(jaSolution);
    assert.equal(await pathPage.locator('#feedback .success').count(), 1);
    await pathPage.locator('.task').screenshot({path:path.join(output,'task-path-ja.png')});
    const draft = 'echo C:\\keep\\literal ¥1000';
    await pathInput().fill(draft); await pathPage.locator('#language-button').click();
    assert.ok((await pathPage.locator('.task').textContent()).includes('C:\\Lab\\Shared Files\\guide.txt'));
    assert.equal(await pathPage.locator('.example pre').textContent(), 'type "C:\\Lab\\readme.txt"');
    assert.equal(await pathPage.locator('.solution pre').textContent(), 'type "C:\\Lab\\Shared Files\\guide.txt"');
    assert.equal(await pathInput().inputValue(), draft);
    assert.equal(await pathPage.locator('#feedback .success').count(), 1);
    await pathPage.locator('.task').screenshot({path:path.join(output,'task-path-en.png')});
    await pathPage.locator('#language-button').click();
    assert.ok((await pathPage.locator('.task').textContent()).includes('C:¥Lab¥Shared Files¥guide.txt'));
    assert.equal(await pathInput().inputValue(), draft);
    await pathPage.locator('#lesson-search').fill('C:¥Lab');
    assert.ok(await pathPage.locator('.lesson-item[data-open="quoted-path"]').count());
    await pathPage.locator('#sandbox-button').click();
    await pathRun('echo \u00a51000 \uffe52000 > C:\u00a5Lab\u00a5Reports\u00a5amount.txt');
    await pathPage.reload(); await pathPage.locator('#sandbox-button').click();
    await pathRun('type C:\uffe5Lab\uffe5Reports\uffe5amount.txt');
    assert.ok((await pathPage.locator('#console-output .history-entry').last().textContent()).includes('\u00a51000 \uffe52000'));
    assert.deepEqual(pathErrors, []);
    await pathContext.close();
    console.log('Path display/input checks passed: JA/EN examples, insertion, copied solutions, language switch, preserved draft, grading, completion, literal text and reload.');

    // Cursor movement must not advance while typing; Japanese IME Enter must not execute.
    await page.locator(`.lesson-item[data-open="${Data.lessons[0].id}"]`).click();
    await input().fill('not executed'); await input().press('ArrowRight');
    assert.equal(await page.locator('.lesson-item.active').getAttribute('data-open'), Data.lessons[0].id);
    await input().evaluate(el => { el.dispatchEvent(new CompositionEvent('compositionstart', {bubbles:true})); el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true})); });
    assert.equal(await input().inputValue(), 'not executed');
    await input().evaluate(el => el.dispatchEvent(new CompositionEvent('compositionend', {bubbles:true})));
    await input().fill(''); await input().press('ArrowRight');
    assert.equal(await page.locator('.lesson-item.active').getAttribute('data-open'), Data.lessons[1].id);
    await run('hostname'); await input().press('ArrowUp'); assert.equal(await input().inputValue(), 'hostname');
    await input().fill('ipcon'); await input().press('Tab'); assert.ok((await input().inputValue()).startsWith('ipconfig'));

    // Language and in-progress command survive rerender/reload.
    await input().fill('dir C:\\Lab'); await page.locator('#language-button').click();
    assert.equal(await page.locator('html').getAttribute('lang'), 'en'); assert.equal(await input().inputValue(), 'dir C:\\Lab');
    await page.reload(); await page.locator('.hero-actions [data-open]').click();
    assert.equal(await input().inputValue(), 'dir C:\\Lab');
    assert.equal(await page.locator('#feedback .success').count(), 1);
    await run('help');
    assert.match(await page.locator('#console-output .history-entry').last().textContent(),/supported commands|List files|Print text/i);
    await page.locator('#reference-button').click(); await page.locator('#reference-search').fill('curl');
    assert.ok((await page.locator('#reference-results').textContent()).includes('curl')); await page.locator('#dialog-close').click();

    // File content is text, not executable markup, including a save/reload round trip.
    await page.locator('#sandbox-button').click();
    await run('echo "<img src=x onerror=alert(1)>" > C:\\Lab\\markup.txt');
    await page.locator('.file-panel summary').click(); await page.locator('.file-row').filter({hasText:'C:\\Lab\\markup.txt'}).getByRole('button',{name:'Read',exact:true}).click();
    assert.equal(await page.locator('#dialog-body img').count(), 0); await page.locator('#dialog-close').click();
    await page.locator('#menu-button').click();
    const downloadPromise = page.waitForEvent('download'); await page.locator('[data-action="export"]').click();
    const download = await downloadPromise; await download.saveAs(path.join(output,'roundtrip.json'));
    const expected = JSON.parse(fs.readFileSync(path.join(output,'roundtrip.json'), 'utf8'));
    const invalid = Buffer.from('{"schema":"windowsCLIroom.progress","version":1,"completed":{"__proto__":{}},"checkpoints":{}}');
    await page.locator('#import-file').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:invalid});
    await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('Could not import'));
    assert.equal(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem(WCREngine.KEY)).completed).length), Data.lessons.length);
    await page.locator('#import-file').setInputFiles({name:'valid.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(expected))});
    await page.locator('.hero').waitFor();
    await page.locator('#sandbox-button').click();
    await page.locator('.file-panel summary').click(); assert.equal(await page.locator('.file-row').filter({hasText:'C:\\Lab\\markup.txt'}).count(), 1);

    // Clear output must keep working when the bounded history rolls over.
    for (let i=0; i<85; i++) await run('echo iteration-'+i);
    await page.locator('[data-action="clear"]').click(); await run('echo after-clear');
    assert.ok((await page.locator('#console-output').textContent()).includes('after-clear'));
    assert.ok(!(await page.locator('#console-output').textContent()).includes('iteration-84'));

    // Narrow layouts and Japanese labels must not create document overflow.
    await page.locator('#language-button').click();
    for (const width of [390,768]) {
      await page.setViewportSize({width,height:844});
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `workspace ${width}px`);
      if (width===390) await page.screenshot({path:path.join(output,'lesson-mobile.png'),fullPage:true});
      await page.locator('#brand').click();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `home ${width}px`);
      if (width===390) await page.screenshot({path:path.join(output,'home-mobile.png'),fullPage:true});
      await page.locator('.hero-actions [data-open]').click();
    }
    assert.deepEqual(errors, []); assert.deepEqual(unexpectedRequests, []);

    // A saved completion must not claim the reset environment already meets the task.
    await page.setViewportSize({width:1440,height:1000});
    await page.locator(`.lesson-item[data-open="${Data.lessons[0].id}"]`).click();
    await page.locator('[data-action="reset"]').last().click();
    assert.equal(await page.locator('#feedback .success').count(),0);
    assert.equal(await page.locator('#feedback .record').count(),1);

    // The visible lesson reset repairs a changed environment, without touching other lessons.
    await page.locator('.lesson-item[data-open="move-and-rename"]').click();
    const beforeReset = await page.evaluate(() => JSON.parse(localStorage.getItem(WCREngine.KEY)));
    await run('echo changed > C:\\Lab\\Reports\\ticket-1042.txt');
    await input().fill('unfinished command');
    await page.locator('#lesson-reset').click();
    assert.equal(await input().inputValue(), '');
    assert.equal(await page.locator('#console-output .history-entry').count(), 0);
    assert.equal(await page.locator('.solution').count(), 0);
    assert.equal(await page.locator('#feedback .success').count(), 0);
    const afterReset = await page.evaluate(() => JSON.parse(localStorage.getItem(WCREngine.KEY)));
    assert.deepEqual(afterReset.completed, beforeReset.completed);
    assert.deepEqual(afterReset.checkpoints['read-a-log'], beforeReset.checkpoints['read-a-log']);
    assert.equal(afterReset.checkpoints['move-and-rename'].answer, '');
    assert.equal(afterReset.checkpoints['move-and-rename'].hintLevel, 0);
    assert.ok(afterReset.checkpoints['move-and-rename'].session.files['c:\\lab\\draft.txt']);
    assert.equal(afterReset.checkpoints['move-and-rename'].session.files['c:\\lab\\reports\\ticket-1042.txt'], undefined);
    for(const command of Data.lessons.find(l=>l.id==='move-and-rename').solution) await run(command);
    assert.equal(await page.locator('#feedback .success').count(), 1);
    console.log('Visible lesson reset restores files, history, draft, hints and grading while retaining other lessons and completed records.');

    // Existing v0.1.0 progress migrates in the real UI.
    const legacyContext=await browser.newContext();
    await legacyContext.addInitScript(raw=>localStorage.setItem('windowsCLIroom.progress.v1',raw),fs.readFileSync(path.join(__dirname,'fixtures/progress-v0.1.0.json'),'utf8'));
    const legacyPage=await legacyContext.newPage();await legacyPage.goto(url);
    assert.equal(await legacyPage.locator('#storage-warning').isVisible(),false);
    await legacyPage.locator('.hero-actions [data-open]').click();
    assert.equal(await legacyPage.locator('#feedback .success').count(),1);
    await legacyContext.close();

    // Unreadable existing data is preserved while new work remains usable.
    const recoveryContext=await browser.newContext({acceptDownloads:true});
    const original='{broken saved data';
    await recoveryContext.addInitScript(raw=>localStorage.setItem('windowsCLIroom.progress.v1',raw),original);
    const recoveryPage=await recoveryContext.newPage();await recoveryPage.goto(url);
    assert.equal(await recoveryPage.locator('#storage-warning').isVisible(),true);
    await recoveryPage.locator('.hero-actions [data-open]').click();
    await recoveryPage.locator('#command-input').fill('help');await recoveryPage.locator('#command-input').press('Enter');
    assert.equal(await recoveryPage.evaluate(()=>localStorage.getItem(WCREngine.KEY)),original);
    await recoveryPage.locator('#menu-button').click();
    const rescued=recoveryPage.waitForEvent('download');await recoveryPage.locator('[data-action="rescue"]').click();
    const rescueDownload=await rescued;await rescueDownload.saveAs(path.join(output,'unreadable-original.json'));
    assert.equal(fs.readFileSync(path.join(output,'unreadable-original.json'),'utf8'),original);
    await recoveryContext.close();

    // Distribution must also run directly as a file with networking disabled.
    const offline = await browser.newContext({offline:true,viewport:{width:1280,height:900}}), filePage = await offline.newPage();
    const fileErrors=[]; filePage.on('pageerror',e=>fileErrors.push(e.message));
    await filePage.goto(pathToFileURL(path.join(root,'windowsCLIroom.html')).href);
    await filePage.locator('.hero-actions [data-open]').click();
    await filePage.locator('#command-input').fill('help'); await filePage.locator('#command-input').press('Enter');
    assert.ok((await filePage.locator('#console-output').textContent()).includes('curl'));
    assert.deepEqual(fileErrors, []); await offline.close();
    console.log('Browser checks passed: offline file, bilingual UI, persistence, import/export, grading, IME, history, completion, responsive layout, zero external requests.');
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
