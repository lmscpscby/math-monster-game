/**
 * Classroom iPad pass: error contrast, login gate a11y, 44px hit boxes, hover.
 * node scripts/ipad-usability-test.js
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
let failed = 0;

function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error('FAIL:', msg);
  } else {
    console.log('ok:', msg);
  }
}

function styleText(src) {
  const start = src.indexOf('<style>');
  const end = src.indexOf('</style>');
  assert(start !== -1 && end > start, 'first-party style block exists');
  return src.slice(start, end);
}

const css = styleText(html);

assert(html.includes('<script src="https://cdn.tailwindcss.com"></script>'), 'Tailwind Play CDN stays');
assert(!/<dialog[\s>]/.test(html.replace(/\/\*[\s\S]*?\*\//g, '')), 'login gate is not a native dialog element');
assert(!/showModal\(/.test(html.replace(/\/\*[\s\S]*?\*\//g, '')), 'showModal is not called');
assert(html.includes('id="auth-modal-overlay"'), 'auth overlay id stays');
assert(/id="auth-modal-overlay"[^>]*role="dialog"/.test(html), 'overlay role=dialog');
assert(/id="auth-modal-overlay"[^>]*aria-modal="true"/.test(html), 'overlay aria-modal');
assert(/id="auth-modal-overlay"[^>]*aria-labelledby="auth-modal-title"/.test(html), 'overlay labelled by the title');
assert(/<h1 id="auth-modal-title"/.test(html), 'existing title keeps an id');
assert(/id="login-error"[^>]*aria-live="polite"/.test(html), 'login error is polite live');
assert(/id="reg-error"[^>]*aria-live="polite"/.test(html), 'register error is polite live');
assert(/#login-error,\s*#reg-error\s*\{[^}]*color:\s*#881337/.test(css), 'error color is #881337');
assert(!/auth-modal-overlay[^>]*(?:關閉|跳過|稍後)/.test(html.slice(html.indexOf('id="auth-modal-overlay"'), html.indexOf('id="form-register"') + 400)), 'no skip/close copy in the gate');

const labelled = [
  ['login-mode-nickname-radio', 'login-mode-nickname-radio'],
  ['login-mode-school-radio', 'login-mode-school-radio'],
  ['login-nickname', 'login-nickname'],
  ['login-school', 'login-school'],
  ['login-class', 'login-class'],
  ['login-class-no', 'login-class-no'],
  ['login-password', 'login-password'],
  ['reg-school', 'reg-school'],
  ['reg-class', 'reg-class'],
  ['reg-class-no', 'reg-class-no'],
  ['reg-nickname', 'reg-nickname'],
  ['reg-password', 'reg-password']
];
labelled.forEach(function (pair) {
  assert(html.includes('for="' + pair[0] + '"'), 'label for ' + pair[0]);
  assert(html.includes('id="' + pair[1] + '"'), 'control id ' + pair[1]);
});

assert(html.includes('function showAuthOverlay'), 'showAuthOverlay exists');
assert(html.includes('function hideAuthOverlay'), 'hideAuthOverlay exists');
assert(html.includes('function onAuthTabKey'), 'tab trap exists');
assert(!/e\.key === 'Escape'|e\.key === "Escape"|key === 'Esc'/.test(html), 'Escape does not dismiss the gate');
assert(html.includes("hit.setAttribute('tabindex', '-1')"), 'inactive carousel buttons lose tabindex');
assert(html.includes('tabindex="-1" onclick="switchView(\'ranked\')"') || html.includes('tabindex="-1" onclick="switchView(\'ranked\')"'), 'inactive ranked slide starts at tabindex -1');
assert((html.match(/class="lobby-carousel__hit" tabindex="-1"/g) || []).length === 3, 'three inactive slide buttons start untabbable');

const hoverSelectors = [
  '.glass-card:hover',
  '#view-battle #quiz-options-grid > button:hover',
  '.lobby-carousel__hit:hover .lobby-hero-cta',
  '#view-home .lobby-hero-cta:hover',
  '.island-hotspot:hover',
  '.island-hotspot:hover .island-hotspot__bob',
  '.battle-potion-btn:hover',
  '.island-admin-btn:hover',
  '.ranked-btn:hover',
  '.adventure-back:hover',
  '.grade-tab-btn:hover',
  '.adventure-card__cta:hover',
  '.adventure-floor__go:hover',
  '.adventure-tower-card:hover .adventure-tower-card__frame',
  '.climb-start:hover',
  '.ui-btn:hover',
  '.ui-icon:hover',
  '.gacha-back:hover',
  '.gacha-series-tab:hover',
  '.gacha-summon:hover',
  '#view-temple-star .portrait-box:hover .portrait-img',
  '#view-temple-shanhai .portrait-box:hover .portrait-img'
];
hoverSelectors.forEach(function (sel) {
  const at = css.indexOf(sel);
  assert(at !== -1, 'hover rule present: ' + sel);
  const before = css.slice(Math.max(0, at - 180), at);
  assert(/@media \(hover: hover\) and \(pointer: fine\)/.test(before), sel + ' is inside hover:hover and pointer:fine');
});
assert(css.includes('.island-hotspot:focus-visible'), 'island focus-visible outline stays');
assert(css.includes('.ui-btn:focus-visible'), 'button focus-visible stays');
assert(css.includes('.ui-btn:active'), 'button active state stays');
assert(/\.island-hotspot::after\s*\{[^}]*inset:\s*-10px/.test(css), 'island hit inset stays -10px');
assert(/\.island-hotspot--adventure\s*\{[^}]*--x:\s*45%/.test(css), 'adventure hotspot x stays 45%');
assert(css.includes('@media (pointer: coarse)'), 'coarse pointer hit areas exist');
assert(css.includes('width: 44px'), '44px hit box width');
assert(css.includes('height: 44px'), '44px hit box height');

const marker = css.indexOf('first-party-room-hide');
const ruleStart = css.indexOf('#view-home.hidden', marker);
const ruleEnd = css.indexOf('}', ruleStart);
const rule = css.slice(ruleStart, ruleEnd);
assert(rule.includes('#auth-modal-overlay.hidden'), 'room-hide still lists the auth overlay');
assert(rule.includes('#form-login.hidden') && rule.includes('#form-register.hidden'), 'room-hide still lists auth forms');
assert(/display:\s*none\s*!important/.test(rule), 'room-hide stays display:none !important');
assert(!/\n\s*\.hidden\s*\{[^}]*display:\s*none/.test(css), 'no new global .hidden rule');

function extractGameScript(src) {
  const markerAt = src.indexOf('<!-- JAVASCRIPT GAME LOGIC -->');
  const start = src.indexOf('<script>', markerAt);
  const end = src.lastIndexOf('</script>');
  return src.slice(start + 8, end);
}
const gameJs = extractGameScript(html);
fs.writeFileSync('/tmp/mmg-game-script.js', gameJs);
const { spawnSync } = require('child_process');
const syntax = spawnSync(process.execPath, ['--check', '/tmp/mmg-game-script.js'], { encoding: 'utf8' });
assert(syntax.status === 0, 'game script parses: ' + (syntax.stderr || '').trim());

function mime(file) {
  if (file.endsWith('.html')) return 'text/html; charset=utf-8';
  if (file.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (file.endsWith('.css')) return 'text/css; charset=utf-8';
  if (file.endsWith('.jpg') || file.endsWith('.jpeg')) return 'image/jpeg';
  if (file.endsWith('.png')) return 'image/png';
  return 'application/octet-stream';
}

function startServer() {
  return new Promise(function (resolve) {
    const server = http.createServer(function (req, res) {
      const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      const rel = urlPath === '/' ? '/index.html' : urlPath;
      const file = path.join(root, rel);
      if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404);
        res.end('missing');
        return;
      }
      res.writeHead(200, { 'Content-Type': mime(file), 'Cache-Control': 'no-store' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', function () {
      resolve(server);
    });
  });
}

function startChrome(port) {
  const chrome = process.env.CHROME_PATH || '/usr/local/bin/google-chrome';
  const userDir = fs.mkdtempSync(path.join('/tmp', 'mmg-chrome-'));
  const child = spawn(chrome, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--remote-debugging-port=' + port,
    '--user-data-dir=' + userDir,
    'about:blank'
  ], { stdio: 'ignore' });
  return { child: child, userDir: userDir };
}

function waitFor(url, tries) {
  return new Promise(function (resolve, reject) {
    let left = tries;
    function tick() {
      fetch(url).then(function (res) { return res.json(); }).then(resolve).catch(function () {
        left -= 1;
        if (left <= 0) reject(new Error('timeout ' + url));
        else setTimeout(tick, 200);
      });
    }
    tick();
  });
}

async function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise(function (resolve, reject) {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', reject);
  });
  let seq = 0;
  const pending = new Map();
  ws.addEventListener('message', function (ev) {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const item = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) item.reject(new Error(JSON.stringify(msg.error)));
      else item.resolve(msg.result);
    }
  });
  function send(method, params) {
    seq += 1;
    const id = seq;
    ws.send(JSON.stringify({ id: id, method: method, params: params || {} }));
    return new Promise(function (resolve, reject) {
      pending.set(id, { resolve: resolve, reject: reject });
    });
  }
  return { ws: ws, send: send };
}

async function runBrowser(port) {
  const server = await startServer();
  const addr = server.address();
  const origin = 'http://127.0.0.1:' + addr.port + '/index.html';
  const launched = startChrome(port);
  try {
    const version = await waitFor('http://127.0.0.1:' + port + '/json/version', 40);
    const client = await cdp(version.webSocketDebuggerUrl);
    const target = await client.send('Target.createTarget', { url: 'about:blank' });
    const targets = await waitFor('http://127.0.0.1:' + port + '/json/list', 20);
    const page = targets.find(function (t) { return t.id === target.targetId; }) || targets.find(function (t) { return t.type === 'page'; });
    const pageClient = await cdp(page.webSocketDebuggerUrl);
    await pageClient.send('Page.enable');
    await pageClient.send('Runtime.enable');
    await pageClient.send('DOM.enable');
    await pageClient.send('CSS.enable');
    await pageClient.send('Emulation.setDeviceMetricsOverride', {
      width: 1024,
      height: 768,
      deviceScaleFactor: 2,
      mobile: true
    });
    await pageClient.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await pageClient.send('Emulation.setEmulatedMedia', {
      features: [
        { name: 'pointer', value: 'coarse' },
        { name: 'hover', value: 'none' }
      ]
    });
    await pageClient.send('Page.navigate', { url: origin });
    let ready = false;
    for (let i = 0; i < 40 && !ready; i++) {
      const ping = await pageClient.send('Runtime.evaluate', {
        expression: '!!document.getElementById("login-nickname") && !!document.getElementById("auth-modal-title")',
        returnByValue: true
      });
      ready = !!(ping.result && ping.result.value);
      if (!ready) await new Promise(function (resolve) { setTimeout(resolve, 250); });
    }
    assert(ready, 'page reached the login field');
    const evalJs = async function (expression) {
      const result = await pageClient.send('Runtime.evaluate', {
        expression: expression,
        returnByValue: true,
        awaitPromise: true
      });
      if (result.exceptionDetails) {
        throw new Error(JSON.stringify(result.exceptionDetails));
      }
      return result.result.value;
    };

    const gate = await evalJs(`(() => {
      const overlay = document.getElementById('auth-modal-overlay');
      const nick = document.getElementById('login-nickname');
      const regNick = document.getElementById('reg-nickname');
      const school = document.getElementById('login-school');
      const err = getComputedStyle(document.getElementById('login-error')).color;
      const regErr = getComputedStyle(document.getElementById('reg-error')).color;
      const first = document.activeElement && document.activeElement.id;
      document.getElementById('tab-btn-login').focus();
      const before = document.activeElement.id;
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
      const wrapped = document.activeElement && (document.activeElement.id || document.activeElement.tagName);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      const stillOpen = !overlay.classList.contains('hidden');
      const regTab = regNick.getAttribute('tabindex');
      const schoolTab = school.getAttribute('tabindex');
      const nickTab = nick.getAttribute('tabindex');
      const regInert = document.getElementById('form-register').inert === true;
      nick.focus();
      switchAuthTab('register');
      const regFocus = document.activeElement && document.activeElement.id;
      const loginNickTab = document.getElementById('login-nickname').getAttribute('tabindex');
      switchAuthTab('login');
      document.getElementById('login-nickname').focus();
      toggleLoginMode('school');
      const schoolFocus = document.activeElement && document.activeElement.id;
      const nickOff = document.getElementById('login-nickname').getAttribute('tabindex');
      toggleLoginMode('nickname');
      const slides = Array.from(document.querySelectorAll('[data-lobby-slide]'));
      const inactiveTabs = slides.filter(s => s.getAttribute('aria-hidden') === 'true').map(s => {
        const b = s.querySelector('.lobby-carousel__hit');
        return b ? b.getAttribute('tabindex') : 'missing';
      });
      const activeTab = slides.find(s => s.classList.contains('is-active')).querySelector('.lobby-carousel__hit').getAttribute('tabindex');
      return {
        role: overlay.getAttribute('role'),
        modal: overlay.getAttribute('aria-modal'),
        labelled: overlay.getAttribute('aria-labelledby'),
        err, regErr, first, before, wrapped, stillOpen,
        regTab, schoolTab, nickTab, regInert, regFocus, loginNickTab,
        schoolFocus, nickOff, inactiveTabs, activeTab,
        inertSupported: 'inert' in HTMLElement.prototype
      };
    })()`);
    assert(gate.role === 'dialog' && gate.modal === 'true' && gate.labelled === 'auth-modal-title', 'dialog semantics in the document');
    assert(gate.err === 'rgb(136, 19, 55)' && gate.regErr === 'rgb(136, 19, 55)', 'computed error color is #881337 (' + gate.err + ')');
    assert(gate.first === 'login-nickname', 'first field focused on show (' + gate.first + ')');
    assert(gate.before === 'tab-btn-login', 'login tab can take focus');
    assert(gate.wrapped === 'BUTTON' || gate.wrapped === 'button', 'shift-tab from first control wraps inside the gate (' + gate.wrapped + ')');
    const submit = await evalJs(`document.querySelector('#form-login button[type="submit"]').id || document.querySelector('#form-login button[type="submit"]').textContent`);
    assert(gate.stillOpen, 'Escape and backdrop click leave the gate open');
    assert(gate.nickTab === null, 'visible nickname field stays tabbable');
    assert(gate.regTab === '-1' && gate.schoolTab === '-1', 'hidden register and school fields are tabindex -1');
    assert(gate.regInert === true || gate.inertSupported === false, 'hidden register form is inert when supported');
    assert(gate.regFocus === 'reg-school', 'switching to register focuses the first field (' + gate.regFocus + ')');
    assert(gate.loginNickTab === '-1', 'hidden login fields leave the tab order');
    assert(gate.schoolFocus === 'login-school', 'school mode focuses the school field (' + gate.schoolFocus + ')');
    assert(gate.nickOff === '-1', 'nickname field leaves the tab order in school mode');
    assert(gate.inactiveTabs.length === 3 && gate.inactiveTabs.every(t => t === '-1'), 'inactive slide buttons are tabindex -1');
    assert(gate.activeTab === null, 'active slide button is tabbable');
    assert(typeof submit === 'string' && submit.length > 0, 'login submit still exists (' + submit + ')');

    const hits = await evalJs(`(() => {
      hideAuthOverlay();
      const box = (el, pseudo) => {
        const cs = getComputedStyle(el, pseudo || null);
        const r = el.getBoundingClientRect();
        return {
          w: Math.round(r.width * 10) / 10,
          h: Math.round(r.height * 10) / 10,
          beforeW: cs ? parseFloat(getComputedStyle(el, '::before').width) : 0,
          beforeH: parseFloat(getComputedStyle(el, '::before').height),
          afterInset: getComputedStyle(el, '::after').inset || getComputedStyle(el, '::after').top
        };
      };
      const dots = Array.from(document.querySelectorAll('.lobby-carousel__dot')).map(d => {
        const r = d.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
      });
      const centers = [];
      for (let i = 1; i < dots.length; i++) centers.push(Math.hypot(dots[i].x - dots[i - 1].x, dots[i].y - dots[i - 1].y));
      const dot = document.querySelector('.lobby-carousel__dot');
      const prev = document.getElementById('lobby-carousel-prev');
      const avatar = document.getElementById('header-avatar-btn');
      const icon = document.getElementById('bgm-btn');
      const compact = document.getElementById('daily-claim-btn');
      const exitBtn = document.querySelector('.battle-exit');
      const potion = document.getElementById('battle-potion-btn');
      document.getElementById('view-battle').classList.remove('hidden');
      const grid = document.getElementById('quiz-options-grid');
      for (let i = 0; i < 4; i++) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = '選項';
        grid.appendChild(b);
      }
      const opt = grid.querySelector('button');
      const hot = document.querySelector('.island-hotspot--training');
      const hotR = hot.getBoundingClientRect();
      const probe = (x, y) => {
        const el = document.elementFromPoint(x, y);
        return el ? (el.id || el.className || el.tagName) : 'none';
      };
      const dotHitLeft = probe(dots[0].x - 18, dots[0].y);
      const between = probe((dots[0].x + dots[1].x) / 2, dots[0].y);
      const arrowR = prev.getBoundingClientRect();
      const arrowGap = dots[0].x - 22 - (arrowR.right);
      return {
        centers,
        dot: box(dot),
        prev: box(prev),
        avatar: box(avatar),
        icon: box(icon),
        compact: box(compact),
        exit: box(exitBtn),
        potion: box(potion),
        opt: box(opt),
        hot: { w: hotR.width, h: hotR.height, hitH: hotR.height + 20, hitW: hotR.width + 20 },
        dotHitLeft,
        between,
        arrowGap,
        hoverFilter: getComputedStyle(document.querySelector('.ui-btn')).filter
      };
    })()`);
    console.log('hits', JSON.stringify(hits, null, 2));
    assert(hits.centers.every(d => d >= 44), 'carousel dot centers are at least 44px apart (' + hits.centers.join(', ') + ')');
    assert(hits.dot.w < 20 && hits.dot.h < 20, 'dot artwork stays about 0.7rem (' + hits.dot.w + 'x' + hits.dot.h + ')');
    assert(hits.dot.beforeW >= 44 && hits.dot.beforeH >= 44, 'dot hit box is 44px');
    assert(hits.dotHitLeft.indexOf('lobby-carousel__dot') !== -1, 'expanded dot receives the tap (' + hits.dotHitLeft + ')');
    assert(hits.between !== 'lobby-carousel__dot' && hits.between.indexOf('lobby-carousel__dot ') !== 0 && hits.between.indexOf('lobby-carousel__dot is-active') !== 0, 'midpoint between dots is not a dot (' + hits.between + ')');
    assert(hits.arrowGap > 0, 'arrow and first dot hit boxes do not meet (' + hits.arrowGap + ')');
    assert(hits.prev.beforeH >= 44, 'arrow hit height is 44px');
    assert(hits.prev.w > 30, 'arrow label width unchanged enough to stay a word (' + hits.prev.w + ')');
    assert(hits.avatar.w <= 38 && hits.avatar.h <= 38, 'avatar art stays ~36px (' + hits.avatar.w + 'x' + hits.avatar.h + ')');
    assert(hits.avatar.beforeW >= 44 && hits.avatar.beforeH >= 44, 'avatar hit box is 44px');
    assert(hits.icon.w <= 42 && hits.icon.h <= 42, 'header icon art stays ~40px (' + hits.icon.w + 'x' + hits.icon.h + ')');
    assert(hits.icon.beforeW >= 44 && hits.icon.beforeH >= 44, 'header icon hit box is 44px');
    assert(hits.compact.beforeH >= 44, 'compact button hit height is 44px');
    assert(hits.exit.beforeH >= 44 && hits.exit.h <= 42, 'battle exit hit grows past 40px art (' + hits.exit.h + ')');
    assert(hits.potion.beforeH >= 44 && hits.potion.h < 44, 'potion hit grows without stretching the art (' + hits.potion.h + ')');
    assert(hits.opt.beforeH >= 44, 'quiz option hit height is 44px');
    assert(hits.hot.hitH >= 44 && hits.hot.hitW >= 44, 'island plaque plus -10px inset clears 44px on iPad landscape (' + hits.hot.hitW.toFixed(1) + 'x' + hits.hot.hitH.toFixed(1) + ')');

    await pageClient.send('Emulation.setDeviceMetricsOverride', {
      width: 768,
      height: 1024,
      deviceScaleFactor: 2,
      mobile: true
    });
    const portrait = await evalJs(`(() => {
      const hot = document.querySelector('.island-hotspot--training');
      const r = hot.getBoundingClientRect();
      return { hitH: r.height + 20, hitW: r.width + 20, h: r.height };
    })()`);
    assert(portrait.hitH >= 44, 'island plaque plus inset clears 44px on iPad portrait (' + portrait.hitH.toFixed(1) + ')');

    await pageClient.send('Emulation.setDeviceMetricsOverride', {
      width: 700,
      height: 900,
      deviceScaleFactor: 2,
      mobile: true
    });
    const quiz = await evalJs(`(() => {
      const buttons = Array.from(document.querySelectorAll('#quiz-options-grid > button'));
      const rects = buttons.map(b => b.getBoundingClientRect());
      const centers = rects.map(r => ({ x: r.left + r.width / 2, y: r.top + r.height / 2, h: r.height }));
      let minDy = Infinity;
      for (let i = 0; i < centers.length; i++) {
        for (let j = i + 1; j < centers.length; j++) {
          const dx = Math.abs(centers[i].x - centers[j].x);
          const dy = Math.abs(centers[i].y - centers[j].y);
          if (dx < 20) minDy = Math.min(minDy, dy);
        }
      }
      return { heights: centers.map(c => Math.round(c.h * 10) / 10), minDy };
    })()`);
    assert(quiz.minDy >= 44, 'stacked quiz options stay 44px apart (' + JSON.stringify(quiz) + ')');

    await pageClient.send('Emulation.setEmulatedMedia', {
      features: [
        { name: 'pointer', value: 'coarse' },
        { name: 'hover', value: 'none' }
      ]
    });
    const sticky = await evalJs(`(() => {
      const btn = document.querySelector('#tab-btn-login');
      btn.classList.add('force-hover-probe');
      return getComputedStyle(btn).filter;
    })()`);
    const doc = await pageClient.send('DOM.getDocument', { depth: 1 });
    const found = await pageClient.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: '#tab-btn-login' });
    await pageClient.send('CSS.forcePseudoState', { nodeId: found.nodeId, forcedPseudoClasses: ['hover'] });
    const coarseHover = await evalJs(`JSON.stringify({
      filter: getComputedStyle(document.getElementById('tab-btn-login')).filter,
      mq: matchMedia('(hover: hover) and (pointer: fine)').matches,
      coarse: matchMedia('(pointer: coarse)').matches
    })`);
    const coarseInfo = JSON.parse(coarseHover);
    assert(coarseInfo.coarse === true && coarseInfo.mq === false, 'emulated media is coarse without hover (' + coarseHover + ')');
    assert(!/brightness\(1\.0?8\)/.test(coarseInfo.filter), 'coarse hover does not brighten the login tab (' + coarseInfo.filter + ')');
    assert(!/brightness\(1\.0?8\)/.test(sticky), 'unstyled probe is not bright (' + sticky + ')');

    const fineRule = await evalJs(`(() => {
      let hit = false;
      for (const sheet of document.styleSheets) {
        let rules;
        try { rules = sheet.cssRules; } catch (e) { continue; }
        for (const rule of rules) {
          if (rule.type === CSSRule.MEDIA_RULE && rule.conditionText === '(hover: hover) and (pointer: fine)' && rule.cssText.includes('.ui-btn:hover') && rule.cssText.includes('brightness(1.08)')) {
            hit = true;
          }
        }
      }
      return hit;
    })()`);
    assert(fineRule === true, 'button brighten stays inside the fine-pointer hover query');

    await pageClient.send('CSS.forcePseudoState', { nodeId: found.nodeId, forcedPseudoClasses: ['focus-visible'] });
    const focusRing = await evalJs(`getComputedStyle(document.getElementById('tab-btn-login')).outlineStyle`);
    assert(focusRing !== 'none', 'focus-visible outline still exists (' + focusRing + ')');

    pageClient.ws.close();
    client.ws.close();
  } finally {
    if (launched.child && launched.child.pid) {
      try { process.kill(launched.child.pid); } catch (e) {}
    }
    server.close();
  }
}

runBrowser(9333).then(function () {
  if (failed) {
    console.error('FAILED', failed);
    process.exit(1);
  }
  console.log('all checks passed');
}).catch(function (err) {
  console.error(err);
  process.exit(1);
});
