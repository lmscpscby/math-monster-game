/**
 * SPA 房間同彈窗要有 first-party display:none，唔靠 Tailwind Play CDN 的 .hidden。
 * .ranked-view { display: flex } 必須被 .ranked-view.hidden 的 !important 蓋過。
 * 唔加全局 .hidden，避免壓過 hidden sm:block / hidden md:inline / hidden sm:inline。
 *
 * node scripts/hidden-room-css-test.js
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const peerCss = fs.readFileSync(path.join(root, 'pvp-peer.css'), 'utf8');

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exitCode = 1;
  } else {
    console.log('ok:', msg);
  }
}

function styleText(src) {
  const start = src.indexOf('<style>');
  const end = src.indexOf('</style>');
  assert(start !== -1 && end > start, 'index.html has one first-party style block before </style>');
  return src.slice(start, end);
}

const css = styleText(html);
const marker = 'first-party-room-hide';
const markerAt = css.indexOf(marker);
assert(markerAt !== -1, 'room-hide block is marked');
const ruleStart = css.indexOf('#view-home.hidden', markerAt);
const ruleEnd = css.indexOf('}', ruleStart);
assert(ruleStart !== -1 && ruleEnd !== -1, 'room-hide rule is present');
const rule = css.slice(ruleStart, ruleEnd);

const covered = [
  '#view-home.hidden',
  '#view-ranked.hidden',
  '.ranked-view.hidden',
  '#view-shop.hidden',
  '#view-monsters.hidden',
  '#view-pvp.hidden',
  '#auth-modal-overlay.hidden',
  '#login-mode-nickname.hidden',
  '#login-mode-school.hidden',
  '#form-login.hidden',
  '#form-register.hidden',
  '#header-avatar-img.hidden',
  '#header-avatar-fallback.hidden',
  '#adventure-result-modal.hidden',
  '#card-zoom-modal.hidden',
  '#element-chart-modal.hidden',
  '#avatar-picker-modal.hidden',
  '#team-select-modal.hidden'
];
covered.forEach(function (selector) {
  assert(rule.includes(selector), 'room-hide rule lists ' + selector);
});
assert(/display:\s*none\s*!important/.test(rule), 'room-hide rule is display:none !important');

assert(html.includes('<script src="https://cdn.tailwindcss.com"></script>'), 'Tailwind Play CDN script stays in head');
assert(/\.ranked-view\s*\{[^}]*display:\s*flex/.test(css), '.ranked-view still lays out with display:flex when shown');

const already = [
  ['#view-battle.hidden', /#view-battle\.hidden\s*\{[^}]*display:\s*none\s*!important/],
  ['#view-grade-boards.hidden', /#view-grade-boards\.hidden\s*\{[^}]*display:\s*none\s*!important/],
  ['.adventure-view.hidden', /\.adventure-view\.hidden\s*\{[^}]*display:\s*none/],
  ['#view-gacha.gacha-altar.hidden', /#view-gacha\.gacha-altar\.hidden\s*\{[^}]*display:\s*none/],
  ['#view-temple.hidden', /#view-temple\.hidden[\s\S]*?display:\s*none\s*!important/],
  ['.hidden.island-admin-btn', /\.hidden\.island-admin-btn\s*\{[^}]*display:\s*none\s*!important/],
  ['.hidden.ui-btn', /\.hidden\.ui-btn[\s\S]*?display:\s*none\s*!important/]
];
already.forEach(function (pair) {
  assert(pair[1].test(css), 'existing first-party hide stays: ' + pair[0]);
});
assert(/\.pvp-sheet \.hidden\s*\{[^}]*display:\s*none\s*!important/.test(peerCss), 'pvp sheet descendants stay hidden in pvp-peer.css');

const responsiveLeftAlone = [
  'id="user-display-school"',
  'id="battle-title"',
  'id="boss-timer-label"'
];
responsiveLeftAlone.forEach(function (idAttr) {
  const id = idAttr.slice(4, -1);
  assert(!rule.includes('#' + id), 'responsive control is not forced hidden: #' + id);
  assert(html.includes(idAttr), idAttr + ' markup stays');
});
assert(html.includes('hidden sm:block'), 'hidden sm:block utility stays');
assert(html.includes('hidden md:inline'), 'hidden md:inline utility stays');
assert(html.includes('hidden sm:inline'), 'hidden sm:inline utility stays');
assert(html.includes('sm:hidden'), 'sm:hidden utility stays');

function bareHiddenSelectors(sheet) {
  const noComments = sheet.replace(/\/\*[\s\S]*?\*\//g, '');
  const found = [];
  let depth = 0;
  let selector = '';
  let inSelector = true;
  for (let i = 0; i < noComments.length; i++) {
    const ch = noComments[i];
    if (ch === '{') {
      if (depth === 0 && inSelector) {
        selector.split(',').forEach(function (part) {
          const token = part.trim();
          if (token === '.hidden') found.push(token);
        });
      }
      depth++;
      inSelector = false;
      selector = '';
    } else if (ch === '}') {
      depth = Math.max(0, depth - 1);
      inSelector = depth === 0;
      selector = '';
    } else if (inSelector && depth === 0) {
      selector += ch;
    }
  }
  return found;
}

assert(bareHiddenSelectors(css).length === 0, 'index.html has no global .hidden rule');
assert(bareHiddenSelectors(peerCss).length === 0, 'pvp-peer.css has no global .hidden rule');

assert(html.includes('loading="lazy"'), '#70 lazy loading stays');
assert(html.includes('assets/shop/shop-merchant.png'), 'shop art path stays');
