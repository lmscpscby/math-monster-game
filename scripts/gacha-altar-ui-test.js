/**
 * 祈願召喚台外皮：正式 UI kit 檔案 SHA-256、cache-bust、文案，同十連保底窗口。
 * node scripts/gacha-altar-ui-test.js
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const EXPECTED = {
  'assets/bg/ui-gacha-stage-mystic-1920.png': '2d670fe2',
  'assets/bg/ui-gacha-btn-single.png': 'd5aeb932',
  'assets/bg/ui-gacha-btn-ten.png': '0f94a42b',
  'assets/bg/ui-gacha-hint-banner.png': '4f4a61f4',
  'assets/bg/ui-gacha-info-pill.png': '7b1350d9'
};

const HINT = '單抽 200 金幣，十抽 2000 金幣。十連抽必得 1 個山海經怪獸卡！';

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exitCode = 1;
  } else {
    console.log('ok:', msg);
  }
}

const SERIES_ART = {
  'assets/bg/ui-gacha-banner-shanhai-1920.png': '60e7eace',
  'assets/bg/ui-gacha-banner-star-trail-1920.png': '21f1900b',
  'assets/bg/ui-lobby-carousel-shanhai-1920.png': '702c9f7d',
  'assets/bg/ui-lobby-carousel-star-trail-1920.png': '22694439',
  'assets/bg/ui-lobby-carousel-ranked-enter-1920.png': 'b4900c07',
  'assets/bg/promo-star-trail-1920.png': '71adfa44'
};

function assertArt(map) {
  Object.keys(map).forEach(function (file) {
    const prefix = map[file];
    const bytes = fs.readFileSync(path.join(root, file));
    const sha = crypto.createHash('sha256').update(bytes).digest('hex');
    assert(sha.slice(0, 8) === prefix, file + ' SHA-256 prefix ' + sha.slice(0, 8));
    assert(html.includes(file + '?v=' + prefix), 'index.html cache-busts ' + file);
  });
}

assertArt(EXPECTED);
assertArt(SERIES_ART);

const viewStart = html.indexOf('id="view-gacha"');
const viewEnd = html.indexOf('<!-- VIEW 3:');
assert(viewStart >= 0 && viewEnd > viewStart, 'gacha view markers');
const view = html.slice(viewStart, viewEnd);

assert(view.includes('距離必出次數'), 'pity label');
assert(view.includes('id="gacha-pity-value"'), 'pity value node');
assert(view.includes(HINT), 'exact hint copy');
assert(view.includes('>單抽<') || view.includes('>單抽</span>'), 'single button label');
assert(view.includes('十連抽'), 'ten button label');
assert(view.includes('200 金幣'), 'single price');
assert(view.includes('2000 金幣'), 'ten price');
assert(view.includes('id="btn-gacha-1"') && view.includes('drawGacha(1)'), 'single still calls drawGacha(1)');
assert(view.includes('id="btn-gacha-10"') && view.includes('drawGacha(10)'), 'ten still calls drawGacha(10)');
assert(!view.includes('召喚概率'), 'rates table not in gacha view');
assert(!view.includes('示意'), 'no preview meta wording');
assert(!view.includes('本地預覽'), 'no local-preview wording');
assert(!view.includes('未上架'), 'no unreleased wording');
assert(!/\d+\s*元/.test(view), 'gacha view does not price in 元');
assert(view.includes('星軌命途：符文紀元'), 'star-trail tab uses the series name');
assert(view.includes('山海經神獸'), 'shanhaijing tab label');
assert(view.includes('data-gacha-series="shanhaijing"'), 'shanhaijing tab hook');
assert(view.includes('data-gacha-series="star-trail"'), 'star-trail tab hook');
assert(view.includes("setGachaSeries('shanhaijing')"), 'shanhaijing tab switches series');
assert(view.includes("setGachaSeries('star-trail')"), 'star-trail tab switches series');
assert(view.includes('ui-gacha-banner-shanhai-1920.png?v=60e7eace'), 'shanhai stage banner cache-bust');
assert(view.includes('ui-gacha-banner-star-trail-1920.png?v=21f1900b'), 'star-trail stage banner cache-bust');
assert(view.includes('id="gacha-altar-title" hidden'), 'altar heading stays off the baked banner titles');
assert(view.includes('卡池即將開放'), 'closed pool is labeled on the star-trail stage');
assert(!view.includes('ui-gacha-banner-star-trail-wide.png'), 'old wide banner is not the stage');
assert(!html.includes('ui-lobby-carousel-star-trail-1920.png?v=71adfa44'), 'carousel does not use the promo hash');
assert(!html.includes('ui-lobby-carousel-star-trail-1920.png?v=13e864c8'), 'carousel does not keep the previous star-trail plate');
assert(html.includes("openGachaSeries('star-trail')"), 'star-trail slide opens that tab');
assert(html.includes("openGachaSeries('shanhaijing')"), 'shanhaijing slide opens that tab');
assert(html.includes('<title>無限召喚：數理之王</title>'), 'document title uses the official name');
assert(!html.includes('數理怪獸抽卡大冒險') && !html.includes('數理怪獸大冒險'), 'old product titles are gone');
assert(!html.includes('Math Monster Gacha'), 'old English product name is gone');
assert(!html.includes('歡迎來到'), 'welcome slide copy is gone');
assert(!html.includes('lobby-carousel__slide--welcome'), 'welcome slide class is gone');
const carouselStart = html.indexOf('id="lobby-carousel"');
const carouselEnd = html.indexOf('class="island-hub"');
assert(carouselStart >= 0 && carouselEnd > carouselStart, 'lobby carousel markers');
const carousel = html.slice(carouselStart, carouselEnd);
assert((carousel.match(/data-lobby-slide="/g) || []).length === 3, 'carousel has exactly 3 slides');
assert((carousel.match(/data-lobby-dot="/g) || []).length === 3, 'carousel has exactly 3 dots');
assert(!carousel.includes('data-lobby-slide="3"') && !carousel.includes('data-lobby-dot="3"'), 'carousel has no fourth slide or dot');
assert(carousel.includes('ui-lobby-carousel-shanhai-1920.png?v=702c9f7d'), 'shan-hai slide uses the 1920×720 plate');
assert(carousel.includes('ui-lobby-carousel-star-trail-1920.png?v=22694439'), 'star-trail slide uses the 1920×720 plate');
assert(carousel.includes('ui-lobby-carousel-ranked-enter-1920.png?v=b4900c07'), 'brand slide reuses the ranked enter plate');
assert(!carousel.includes('ui-gacha-stage-mystic-1920.png'), 'shan-hai slide no longer uses the gacha stage plate');
assert(!carousel.includes('lobby-carousel__title'), 'poster slides do not overlay a large title class');
assert(!carousel.includes('前往抽卡'), 'poster slides do not keep 前往抽卡');
assert(!carousel.includes('進入排位賽'), 'poster slides do not keep 進入排位賽');
assert(!carousel.includes('積分爭霸') && !carousel.includes('進入積分爭霸'), 'carousel does not keep a ranked slide');
assert(!carousel.includes("switchView('ranked')"), 'carousel does not open ranked');
function carouselSlide(id) {
  const token = 'data-lobby-slide="' + id + '"';
  const start = carousel.indexOf(token);
  const next = carousel.indexOf('data-lobby-slide="', start + token.length);
  assert(start >= 0, 'carousel slide ' + id);
  return carousel.slice(start, next === -1 ? carousel.length : next);
}
const brandSlide = carouselSlide('0');
const shanSlide = carouselSlide('1');
const starSlide = carouselSlide('2');
assert(brandSlide.includes('無限召喚・數理之王'), 'brand kicker is the approved line');
assert(brandSlide.includes('展開冒險，挑戰數理'), 'brand subtitle is the approved line');
assert(brandSlide.includes('>開始冒險<') && brandSlide.includes("enterAdventure()") && brandSlide.includes('lobby-hero-cta'), 'brand slide wood CTA starts the adventure');
assert(!brandSlide.includes('<h2') && !brandSlide.includes('lobby-carousel__title'), 'brand slide does not overlay a giant title');
assert(shanSlide.includes('>進入祈願<') && shanSlide.includes('lobby-hero-cta'), 'shan-hai slide shows the shared wood 進入祈願 chip');
assert(starSlide.includes('>進入祈願<') && starSlide.includes('lobby-hero-cta'), 'star-trail slide shows the shared wood 進入祈願 chip');
assert((carousel.match(/>進入祈願</g) || []).length === 2, 'only the two gacha plates show 進入祈願');
assert(brandSlide.includes('lobby-carousel__scrim') && shanSlide.includes('lobby-carousel__scrim') && starSlide.includes('lobby-carousel__scrim'), 'poster slides keep the bottom scrim');
assert(html.includes('linear-gradient(180deg, rgba(12, 8, 4, 0.05) 20%, rgba(12, 8, 4, 0.28) 55%, rgba(12, 8, 4, 0.78) 100%)'), 'base scrim keeps the deeper fallback fade');
assert(html.includes('rgba(12, 8, 4, 0.48) 100%'), 'brand and star plates use a lighter 0.48 scrim');
assert(html.includes('rgba(12, 8, 4, 0.42) 100%'), 'shan-hai plate scrim stays lighter at 0.42');
assert(html.includes('.lobby-carousel__slide--plate .lobby-carousel__kicker'), 'plate kicker has its own type rule');
assert(html.includes('font-size: 0.8rem') && html.includes('letter-spacing: 0.14em') && html.includes('color: #ffe9a8'), 'plate kicker stays gold, 0.8rem, 0.14em');
assert(html.includes('font-size: 1.1rem') && html.includes('color: #fff8ec'), 'plate subtitle is the larger warm white');
assert(html.includes('text-shadow: 0 2px 6px rgba(0, 0, 0, 0.85)'), 'plate lines share the deeper shadow');
assert(html.includes('left: 3.5%') && html.includes('gap: 0.4rem'), 'plate copy sits inset with the art gap');
assert(html.includes('.lobby-carousel__slide--plate[data-lobby-slide="1"] .lobby-carousel__copy') && html.includes('bottom: 25%'), 'shan-hai copy is lifted off the baked title');
assert(html.includes('.lobby-carousel__slide--plate[data-lobby-slide="1"] .lobby-carousel__plate-cta') && html.includes('bottom: 23%'), 'shan-hai CTA stays raised');
assert(!/\.lobby-carousel__slide--plate \.lobby-carousel__scrim[^{]*\{[^}]*display:\s*none/.test(html), 'plate scrim is not force-hidden');
assert(html.includes('.lobby-carousel__slide--plate .lobby-carousel__copy h2'), 'plate h2 hide selector remains');
assert(!/\.lobby-carousel__slide--plate \.lobby-carousel__copy\s*\{[^}]*display:\s*none/.test(html), 'plate copy block is not force-hidden');
assert(shanSlide.includes('lobby-carousel__kicker') && shanSlide.includes('神獸卡池・收集經典'), 'shan-hai kicker is the approved line');
assert(shanSlide.includes('lobby-carousel__sub') && shanSlide.includes('挑戰山海，抽出神獸'), 'shan-hai subtitle is the approved line');
assert(starSlide.includes('lobby-carousel__kicker') && starSlide.includes('符文紀元・新系列'), 'star-trail kicker is the approved line');
assert(starSlide.includes('lobby-carousel__sub') && starSlide.includes('踏入星軌，開啟祈願'), 'star-trail subtitle is the approved line');
assert(!brandSlide.includes('<h2') && !shanSlide.includes('<h2') && !starSlide.includes('<h2'), 'poster slides do not overlay an h2');
assert(!brandSlide.includes('lobby-carousel__title') && !shanSlide.includes('lobby-carousel__title') && !starSlide.includes('lobby-carousel__title'), 'poster slides do not overlay a large title');
assert(shanSlide.includes("openGachaSeries('shanhaijing')"), 'shan-hai slide deep-links the shanhai pool');
assert(starSlide.includes("openGachaSeries('star-trail')"), 'star-trail slide deep-links the star-trail pool');
assert(carousel.includes('data-lobby-dot="0"') && carousel.includes('data-lobby-dot="1"') && carousel.includes('data-lobby-dot="2"'), 'carousel dots cover the three slides');
assert(html.includes('island-hotspot--arena') && html.includes("switchView('ranked')"), 'ranked stays reachable from the island map');
assert(!view.includes('ui-parchment'), 'gacha view leaves the parchment frame');

const drawStart = html.indexOf('function drawGacha(count)');
const drawEnd = html.indexOf('function renderGachaResults');
assert(drawStart >= 0 && drawEnd > drawStart, 'drawGacha block');
const draw = html.slice(drawStart, drawEnd);
assert(draw.includes('const singleCost = 200'), 'single cost stays 200');
assert(draw.includes('const cost = count * singleCost'), 'cost scales with count');
assert(draw.includes('currentUser.gold -= cost'), 'gold is deducted');
assert(draw.includes('if (count === 10)'), 'ten-pull branch remains');
assert(draw.includes('guaranteedMythicPos'), 'ten-pull still forces a slot');
assert(draw.includes('rand < 0.03'), 'single-pull mythic rate unchanged');
assert(draw.includes('SHANHAIJING_BEASTS'), 'mythic cards still come from the live pool');
assert(draw.includes('STAR_TRAIL_BEASTS'), 'star-trail draws would use its own roster');
assert(draw.includes('gachaGuaranteeBySeries[series]'), 'ten-pull window is stored per series');
assert(!draw.includes('pity'), 'drawGacha does not grow a 100-pull pity counter');
const closedGuard = draw.indexOf("series === 'star-trail'");
const goldAt = draw.indexOf('currentUser.gold -= cost');
assert(closedGuard >= 0 && goldAt > closedGuard, 'closed star-trail pool returns before gold is spent');
assert(html.includes("series: 'star-trail'"), 'pool plumbing records series star-trail');
const HINT_STAR = '單抽 200 金幣，十抽 2000 金幣。十連抽必得 1 個星軌符文卡！保底同山海經分開計算。';
assert(html.includes(HINT_STAR), 'open star-trail hint matches the shanhaijing rate line');
assert(!HINT_STAR.includes('卡池即將開放'), 'open hint does not say the pool is closed');
assert(html.includes("'star-trail': { series: 'star-trail', open: true }"), 'star-trail pool is open');
assert(!html.includes('const STAR_TRAIL_BEASTS = []'), 'star-trail roster is no longer empty');
assert(html.includes('STAR_TRAIL_BEASTS'), 'runtime lookup reads the star-trail roster');
assert(
  html.includes("(typeof STAR_TRAIL_BEASTS !== 'undefined' ? STAR_TRAIL_BEASTS : []).map(function (b) { return b.id; })"),
  'collection appends the star-trail ids'
);

const STAR_CARD_SHA = {};
const STAR_CARD_FILES = {
  st_elden: 'assets/monsters/star-trail/ui-star-card-elden.png',
  st_elijah: 'assets/monsters/star-trail/ui-star-card-elijah.png',
  st_fey: 'assets/monsters/star-trail/ui-star-card-fey.png',
  st_lucia: 'assets/monsters/star-trail/ui-star-card-lucia.png',
  st_malakor: 'assets/monsters/star-trail/ui-star-card-malakor.png',
  st_noah: 'assets/monsters/star-trail/ui-star-card-noah.png',
  st_selina: 'assets/monsters/star-trail/ui-star-card-selina.png',
  st_serafina: 'assets/monsters/star-trail/ui-star-card-serafina.png',
  st_thorin: 'assets/monsters/star-trail/ui-star-card-thorin.png'
};
Object.keys(STAR_CARD_FILES).forEach(function (key) {
  const file = STAR_CARD_FILES[key];
  const bytes = fs.readFileSync(path.join(root, file));
  const sha = crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 8);
  STAR_CARD_SHA[key] = sha;
  assert(html.includes(file + '?v=' + sha), key + ' cache-busts ' + file + '?v=' + sha);
});
['ed39ca82', '2bb54584', '999ee2a1', '2c8eaf1d', '095c0368', 'c2ff6c64', 'aa7cc52f', 'a027951e', 'dc4e429d'].forEach(function (oldSha) {
  assert(!html.includes('?v=' + oldSha), 'old cutout hash is gone ' + oldSha);
});
const artCss = html.slice(html.indexOf('.monster-art-frame {'), html.indexOf('.gacha-controls'));
assert(artCss.includes('overflow: hidden'), 'art frames hide overflow');
assert(artCss.includes('.monster-art-frame > img.monster-art'), 'art frame targets the monster image');
assert(artCss.includes('object-fit: contain'), 'art frames use object-fit contain');

const fnStart = html.indexOf('/* GACHA_GUARANTEE_REMAINING_START */');
const fnEnd = html.indexOf('/* GACHA_GUARANTEE_REMAINING_END */');
assert(fnStart >= 0 && fnEnd > fnStart, 'guarantee helper markers');
const context = {};
vm.createContext(context);
vm.runInContext(html.slice(fnStart, fnEnd), context);
assert(context.gachaGuaranteeRemaining() === 10, '距離必出次數 is the 10-card ten-pull window');
assert(context.gachaGuaranteeRemaining('star-trail') === 10, 'star-trail window is its own 10, not a shared counter');
assert(context.gachaGuaranteeRemaining('shanhaijing') === 10, 'shanhaijing window stays 10');
assert(!html.includes('冰羽熾天神龍'), 'colleague UR roster is not shipped');
assert(!html.includes('召喚概率公示'), 'rates disclosure heading is not shipped');

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
    setAttribute() {},
    getAttribute() { return null; },
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
    Math: Object.assign(Object.create(Math), {
      random() { return sandbox.__random(); }
    }),
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
    fetch: async function () {
      return { ok: false, status: 0, text: async function () { return '{"ok":false}'; } };
    },
    localStorage: {
      getItem(k) { return Object.prototype.hasOwnProperty.call(storage, k) ? storage[k] : null; },
      setItem(k, v) { storage[k] = String(v); },
      removeItem(k) { delete storage[k]; }
    },
    performance: { now() { return Date.now(); } },
    navigator: { userAgent: 'node-gacha-test' },
    __random() { return 0.5; },
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
      setSeries(s) { activeGachaSeries = s; },
      user() { return currentUser; },
      pools: GACHA_POOLS,
      star: STAR_TRAIL_BEASTS,
      shanhai: SHANHAIJING_BEASTS,
      images: BEAST_IMAGES,
      hint: GACHA_HINT_STAR,
      guarantee: gachaGuaranteeBySeries,
      poolOpen: gachaPoolOpen,
      draw: drawGacha,
      renderCollection: renderMonsterCollection,
      setFilter(f) { currentFilter = f; },
      applyChrome: applyGachaSeriesChrome,
      runtime: getMonsterRuntimeData
    };
  `;
  vm.runInContext(script, sandbox, { filename: 'index.html' });
  sandbox.__els = els;
  return sandbox;
}

const game = loadGame();
const api = game.__test;
const STAR_IDS = ['st_elden', 'st_elijah', 'st_fey', 'st_lucia', 'st_malakor', 'st_noah', 'st_selina', 'st_serafina', 'st_thorin'];
const ELEMENTS = { st_elden: 'holy', st_elijah: 'psy', st_fey: 'grass', st_lucia: 'holy', st_malakor: 'rock', st_noah: 'fight', st_selina: 'psy', st_serafina: 'fire', st_thorin: 'thunder' };
const NAMES = { st_elden: '艾爾德', st_elijah: '伊利亞', st_fey: '菲雅', st_lucia: '露西亞', st_malakor: '馬爾科斯', st_noah: '諾亞', st_selina: '席琳娜', st_serafina: '賽拉菲娜', st_thorin: '索倫' };

assert(api.star.length === 9, 'STAR_TRAIL_BEASTS length is 9');
assert(api.poolOpen('star-trail') === true, 'gachaPoolOpen(star-trail) is true');
assert(api.poolOpen('shanhaijing') === true, 'shanhaijing pool stays open');
assert(api.hint === HINT_STAR, 'GACHA_HINT_STAR is the open-pool hint');
assert(api.shanhai.length === 6, 'shanhaijing roster length unchanged');

api.star.forEach(function (beast, index) {
  const id = STAR_IDS[index];
  assert(beast.id === id, 'roster order ' + id);
  assert(beast.imgKey === id, id + ' imgKey matches id');
  assert(beast.name === NAMES[id], id + ' display name');
  assert(beast.title.indexOf(NAMES[id]) > 0 && beast.title.indexOf('：') > 0, id + ' title is the full role line');
  assert(beast.element === ELEMENTS[id], id + ' element');
  ['hp', 'atk', 'def', 'spd'].forEach(function (stat) {
    assert(typeof beast[stat] === 'number', id + ' ' + stat + ' is a number');
  });
  assert(beast.hp >= 160 && beast.hp <= 300, id + ' hp in shanhaijing band');
  assert(beast.atk >= 95 && beast.atk <= 125, id + ' atk in shanhaijing band');
  assert(beast.def >= 70 && beast.def <= 110, id + ' def in shanhaijing band');
  assert(beast.spd >= 60 && beast.spd <= 130, id + ' spd in shanhaijing band');
  ['name', 'title', 'skillText', 'desc'].forEach(function (field) {
    assert(beast[field] && !/[A-Za-z]/.test(beast[field]), id + ' ' + field + ' has no English');
  });
  const src = api.images[beast.imgKey] || '';
  assert(src.indexOf(STAR_CARD_FILES[id] + '?v=') === 0, id + ' image map entry');
  const runtime = api.runtime(id, 1);
  assert(runtime && runtime.isMythic === true && runtime.series === 'star-trail', id + ' runtime is a star-trail mythic');
  assert(runtime.name === beast.name && runtime.imgKey === id, id + ' runtime uses the roster');
});

function freshUser(gold) {
  return {
    school: '測試',
    className: '6A',
    classNo: 1,
    nickname: 'star-trail-test',
    gold: gold,
    expPacks: 0,
    rankScore: 0,
    ownedMonsters: []
  };
}

function cardHtml(id) {
  const el = game.__els[id];
  if (!el) return '';
  return el.children.map(function (child) { return child.innerHTML || ''; }).join('\n');
}

api.guarantee.shanhaijing = 7;
api.guarantee['star-trail'] = 4;
api.setUser(freshUser(5000));
api.setSeries('star-trail');
game.__random = function () { return 0; };
api.draw(1);
assert(api.user().gold === 4800, 'star-trail single pull costs 200');
assert(api.user().ownedMonsters.some(function (m) { return m.id === 'st_elden'; }), 'single mythic roll grants st_elden');
assert(cardHtml('gacha-results-grid').includes('艾爾德'), 'single result shows 艾爾德');
assert(cardHtml('gacha-results-grid').includes('星軌符文'), 'single mythic is labeled 星軌符文');
assert(api.guarantee['star-trail'] === 10, 'star-trail window resets on its own draw');
assert(api.guarantee.shanhaijing === 7, 'shanhaijing window is untouched by a star-trail draw');

api.setSeries('shanhaijing');
api.setUser(freshUser(5000));
game.__random = function () { return 0; };
api.draw(1);
assert(api.user().ownedMonsters.some(function (m) { return m.id === 'sh1'; }), 'shanhaijing mythic roll still grants 青龍');
assert(cardHtml('gacha-results-grid').includes('山海經神獸'), 'shanhaijing result keeps its own label');
assert(!api.user().ownedMonsters.some(function (m) { return String(m.id).indexOf('st_') === 0; }), 'shanhaijing draw does not grant star-trail cards');

api.setSeries('star-trail');
api.setUser(freshUser(5000));
api.guarantee.shanhaijing = 7;
game.__random = function () { return 0.5; };
api.draw(10);
const ownedAfterTen = api.user().ownedMonsters.map(function (m) { return m.id; });
assert(api.user().gold === 3000, 'star-trail ten pull costs 2000');
assert(ownedAfterTen.indexOf('st_malakor') >= 0, 'ten pull forces one star-trail mythic');
assert(ownedAfterTen.filter(function (id) { return id.indexOf('st_') === 0; }).length === 1, 'non-guarantee rolls stay on the shared elemental pool');
assert((cardHtml('gacha-results-grid').match(/星軌符文/g) || []).length === 1, 'ten pull shows exactly one 星軌符文');
assert(api.guarantee['star-trail'] === 10 && api.guarantee.shanhaijing === 7, 'ten-pull pity stays split by series');

const goldBeforeClosed = api.user().gold;
api.pools['star-trail'].open = false;
api.draw(1);
assert(api.user().gold === goldBeforeClosed, 'closed star-trail pool does not spend gold');
api.pools['star-trail'].open = true;

api.setUser(freshUser(0));
api.user().ownedMonsters = [{ id: 'st_elden', level: 1, exp: 0 }];
api.setFilter('all');
api.renderCollection();
const allHtml = cardHtml('monster-collection-grid');
STAR_IDS.forEach(function (id) {
  assert(allHtml.includes(NAMES[id]), 'collection lists ' + NAMES[id]);
});
assert(allHtml.includes('ui-star-card-elden.png?v=' + STAR_CARD_SHA.st_elden), 'collection renders the cache-busted full scene');
assert(allHtml.includes('monster-art-frame'), 'collection art sits in a clipping frame');
api.setFilter('mythic');
api.renderCollection();
const mythicHtml = cardHtml('monster-collection-grid');
assert(mythicHtml.includes('艾爾德') && mythicHtml.includes('青龍'), 'mythic filter shows star-trail with shanhaijing');
assert(!mythicHtml.includes('火寶寶'), 'mythic filter hides elemental lines');
api.setFilter('elemental');
api.renderCollection();
const elementalHtml = cardHtml('monster-collection-grid');
assert(elementalHtml.includes('火寶寶') && !elementalHtml.includes('艾爾德'), 'elemental filter hides star-trail cards');

api.setSeries('star-trail');
api.applyChrome();
assert(game.__els['gacha-hint'].textContent === HINT_STAR, 'star-trail tab shows the open hint');
assert(game.__els['gacha-pool-status'].hidden === true, 'open pool hides 卡池即將開放');
assert(game.__els['btn-gacha-1'].disabled === false && game.__els['btn-gacha-10'].disabled === false, 'open pool enables draw buttons');
assert(game.__els['gacha-series-banner'].hidden === false, 'star-trail banner stays visible');
