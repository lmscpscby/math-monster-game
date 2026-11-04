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

Object.keys(EXPECTED).forEach(function (file) {
  const prefix = EXPECTED[file];
  const bytes = fs.readFileSync(path.join(root, file));
  const sha = crypto.createHash('sha256').update(bytes).digest('hex');
  assert(sha.slice(0, 8) === prefix, file + ' SHA-256 prefix ' + sha.slice(0, 8));
  assert(html.includes(file + '?v=' + prefix), 'index.html cache-busts ' + file);
});

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
assert(!view.includes('元'), 'gacha view does not price in 元');
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
assert(!draw.includes('pity'), 'drawGacha does not grow a 100-pull pity counter');

const fnStart = html.indexOf('/* GACHA_GUARANTEE_REMAINING_START */');
const fnEnd = html.indexOf('/* GACHA_GUARANTEE_REMAINING_END */');
assert(fnStart >= 0 && fnEnd > fnStart, 'guarantee helper markers');
const context = {};
vm.createContext(context);
vm.runInContext(html.slice(fnStart, fnEnd), context);
assert(context.gachaGuaranteeRemaining() === 10, '距離必出次數 is the 10-card ten-pull window');
assert(!html.includes('冰羽熾天神龍'), 'colleague UR roster is not shipped');
assert(!html.includes('召喚概率公示'), 'rates disclosure heading is not shipped');
