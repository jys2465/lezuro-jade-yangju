const { chromium } = require('playwright'); const { start } = require('./e2e-server');
(async () => {
  const srv = await start(), b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'ko-KR', timezoneId: 'Asia/Seoul' }), p = await ctx.newPage();
  p.on('pageerror', e => console.log('PAGEERROR', e.message)); p.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
  await p.goto('http://localhost:8801/'); await p.waitForSelector('.keypad, .pad', { timeout: 8000 }).catch(() => console.log('no pad; body:', ''));
  console.log('screen text:', (await p.locator('#app').innerText()).replace(/\s+/g, ' ').slice(0, 160));
  console.log('font ok:', await p.evaluate(() => document.fonts.check('16px "Noto Sans KR"')), 'booted:', await p.evaluate(() => window.LZ.booted));
  await p.screenshot({ path: __dirname + '/shot-login.png' });
  await b.close(); srv.close();
})();
