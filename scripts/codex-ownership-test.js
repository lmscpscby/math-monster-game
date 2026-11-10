/**
 * 圖鑑：只顯示已擁有，星軌命途同山海經分頁分開。
 *
 * 擁有權點樣模擬
 * ----------------
 * 背包、祈願同圖鑑用同一份名單：`currentUser.ownedMonsters`。
 * 每一項係 `{ id, level, exp }`，同 `drawGacha` 寫入背包、`loginUserSuccess` 讀取嘅格式一樣。
 * 呢個測試唔另起解鎖旗、唔改抽卡機率。
 *
 * - 已擁有：把 `currentUser.ownedMonsters` 設成指定 id。
 * - 未擁有：該 id 唔喺陣列入面。
 * - 訪客／未登入：`currentUser = null`，或者 `ownedMonsters` 唔係陣列。
 *   頁面登出同冇 session 都會再呼叫 `renderMonsterCollection()`。
 *
 * 斷言只讀 `renderMonsterCollection()` 寫入 `#monster-collection-grid` 嘅 HTML
 * （卡牌 innerHTML、空狀態、onclick 預覽）。祈願卡池常數仍然有全名，因為抽卡要用，
 * 但未擁有嘅名字唔可以出現喺圖鑑畫面。
 *
 * node scripts/codex-ownership-test.js
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

const STAR = {
  st_elden: '艾爾德',
  st_elijah: '伊利亞',
  st_fey: '菲雅',
  st_lucia: '露西亞',
  st_malakor: '馬爾科斯',
  st_noah: '諾亞',
  st_selina: '席琳娜',
  st_serafina: '賽拉菲娜',
  st_thorin: '索倫'
};
const SHAN = {
  sh1: '青龍',
  sh2: '帝江',
  sh3: '燭龍',
  sh4: '饕餮',
  sh5: '九尾狐',
  sh6: '窮奇',
  sh9: '應龍',
  sh10: '朱厭',
  sh11: '畢方',
  sh12: '白澤',
  sh13: '蘡'
};
const ELEMENTAL = {
  fire_base: '火寶寶',
  water_base: '水滴龜',
  grass_base: '萌芽獸',
  thunder_base: '雷電幼龍',
  fight_base: '菜鳥鬥士',
  rock_base: '礫石幼崽',
  psy_base: '念力幼雛',
  holy_base: '天使幼雛'
};
const NEW_SHAN_IDS = ['sh9', 'sh10', 'sh11', 'sh12', 'sh13'];

function makeEl() {
  const el = {
    hidden: false,
    innerText: '',
    textContent: '',
    className: '',
    title: '',
    src: '',
    alt: '',
    disabled: false,
    value: '',
    style: {},
    dataset: {},
    children: [],
    classList: {
      add() {},
      remove() {},
      toggle() {},
      contains() { return false; }
    },
    setAttribute(name, value) {
      this.attributes = this.attributes || {};
      this.attributes[name] = String(value);
    },
    getAttribute(name) {
      return this.attributes && Object.prototype.hasOwnProperty.call(this.attributes, name)
        ? this.attributes[name]
        : null;
    },
    removeAttribute() {},
    appendChild(child) { this.children.push(child); return child; },
    addEventListener() {},
    removeEventListener() {},
    querySelector() { return makeEl(); },
    querySelectorAll() { return []; },
    focus() {},
    click() {}
  };
  Object.defineProperty(el, 'innerHTML', {
    get() { return this._html || ''; },
    set(v) {
      this._html = String(v);
      this.children = [];
    }
  });
  return el;
}

function loadGame() {
  const els = Object.create(null);
  const storage = Object.create(null);
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Date,
    Math,
    JSON,
    Number,
    String,
    Boolean,
    Object,
    Array,
    Promise,
    Error,
    RegExp,
    parseInt,
    parseFloat,
    isFinite,
    isNaN,
    encodeURIComponent,
    decodeURIComponent,
    URL,
    URLSearchParams,
    alert() {},
    confirm() { return false; },
    fetch: async function () {
      return { ok: false, status: 0, text: async function () { return '{"ok":false}'; } };
    },
    localStorage: {
      getItem(k) { return Object.prototype.hasOwnProperty.call(storage, k) ? storage[k] : null; },
      setItem(k, v) { storage[k] = String(v); },
      removeItem(k) { delete storage[k]; }
    },
    performance: { now() { return Date.now(); } },
    navigator: { userAgent: 'node-codex-test' },
    document: {
      getElementById(id) {
        if (!els[id]) els[id] = makeEl();
        return els[id];
      },
      querySelector() { return makeEl(); },
      querySelectorAll() { return []; },
      createElement() { return makeEl(); },
      addEventListener() {},
      removeEventListener() {},
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
  const script = html.slice(scriptStart, scriptEnd) + `
    globalThis.__test = {
      setUser(u) { currentUser = u; },
      user() { return currentUser; },
      render: renderMonsterCollection,
      filter: filterMonsters,
      runtime: getMonsterRuntimeData,
      shanhai: SHANHAIJING_BEASTS,
      star: STAR_TRAIL_BEASTS
    };
  `;
  vm.runInContext(script, sandbox, { filename: 'index.html' });
  sandbox.__els = els;
  return sandbox;
}

function gridHtml(game) {
  const el = game.__els['monster-collection-grid'];
  if (!el) return '';
  return (el.children || []).map(function (child) {
    return (child.innerHTML || '') + '\n' + (child.textContent || '');
  }).join('\n');
}

function zoomIds(rendered) {
  const ids = [];
  const re = /openCardZoomModal\('([^']+)'/g;
  let match;
  while ((match = re.exec(rendered))) ids.push(match[1]);
  return ids;
}

function dataValues(rendered) {
  const values = [];
  const re = /data-[a-z0-9-]+=("([^"]*)"|'([^']*)')/gi;
  let match;
  while ((match = re.exec(rendered))) values.push(match[2] || match[3] || '');
  return values;
}

function owns(ids) {
  return {
    school: '測試',
    className: '6A',
    classNo: 1,
    nickname: 'codex-test',
    gold: 0,
    expPacks: 3,
    rankScore: 0,
    ownedMonsters: ids.map(function (id) { return { id: id, level: 1, exp: 0 }; })
  };
}

function assertHidden(rendered, label, names, ids) {
  names.forEach(function (name) {
    assert(rendered.indexOf(name) === -1, label + ' does not show name ' + name);
  });
  ids.forEach(function (id) {
    assert(rendered.indexOf(id) === -1, label + ' does not leak id ' + id);
    assert(zoomIds(rendered).indexOf(id) === -1, label + ' has no preview handler for ' + id);
  });
  dataValues(rendered).forEach(function (value) {
    ids.forEach(function (id) {
      assert(value.indexOf(id) === -1, label + ' data attribute does not carry ' + id);
    });
  });
}

function assertVisible(rendered, label, name, id) {
  assert(rendered.indexOf(name) !== -1, label + ' shows ' + name);
  assert(zoomIds(rendered).indexOf(id) !== -1, label + ' preview handler is the owned id ' + id);
}

const viewStart = html.indexOf('id="view-monsters"');
const viewEnd = html.indexOf('<!-- VIEW 4:');
assert(viewStart >= 0 && viewEnd > viewStart, 'codex view markers');
const view = html.slice(viewStart, viewEnd);
assert(view.includes('data-filter="star-trail"') && view.includes("filterMonsters('star-trail')"), '星軌命途 tab is wired');
assert(view.includes('>星軌命途<'), '星軌命途 tab label');
assert(view.includes('>山海經神獸<') && view.includes('>八屬性進化系<') && view.includes('>全部<'), 'existing codex tabs stay');
assert(!view.includes('st_elden') && !view.includes('艾爾德') && !view.includes('應龍'), 'codex markup does not prelist roster names');

const game = loadGame();
const api = game.__test;
assert(api.shanhai.some(function (b) { return b.id === 'sh13' && b.name === '蘡'; }), 'sh13 display name stays 蘡');
assert(!api.shanhai.some(function (b) { return /夔|薕/.test(b.name + b.skillText + b.title + b.desc); }), 'sh13 copy is neither 夔 nor 薕');
assert(api.star.map(function (b) { return b.id; }).join(',') === Object.keys(STAR).join(','), 'star-trail roster order st_elden … st_thorin');

const hiddenChrome = ['未解鎖', 'grayscale', 'opacity-40', 'fa-lock', '尚未發現：'];

function paint(user, filter) {
  api.setUser(user);
  api.filter(filter);
  return gridHtml(game);
}

['all', 'elemental', 'mythic', 'star-trail'].forEach(function (filter) {
  const rendered = paint(null, filter);
  assert(rendered.indexOf('尚未發現此系列') !== -1, 'guest ' + filter + ' uses the empty state');
  assert(rendered.trim() === '尚未發現此系列', 'guest ' + filter + ' is only the empty state');
  assertHidden(rendered, 'guest ' + filter, Object.values(STAR).concat(Object.values(SHAN), Object.values(ELEMENTAL), ['聖光麒麟']), Object.keys(STAR).concat(Object.keys(SHAN), NEW_SHAN_IDS));
  hiddenChrome.forEach(function (token) {
    assert(rendered.indexOf(token) === -1, 'guest ' + filter + ' has no locked chrome ' + token);
  });
});

const emptyVisitor = paint({ nickname: '訪客', ownedMonsters: null }, 'mythic');
assert(emptyVisitor.trim() === '尚未發現此系列', 'visitor without an ownedMonsters array sees the empty state');

const starter = paint(owns(['fire_base', 'water_base', 'grass_base', 'thunder_base']), 'all');
['火寶寶', '水滴龜', '萌芽獸', '雷電幼龍'].forEach(function (name) {
  assert(starter.indexOf(name) !== -1, 'starter 全部 shows owned ' + name);
});
assertHidden(
  starter,
  'starter 全部',
  ['菜鳥鬥士', '礫石幼崽', '念力幼雛', '天使幼雛'].concat(Object.values(SHAN), Object.values(STAR)),
  ['fight_base', 'rock_base', 'psy_base', 'holy_base'].concat(Object.keys(SHAN), Object.keys(STAR))
);

const starterShan = paint(owns(['fire_base', 'water_base', 'grass_base', 'thunder_base']), 'mythic');
assert(starterShan.trim() === '尚未發現此系列', 'starter 山海經 tab does not list the missing roster');
assertHidden(starterShan, 'starter 山海經', Object.values(SHAN).concat(Object.values(STAR)), Object.keys(SHAN).concat(Object.keys(STAR)));

const starterStar = paint(owns(['fire_base']), 'star-trail');
assert(starterStar.trim() === '尚未發現此系列', 'empty 星軌命途 tab does not list hidden names');
assertHidden(starterStar, 'empty 星軌', Object.values(STAR).concat(Object.values(SHAN)), Object.keys(STAR).concat(Object.keys(SHAN)));
assert(!/\d+\s*\/\s*\d+/.test(starterStar), 'empty 星軌 tab has no owned/missing count');

const ownedIds = ['fire_base', 'sh1', 'sh6'].concat(NEW_SHAN_IDS, ['st_elden', 'st_fey', 'st_thorin', 'season_kirin']);
const allOwned = paint(owns(ownedIds), 'all');
assertVisible(allOwned, '全部', '火寶寶', 'fire_base');
assertVisible(allOwned, '全部', '青龍', 'sh1');
assertVisible(allOwned, '全部', '窮奇', 'sh6');
NEW_SHAN_IDS.forEach(function (id) {
  assertVisible(allOwned, '全部', SHAN[id], id);
});
assertVisible(allOwned, '全部', '艾爾德', 'st_elden');
assertVisible(allOwned, '全部', '菲雅', 'st_fey');
assertVisible(allOwned, '全部', '索倫', 'st_thorin');
assertVisible(allOwned, '全部', '聖光麒麟', 'season_kirin');
assert(allOwned.indexOf('蘡') !== -1 && allOwned.indexOf('夔') === -1 && allOwned.indexOf('薕') === -1, 'owned sh13 renders as 蘡');
assert(allOwned.indexOf('ui-shan-kui.png') !== -1, 'sh13 keeps the kui asset filename');
assertHidden(
  allOwned,
  '全部',
  ['帝江', '燭龍', '饕餮', '九尾狐', '水滴龜', '伊利亞', '露西亞', '馬爾科斯', '諾亞', '席琳娜', '賽拉菲娜'],
  ['sh2', 'sh3', 'sh4', 'sh5', 'water_base', 'st_elijah', 'st_lucia', 'st_malakor', 'st_noah', 'st_selina', 'st_serafina']
);
ownedIds.forEach(function (id) {
  const hits = zoomIds(allOwned).filter(function (found) { return found === id; }).length;
  assert(hits === 2, '全部 previews owned ' + id + ' twice (art and name), got ' + hits);
});

const shanTab = paint(owns(ownedIds), 'mythic');
['青龍', '窮奇', '應龍', '朱厭', '畢方', '白澤', '蘡', '聖光麒麟'].forEach(function (name) {
  assert(shanTab.indexOf(name) !== -1, '山海經 tab shows owned ' + name);
});
assertHidden(shanTab, '山海經', ['火寶寶', '艾爾德', '菲雅', '索倫', '帝江'], ['fire_base', 'st_elden', 'st_fey', 'st_thorin', 'sh2']);
assert(zoomIds(shanTab).indexOf('sh9') !== -1 && zoomIds(shanTab).indexOf('sh13') !== -1, 'new shan hai cards keep preview handlers');

const starTab = paint(owns(ownedIds), 'star-trail');
assertVisible(starTab, '星軌', '艾爾德', 'st_elden');
assertVisible(starTab, '星軌', '菲雅', 'st_fey');
assertVisible(starTab, '星軌', '索倫', 'st_thorin');
assert(starTab.split('openCardZoomModal').length - 1 === 6, 'star tab has one art handler and one name handler per owned card');
assertHidden(
  starTab,
  '星軌',
  ['青龍', '應龍', '蘡', '火寶寶', '聖光麒麟', '伊利亞', '露西亞', '馬爾科斯', '諾亞', '席琳娜', '賽拉菲娜'],
  ['sh1', 'sh9', 'sh13', 'fire_base', 'season_kirin', 'st_elijah', 'st_lucia', 'st_malakor', 'st_noah', 'st_selina', 'st_serafina']
);

const elementalTab = paint(owns(ownedIds), 'elemental');
assert(elementalTab.indexOf('火寶寶') !== -1, '八屬性 tab shows the owned line');
assertHidden(elementalTab, '八屬性', ['青龍', '應龍', '蘡', '艾爾德', '水滴龜'], ['sh1', 'sh9', 'sh13', 'st_elden', 'water_base']);

const wiped = paint(null, 'all');
assert(wiped.trim() === '尚未發現此系列', 'logging out to guest clears previously rendered names');
assertHidden(wiped, 'after logout', Object.values(STAR).concat(Object.values(SHAN), ['火寶寶', '聖光麒麟']), Object.keys(STAR).concat(Object.keys(SHAN), ['fire_base']));

if (process.exitCode) {
  console.error('codex ownership checks failed');
  process.exit(process.exitCode);
}
console.log('codex ownership checks passed');
