/**
 * 兩部 iPad：餵包升級之後，另一部唔好用較新 stamp 把經驗包補返。
 * node scripts/exp-pack-merge-test.js
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

function makeEl() {
  const el = {
    hidden: true,
    textContent: '',
    innerText: '',
    innerHTML: '',
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
  globalThis.__test = {
    setUser(u) { currentUser = u; },
    user() { return currentUser; },
    merge(a, b, opts) { return mergeProgressProfiles(a, b, opts || {}); },
    feed(id) { feedExpPack(id); },
    buy(id) { buyShopItem(id); },
    claim() { claimDailyReward(); },
    db() { return JSON.parse(localStorage.getItem('math_monster_users') || '{}'); }
  };
`, sandbox, { filename: 'index.html' });

const api = sandbox.__test;

function monster(level, exp) {
  return { id: 'fire_base', level: level, exp: exp || 0 };
}

function profile(opts) {
  return {
    gold: opts.gold != null ? opts.gold : 100,
    expPacks: opts.packs,
    hpPotions: opts.potions != null ? opts.potions : 1,
    rankScore: 0,
    updatedAt: opts.at,
    ownedMonsters: opts.monsters || [monster(3, 0)]
  };
}

function levelOf(p, id) {
  const list = p.ownedMonsters || [];
  const found = list.filter(function (m) { return m && m.id === id; })[0];
  return found ? found.level : 0;
}

function expOf(p, id) {
  const list = p.ownedMonsters || [];
  const found = list.filter(function (m) { return m && m.id === id; })[0];
  return found ? found.exp : 0;
}

api.setUser({
  nickname: 'p6b',
  school: '梨木樹天主教小學',
  className: '6B',
  classNo: 6,
  gold: 100,
  expPacks: 5,
  hpPotions: 2,
  rankScore: 0,
  ownedMonsters: [monster(1, 0)]
});
api.feed('fire_base');
assert(api.user().expPacks === 4, 'single-device feed spends one pack, got ' + api.user().expPacks);
assert(levelOf(api.user(), 'fire_base') === 2 && expOf(api.user(), 'fire_base') === 0, 'one pack levels a fresh monster 1 → 2');
const savedFeed = api.db()['user_p6b'];
assert(savedFeed && savedFeed.expPacks === 4 && savedFeed.ownedMonsters[0].level === 2, 'feed save writes the lower pack count');

const fed = {
  gold: 100,
  expPacks: 4,
  hpPotions: 1,
  rankScore: 0,
  updatedAt: '2026-11-23T01:00:00.000Z',
  ownedMonsters: [monster(6, 10), { id: 'water_base', level: 2, exp: 0 }]
};
const idleNewer = {
  gold: 180,
  expPacks: 14,
  hpPotions: 6,
  rankScore: 0,
  updatedAt: '2026-11-23T02:00:00.000Z',
  ownedMonsters: [monster(3, 0), { id: 'water_base', level: 2, exp: 0 }]
};
const idleOlder = Object.assign({}, idleNewer, { updatedAt: '2026-11-22T00:00:00.000Z' });

function assertFedWins(merged, label) {
  assert(merged.expPacks === 4, label + ' keeps the fed pack count, got ' + merged.expPacks);
  assert(levelOf(merged, 'fire_base') === 6 && expOf(merged, 'fire_base') === 10, label + ' keeps the higher level');
  assert(levelOf(merged, 'water_base') === 2, label + ' keeps the shared monster');
}

assertFedWins(api.merge(fed, idleNewer), 'fed local vs newer idle cloud');
assertFedWins(api.merge(idleNewer, fed), 'idle local vs fed cloud');
assertFedWins(api.merge(fed, idleOlder), 'fed local vs older idle cloud');
assertFedWins(api.merge(idleOlder, fed), 'older idle local vs fed cloud');
const potionsStay = api.merge(fed, idleNewer);
assert(potionsStay.hpPotions === 6, 'potion count still follows the newer stamp, got ' + potionsStay.hpPotions);
assert(potionsStay.gold === 180, 'gold still follows the newer stamp when only packs are tied to the level-up');

const expOnly = api.merge(
  profile({ packs: 9, at: '2026-11-23T03:00:00.000Z', monsters: [monster(4, 0)] }),
  profile({ packs: 7, at: '2026-11-23T01:00:00.000Z', monsters: [monster(4, 80)] })
);
assert(expOnly.expPacks === 7 && expOf(expOnly, 'fire_base') === 80, 'exp-only feed sticks even when the idle stamp is newer, got packs ' + expOnly.expPacks);

const split = api.merge(
  {
    gold: 100, expPacks: 4, hpPotions: 1, updatedAt: '2026-11-23T01:00:00.000Z',
    ownedMonsters: [{ id: 'fire_base', level: 8, exp: 0 }, { id: 'water_base', level: 1, exp: 0 }]
  },
  {
    gold: 100, expPacks: 9, hpPotions: 1, updatedAt: '2026-11-23T04:00:00.000Z',
    ownedMonsters: [{ id: 'fire_base', level: 2, exp: 0 }, { id: 'water_base', level: 7, exp: 0 }]
  }
);
assert(split.expPacks === 9, 'split progress does not Math.min the packs, got ' + split.expPacks);
assert(levelOf(split, 'fire_base') === 8 && levelOf(split, 'water_base') === 7, 'split progress still keeps both higher levels');

const staleCloud = api.merge(
  profile({ packs: 4, at: '2026-11-23T05:00:00.000Z', monsters: [monster(5, 0)] }),
  profile({ packs: 14, at: '2026-11-23T01:00:00.000Z', monsters: [monster(5, 0)] })
);
assert(staleCloud.expPacks === 4, 'older cloud with more packs does not Math.max them back, got ' + staleCloud.expPacks);

const poisoned = api.merge(
  profile({ packs: 12, gold: 80, potions: 2, at: '2026-11-23T01:00:00.000Z' }),
  profile({ packs: 3, gold: 10, potions: 0, at: '2026-11-23T06:00:00.000Z' })
);
assert(poisoned.expPacks === 12 && poisoned.gold === 80 && poisoned.hpPotions === 2, 'poisoned newer stamp with lower gold and packs keeps the local economy');

const grantOnLocal = api.merge(
  profile({ packs: 5, gold: 100, at: '2026-11-23T08:00:00.000Z' }),
  profile({ packs: 5, gold: 100, at: '2026-11-23T01:00:00.000Z' }),
  { grantedGold: 200, grantedExp: 10 }
);
assert(grantOnLocal.expPacks === 15 && grantOnLocal.gold === 300, 'teacher grant still adds when the merge keeps the local economy');

const grantOnCloud = api.merge(
  profile({ packs: 5, gold: 100, at: '2026-11-23T01:00:00.000Z' }),
  profile({ packs: 15, gold: 300, at: '2026-11-23T08:00:00.000Z' }),
  { grantedGold: 200, grantedExp: 10 }
);
assert(grantOnCloud.expPacks === 15 && grantOnCloud.gold === 300, 'grant already inside the newer cloud profile is not added twice');

const grantBesideFeed = api.merge(
  profile({ packs: 4, at: '2026-11-23T01:00:00.000Z', monsters: [monster(8, 0)] }),
  profile({ packs: 30, at: '2026-11-23T08:00:00.000Z', monsters: [monster(3, 0)] }),
  { grantedExp: 10 }
);
assert(grantBesideFeed.expPacks === 14, 'feed consumption sticks and the new grant is still added, got ' + grantBesideFeed.expPacks);
assert(levelOf(grantBesideFeed, 'fire_base') === 8, 'grant merge still keeps the higher level');

api.setUser({
  nickname: 'daily',
  school: '梨木樹天主教小學',
  className: '6B',
  classNo: 1,
  gold: 40,
  expPacks: 3,
  hpPotions: 0,
  rankScore: 0,
  ownedMonsters: [monster(2, 0)],
  updatedAt: '2026-11-22T00:00:00.000Z'
});
const beforeClaim = JSON.parse(JSON.stringify(api.user()));
api.claim();
assert(api.user().gold === 240 && api.user().expPacks === 13, 'daily claim adds 200 gold and 10 packs, got gold ' + api.user().gold + ' packs ' + api.user().expPacks);
assert(levelOf(api.user(), 'fire_base') === 2, 'daily claim does not change monster level');
const afterClaim = api.merge(api.user(), beforeClaim);
assert(afterClaim.expPacks === 13 && afterClaim.gold === 240, 'merging the pre-claim profile does not undo the daily claim');

api.setUser({
  nickname: 'shopper',
  school: '梨木樹天主教小學',
  className: '6B',
  classNo: 2,
  gold: 250,
  expPacks: 1,
  hpPotions: 0,
  rankScore: 0,
  ownedMonsters: [monster(2, 0)]
});
const beforeShop = JSON.parse(JSON.stringify(api.user()));
api.buy('exp5');
assert(api.user().gold === 50 && api.user().expPacks === 6, 'shop buy spends 200 gold for 5 packs');
const afterShop = api.merge(beforeShop, api.user());
assert(afterShop.gold === 50 && afterShop.expPacks === 6, 'older pre-shop profile does not undo the purchase');
const shopCloud = api.merge(
  profile({ packs: 1, gold: 250, at: '2026-11-23T01:00:00.000Z', monsters: [monster(2, 0)] }),
  profile({ packs: 6, gold: 50, at: '2026-11-23T09:00:00.000Z', monsters: [monster(2, 0)] })
);
assert(shopCloud.expPacks === 6 && shopCloud.gold === 50, 'newer shop profile keeps the extra packs');

const wiped = api.merge(
  { gold: 500, expPacks: 4, hpPotions: 3, ownedMonsters: [monster(9, 0)], updatedAt: '2026-11-23T09:00:00.000Z' },
  { gold: 0, expPacks: 1, hpPotions: 0, ownedMonsters: [monster(1, 0)], wiped: true, updatedAt: '2026-11-23T10:00:00.000Z' },
  { preferCloudProgress: true }
);
assert(wiped.expPacks === 1 && levelOf(wiped, 'fire_base') === 1, 'preferCloud wipe follows the cloud packs and monsters');

if (!process.exitCode) console.log('exp-pack-merge-test: ok');
