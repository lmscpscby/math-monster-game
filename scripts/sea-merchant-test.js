/**
 * 海上商人：價錢、藥水回血、文稿人名。
 * node scripts/sea-merchant-test.js
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
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

function fileHash(rel) {
  const buf = fs.readFileSync(path.join(root, rel));
  return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 8);
}

[
  ['assets/bg/ui-lobby-carousel-s2-1920.jpg', '41e323e0'],
  ['assets/monsters/season_aurelion.jpg', '14a637b1'],
  ['assets/shop/shop-merchant.png', 'e49e24f0'],
  ['assets/shop/shop-potion.png', '5a574984'],
  ['assets/shop/shop-exp-pack.png', '9cb92e73']
].forEach(function (pair) {
  assert(fileHash(pair[0]) === pair[1], pair[0] + ' hash');
  assert(html.includes(pair[0] + '?v=' + pair[1]), pair[0] + ' cache-bust');
});

assert(html.includes('100 金幣／1 瓶'), 'potion price');
assert(html.includes('100 金幣／2 個'), 'exp 2-pack price');
assert(html.includes('200 金幣／5 個（多送 1）'), 'exp 5-pack price');
assert(!html.includes('元／'), 'shop copy does not say 元');
assert(html.includes("name: '聖光龍王・奧瑞利安'"), 'display name is the poster name');
assert(html.includes('凱薩爾在白金帝國'), 'story keeps 凱薩爾');
assert(html.includes('艾爾德是凱薩爾唯一願意託付生命的臣子'), 'Elden bond keeps 凱薩爾');
assert(html.includes('凱薩爾曾親自登上帝王尖塔'), 'Thorin bond keeps 凱薩爾');
assert(html.includes('凱薩爾笑稱「群星也必須在帝國的法律下運行」'), 'Selina bond keeps 凱薩爾');
assert(!html.includes('奧瑞利安在白金帝國'), 'story does not rename 凱薩爾');
assert(html.includes('普天之下，莫非王土'), 'creed is kept');

const lore = html.slice(html.indexOf("story: '凱薩爾"), html.indexOf("creed:") + 80);
assert(lore.indexOf('奧瑞利安') === -1, 'manuscript block does not use 奧瑞利安');

function makeEl() {
  const el = {
    hidden: true,
    textContent: '',
    innerText: '',
    className: '',
    style: {},
    children: [],
    classList: null,
    setAttribute() {},
    getAttribute() { return null; },
    appendChild(child) { this.children.push(child); return child; },
    addEventListener() {},
    querySelector() { return makeEl(); },
    querySelectorAll() { return []; }
  };
  el.classList = {
    add(name) { if (name === 'hidden') el.hidden = true; },
    remove(name) { if (name === 'hidden') el.hidden = false; },
    toggle() {},
    contains(name) { return name === 'hidden' ? el.hidden : false; }
  };
  return el;
}

const els = Object.create(null);
const storage = Object.create(null);
const sandbox = {
  console,
  setTimeout: function (fn) { return 0; },
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
  globalThis.__test = {
    setUser(u) { currentUser = u; },
    setMonster(m) { activePlayerMonster = m; },
    setSettled(v) { battleSettled = v; },
    openBattle() { document.getElementById('view-battle').hidden = false; },
    closeBattle() { document.getElementById('view-battle').hidden = true; },
    buy: buyShopItem,
    use: useHpPotion,
    heal: applyHalfHpHeal,
    user() { return currentUser; },
    monster() { return activePlayerMonster; }
  };
`, sandbox, { filename: 'index.html' });

const api = sandbox.__test;
const full = api.heal({ maxHp: 200, currentHp: 200 });
assert(full.ok === false && full.reason === 'full', 'full HP does not heal');
const half = api.heal({ maxHp: 230, currentHp: 40 });
assert(half.ok === true && half.heal === 115 && half.currentHp === 155, '50% of 230 is 115, got ' + half.heal);
const odd = api.heal({ maxHp: 101, currentHp: 0 });
assert(odd.ok === true && odd.currentHp === 51, 'round half of 101 revives to 51, got ' + odd.currentHp);

api.setUser({
  nickname: 'shop-test',
  gold: 250,
  expPacks: 1,
  hpPotions: 0,
  rankScore: 0,
  ownedMonsters: [{ id: 'fire_base', level: 1, exp: 0 }]
});
api.buy('exp5');
assert(api.user().gold === 50 && api.user().expPacks === 6, '200 gold buys 5 exp packs, got gold ' + api.user().gold + ' packs ' + api.user().expPacks);
api.buy('exp2');
assert(api.user().gold === 50 && api.user().expPacks === 6, 'cannot buy the 2-pack without 100 gold');
api.user().gold = 100;
api.buy('potion');
assert(api.user().gold === 0 && api.user().hpPotions === 1, '100 gold buys one potion');
api.closeBattle();
api.use();
assert(api.user().hpPotions === 1, 'potion is not spent outside battle');
api.setMonster({ maxHp: 200, currentHp: 50, name: '火寶寶' });
api.setSettled(false);
api.openBattle();
api.use();
assert(api.user().hpPotions === 0 && api.monster().currentHp === 150, 'battle drink heals 50% and spends a bottle, hp ' + api.monster().currentHp);
api.user().hpPotions = 1;
api.monster().currentHp = 200;
api.use();
assert(api.user().hpPotions === 1 && api.monster().currentHp === 200, 'full battle HP does not spend a bottle');

if (!process.exitCode) console.log('sea-merchant-test: ok');
