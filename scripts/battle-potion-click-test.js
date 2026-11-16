/**
 * 戰鬥「活力藥水」要撳得中：HUD 繼承 pointer-events: none，
 * 按鈕自己要係 hit target，click 先會行 useHpPotion。
 * node scripts/battle-potion-click-test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exitCode = 1;
  } else {
    console.log('ok:', msg);
  }
}

function ruleBodies(selector) {
  const re = new RegExp('(?:^|[\\s,])' + selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{', 'g');
  const bodies = [];
  let match;
  while ((match = re.exec(html))) {
    const start = match.index + match[0].length;
    const end = html.indexOf('}', start);
    bodies.push(html.slice(start, end));
    re.lastIndex = end + 1;
  }
  return bodies;
}

function hasDecl(bodies, prop, value) {
  const re = new RegExp(prop + '\\s*:\\s*' + value);
  return bodies.some(function (body) { return re.test(body); });
}

const hud = ruleBodies('#pokemon-battle-arena.neon-stage.poke-stage .neon-hud-player');
const cluster = ruleBodies('#pokemon-battle-arena.neon-stage.poke-stage .neon-cluster-player');
assert(hasDecl(hud, 'pointer-events', 'none'), 'player HUD ignores hits so the stage stays clear');
assert(hasDecl(cluster, 'pointer-events', 'none'), 'player cluster ignores hits');

const btnId = ruleBodies('#pokemon-battle-arena.neon-stage.poke-stage #battle-potion-btn');
const btnClass = ruleBodies('.battle-potion-btn');
assert(btnId.length > 0 && hasDecl(btnId, 'pointer-events', 'auto'), 'arena potion button overrides inherited pointer-events');
assert(hasDecl(btnClass, 'pointer-events', 'auto'), 'potion button class is itself a hit target');
assert(!hasDecl(btnId, 'pointer-events', 'none') && !hasDecl(btnClass, 'pointer-events', 'none'), 'potion button is not taken back out of hit testing');

const clusterHtml = html.slice(html.indexOf('class="neon-cluster-player"'), html.indexOf('id="battle-question-section"'));
const btnAt = clusterHtml.indexOf('id="battle-potion-btn"');
assert(btnAt > clusterHtml.indexOf('neon-hud-player') && btnAt !== -1, 'potion button stays under the player nameplate');
const btnTag = clusterHtml.slice(clusterHtml.lastIndexOf('<button', btnAt), clusterHtml.indexOf('>', btnAt) + 1);
assert(btnTag.includes('onclick="useHpPotion()"'), 'visible button click calls useHpPotion');
assert(btnTag.includes('class="battle-potion-btn"'), 'visible button uses the potion button class');

const shop = html.slice(html.indexOf('id="view-shop"'), html.indexOf('id="view-gacha"'));
assert(shop.includes('onclick="useHpPotion()">使用 1 瓶'), 'shop keeps the shared drink button');

const toast = ruleBodies('.ui-toast');
const toastOn = ruleBodies('.ui-toast.is-on');
assert(hasDecl(toast, 'position', 'fixed') && hasDecl(toast, 'z-index', '9999'), 'toast is fixed above the battle chrome');
assert(hasDecl(toastOn, 'opacity', '1'), 'toast becomes visible when shown');

function makeEl() {
  const el = {
    hidden: true,
    textContent: '',
    innerText: '',
    className: '',
    style: {},
    children: [],
    onclick: null,
    setAttribute() {},
    getAttribute() { return null; },
    appendChild(child) { this.children.push(child); return child; },
    addEventListener() {},
    querySelector() { return makeEl(); },
    querySelectorAll() { return []; },
    click() { if (typeof this.onclick === 'function') this.onclick(); }
  };
  const classes = new Set();
  el.classList = {
    add() {
      Array.prototype.forEach.call(arguments, function (name) {
        classes.add(name);
        if (name === 'hidden') el.hidden = true;
      });
    },
    remove() {
      Array.prototype.forEach.call(arguments, function (name) {
        classes.delete(name);
        if (name === 'hidden') el.hidden = false;
      });
    },
    toggle() {},
    contains(name) { return name === 'hidden' ? el.hidden : classes.has(name); }
  };
  return el;
}

const els = Object.create(null);
const storage = Object.create(null);
const sandbox = {
  console,
  setTimeout: function () { return 0; },
  clearTimeout: function () {},
  setInterval: function () { return 0; },
  clearInterval: function () {},
  Date, Math, JSON, Number, String, Boolean, Object, Array, Promise, Error, RegExp,
  parseInt, parseFloat, isFinite, isNaN, encodeURIComponent, decodeURIComponent,
  alert() {},
  confirm() { return false; },
  fetch: async function () { return { ok: false, status: 0, text: async function () { return '{"ok":false}'; } }; },
  localStorage: {
    getItem(k) { return Object.prototype.hasOwnProperty.call(storage, k) ? storage[k] : null; },
    setItem(k, v) { storage[k] = String(v); },
    removeItem(k) { delete storage[k]; }
  },
  performance: { now() { return 0; } },
  navigator: { userAgent: 'node' },
  document: {
    getElementById(id) {
      if (!els[id]) els[id] = makeEl();
      return els[id];
    },
    querySelector() { return makeEl(); },
    querySelectorAll() { return []; },
    createElement() { return makeEl(); },
    addEventListener() {},
    documentElement: makeEl(),
    body: makeEl()
  }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
const logicAt = html.indexOf('<!-- JAVASCRIPT GAME LOGIC -->');
const scriptStart = html.indexOf('<script>', logicAt) + '<script>'.length;
const scriptEnd = html.lastIndexOf('</script>');
vm.runInContext(html.slice(scriptStart, scriptEnd) + `
  document.getElementById('battle-potion-btn').onclick = useHpPotion;
  globalThis.__test = {
    setUser(u) { currentUser = u; },
    setMonster(m) { activePlayerMonster = m; },
    setEnemy(e) { activeEnemy = e; },
    setSettled(v) { battleSettled = v; },
    openBattle() { document.getElementById('view-battle').hidden = false; },
    closeBattle() { document.getElementById('view-battle').hidden = true; },
    click() { document.getElementById('battle-potion-btn').click(); },
    user() { return currentUser; },
    monster() { return activePlayerMonster; },
    count() { return document.getElementById('battle-potion-count').textContent; },
    hpText() { return document.getElementById('player-hp-text').innerText; },
    toast() {
      const el = document.getElementById('cloud-sync-toast');
      return { text: el.textContent, on: el.classList.contains('is-on') };
    }
  };
`, sandbox, { filename: 'index.html' });

const api = sandbox.__test;
api.setUser({
  nickname: 'potion-click',
  gold: 0,
  expPacks: 0,
  hpPotions: 2,
  rankScore: 0,
  ownedMonsters: [{ id: 'fire_base', level: 1, exp: 0 }]
});
api.setEnemy({ name: '守護魔王', element: 'water', level: 1, hp: 80, maxHp: 200, atk: 10, imgKey: 'water', isBoss: true });
api.setMonster({ name: '火寶寶', element: 'fire', level: 1, imgKey: 'fire', maxHp: 200, currentHp: 40, skillText: '火花' });
api.setSettled(false);
api.openBattle();
api.click();
assert(api.user().hpPotions === 1, 'click spends one bottle, left ' + api.user().hpPotions);
assert(api.monster().currentHp === 140, 'click heals 50% of 200, hp ' + api.monster().currentHp);
assert(api.count() === '1', 'visible count drops to ' + api.count());
assert(api.hpText() === '140 / 200', 'visible HP becomes ' + api.hpText());
const healedToast = api.toast();
assert(healedToast.on && healedToast.text.indexOf('回復') !== -1 && healedToast.text.indexOf('100') !== -1, 'heal toast is shown: ' + healedToast.text);

api.monster().currentHp = 200;
api.click();
assert(api.user().hpPotions === 1 && api.monster().currentHp === 200, 'full HP click does not spend a bottle');
const fullToast = api.toast();
assert(fullToast.on && fullToast.text.indexOf('生命已滿') !== -1, 'full HP toast says 生命已滿: ' + fullToast.text);
assert(api.count() === '1', 'full HP click leaves the visible count at ' + api.count());

api.closeBattle();
api.click();
assert(api.user().hpPotions === 1, 'shop / out-of-battle click does not spend a bottle');
const shopToast = api.toast();
assert(shopToast.on && shopToast.text.indexOf('戰鬥') !== -1, 'out of battle toast says to drink in battle: ' + shopToast.text);

if (!process.exitCode) console.log('battle-potion-click-test: ok');
