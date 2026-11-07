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
  'assets/bg/ui-gacha-banner-star-trail-1920.png': 'a5fd33bf',
  'assets/bg/ui-lobby-carousel-star-trail-1920.png': '13e864c8',
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
assert(view.includes('ui-gacha-banner-star-trail-1920.png?v=a5fd33bf'), 'star-trail stage banner cache-bust');
assert(view.includes('卡池即將開放'), 'closed pool is labeled on the star-trail stage');
assert(!view.includes('ui-gacha-banner-star-trail-wide.png'), 'old wide banner is not the stage');
assert(!html.includes('ui-lobby-carousel-star-trail-1920.png?v=71adfa44'), 'carousel does not use the promo hash');
assert(html.includes('ui-lobby-carousel-star-trail-1920.png?v=13e864c8'), 'lobby slide uses the 1920×720 plate');
assert(html.includes("openGachaSeries('star-trail')"), 'star-trail slide opens that tab');
assert(html.includes("openGachaSeries('shanhaijing')"), 'shanhaijing slide opens that tab');
assert(html.includes('開始冒險'), 'welcome slide still starts the adventure');
assert(html.includes('data-lobby-dot="2"'), 'carousel has a third dot');
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
assert(html.includes('const STAR_TRAIL_BEASTS = []'), 'no placeholder star-trail roster');
assert(html.includes("'star-trail': { series: 'star-trail', open: false }"), 'star-trail pool stays closed');
assert(html.includes('STAR_TRAIL_BEASTS'), 'runtime lookup can read a future star-trail roster');

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
