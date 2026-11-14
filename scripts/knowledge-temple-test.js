/**
 * 知識聖殿：島嶼牌開門廳。
 * 星軌編年 10 人（含沃里克），山海經編年 11 則（含夔牛）都可以入。
 * 兩本編年各自有底圖；星軌卷軸仍用符文羊皮紙。
 * 沃里克唔入星軌抽卡池。夔牛顯示名維持圖鑑／抽卡嘅「夔牛」。
 *
 * node scripts/knowledge-temple-test.js
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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

function sliceBetween(src, startMark, endMark) {
  const start = src.indexOf(startMark);
  const end = src.indexOf(endMark, start + startMark.length);
  assert(start !== -1 && end !== -1, 'slice ' + startMark);
  return src.slice(start, end);
}

function islandButton(cls) {
  const match = html.match(new RegExp('<button[^>]*island-hotspot--' + cls + '[\\s\\S]*?<\\/button>'));
  assert(match, 'island hotspot --' + cls);
  return match ? match[0] : '';
}

const templeBtn = islandButton('temple');
assert(templeBtn.includes("switchView('temple')"), 'map plate opens the hall');
assert(templeBtn.includes('>知識聖殿<'), 'map plate says 知識聖殿');
assert(!templeBtn.includes('未開放') && !templeBtn.includes('island-hotspot--locked'), 'map plate is not locked');
assert(!templeBtn.includes("switchView('monsters')") && !templeBtn.includes('enterAdventure'), 'temple is not the codex or adventure');
['recreation', 'darkforest', 'sunkencity', 'desert', 'ocean'].forEach(function (cls) {
  assert(islandButton(cls).includes('（未開放）'), cls + ' stays locked copy');
});

const hall = sliceBetween(html, 'id="view-temple" class="temple-hall hidden"', 'id="view-temple-star" class="temple-chronicle hidden"');
const star = sliceBetween(html, 'id="view-temple-star" class="temple-chronicle hidden"', 'id="view-temple-shanhai" class="temple-chronicle hidden"');
const shan = sliceBetween(html, 'id="view-temple-shanhai" class="temple-chronicle hidden"', '</main>');

assert(hall.includes("switchView('home')") && hall.includes('返回島嶼'), 'hall returns to the map');
assert(hall.includes("switchView('temple-star')"), 'star-trail book opens the chronicle');
assert(hall.includes("switchView('temple-shanhai')"), 'shan-hai book opens the chronicle');
assert(hall.includes('>星軌命途<') && hall.includes('>符文紀元<'), 'star-trail title and subtitle are separate lines');
assert(hall.includes('>山海經<') && hall.includes('>神魔異獸<'), 'shan-hai title and subtitle are separate lines');
assert(hall.includes('>10 位英雄編年<'), 'star-trail note is exactly 10 位英雄編年');
assert(!hall.includes('9 位英雄'), 'hall no longer says 9 heroes');
assert(hall.includes('>11 則神獸編年<'), 'shan-hai note is exactly 11 則神獸編年');
assert(!html.includes('可翻閱'), '可翻閱 is absent from the shipped site');
assert(!hall.includes('故事未到') && !hall.includes('可先入內查看'), 'shan-hai note does not say the stories are missing');
assert(!hall.includes('temple-book--pending'), 'shan-hai book is not pending');
assert(hall.includes('ui-temple-hall-bg-1920.jpg') === false, 'hall background is CSS, not an img tag');
assert(hall.includes('ui-temple-book-star-trail.png?v=') && hall.includes('ui-temple-book-shanhai.png?v='), 'official book filenames');

const shanBtn = hall.match(/<button[^>]*onclick="switchView\('temple-shanhai'\)"[^>]*>[\s\S]*?<\/button>/);
assert(shanBtn, 'shan-hai book is a clickable button');
assert(shanBtn && shanBtn[0].includes('ui-temple-book-shanhai.png?v=') && shanBtn[0].includes('>山海經<') && shanBtn[0].includes('>神魔異獸<') && shanBtn[0].includes('>11 則神獸編年<'), 'shan-hai cover, title, subtitle, and note stay visible');
assert(shanBtn && shanBtn[0].includes('aria-label="翻閱山海經：神魔異獸"'), 'shan-hai book aria-label uses the new subtitle');
assert(!/尚未上線|備用|肖像生成中|preview-banner/.test(hall + star + shan), 'preview banners and the Warwick placeholder are gone');

assert(star.includes("switchView('temple')") && star.includes('返回知識聖殿選書'), 'chronicle returns to the hall');
assert((star.match(/class="portrait-img"/g) || []).length === 10, 'chronicle shows 10 portraits');
assert(star.includes('ui-temple-portrait-warwick.jpg?v=') && star.includes('alt="熔岩狂戰士：沃里克"'), 'Warwick uses the portrait file');
assert(star.includes('id="warwick"') && star.includes('href="#warwick"'), 'Warwick card is in the chronicle nav');
assert(star.includes('疼痛是弱者的喪鐘'), 'Warwick story text stays');
assert(star.includes('過命兄弟') && star.includes('嘴硬護短'), 'Warwick bonds stay');
['elijah', 'selina', 'serafina', 'malakor', 'elden', 'warwick', 'fey', 'lucia', 'noah', 'thorin'].forEach(function (id) {
  assert(star.includes('id="' + id + '"'), 'story visible: ' + id);
});
assert(!star.includes('ownedMonsters'), 'chronicle is not filtered by ownership');

assert(shan.includes("switchView('temple')") && shan.includes('返回知識聖殿選書'), 'shan-hai chronicle returns to the hall');
assert(shan.includes('aria-label="山海經：神魔異獸"'), 'shan-hai page aria-label uses the new subtitle');
assert(shan.includes('Classic of Mountains and Seas Imperial Bestiary'), 'shan-hai ministry label');
assert(shan.includes('>山海經<span class="series-sub">神魔異獸</span><'), 'shan-hai title and subtitle');
assert(shan.includes('大荒及內外經上古卷宗・仙靈惡獸秘錄'), 'shan-hai subtitle line');
assert(!shan.includes('卷宗尚未入庫') && !shan.includes('故事尚未送到') && !shan.includes('尚未送到'), 'empty vault copy is gone');
assert((shan.match(/class="portrait-img"/g) || []).length === 11, 'shan-hai shows 11 portraits');
assert(!shan.includes('ui-temple-portrait-'), 'shan-hai reuses beast art, not invented temple portraits');
assert(!shan.includes('ownedMonsters'), 'shan-hai chronicle is not filtered by ownership');
const shanNames = ['青龍', '帝江', '燭龍', '饕餮', '九尾狐', '窮奇', '應龍', '朱厭', '畢方', '白澤', '夔牛'];
const shanIds = ['qinglong', 'dijiang', 'zhulong', 'taotie', 'jiuweihu', 'qiongqi', 'yinglong', 'zhuyan', 'bifang', 'baize', 'kuiniu'];
shanIds.forEach(function (id, index) {
  assert(shan.includes('id="' + id + '"') && shan.includes('href="#' + id + '"'), 'shan-hai story visible: ' + id);
  assert(shan.includes('>' + shanNames[index] + '<'), 'shan-hai display name: ' + shanNames[index]);
});
assert(shan.includes('assets/monsters/classic/青龍.jpg'), 'qinglong portrait path');
assert(shan.includes('assets/monsters/classic/帝江.jpg'), 'dijiang portrait path');
assert(shan.includes('assets/monsters/classic/image_2.jpg'), 'zhulong portrait path');
assert(shan.includes('assets/monsters/classic/image_3.jpg'), 'taotie portrait path');
assert(shan.includes('assets/monsters/classic/九尾狐.jpg'), 'jiuweihu portrait path');
assert(shan.includes('assets/monsters/classic/image_5.jpg'), 'qiongqi portrait path');
assert(shan.includes('assets/monsters/classic/ui-shan-yinglong.png?v=925c313f'), 'yinglong portrait cache-bust');
assert(shan.includes('assets/monsters/classic/ui-shan-zhuyan.png?v=8fcda412'), 'zhuyan portrait cache-bust');
assert(shan.includes('assets/monsters/classic/ui-shan-bifang.png?v=0f2921a0'), 'bifang portrait cache-bust');
assert(shan.includes('assets/monsters/classic/ui-shan-baize.png?v=11c78fbb'), 'baize portrait cache-bust');
assert(shan.includes('assets/monsters/classic/ui-shan-kui.png?v=2d370d44'), 'kuiniu portrait cache-bust');
assert(!shan.includes('src="青龍.jpg"') && !shan.includes('夔牛.png') && !shan.includes('畢方.png'), 'preview portrait filenames are not shipped');
const kui = sliceBetween(shan, 'id="kuiniu"', '</article>');
assert(kui.includes('<h2>夔牛</h2>') && kui.includes('alt="夔牛"'), 'kuiniu display name is the roster name 夔牛');
assert(kui.includes('神獸起源') && kui.includes('性靈與神威'), 'kuiniu keeps the complete origin and nature sections');
assert(!kui.includes('風雨同舟') && !kui.includes('bond-item') && !kui.includes('天地大荒羈絆'), 'truncated kuiniu bond section is omitted');
assert((shan.match(/<article\b/g) || []).length === 11 && (shan.match(/<\/article>/g) || []).length === 11, 'eleven shan-hai articles are closed');
assert(!shan.includes('饎') && !shan.includes('薝') && !html.includes('饎') && !html.includes('薝'), 'display name does not regress to 饎 or 薝');
assert(!html.includes('神獸志異'), 'old subtitle 神獸志異 is absent from the site');
assert(!html.includes('故事未到'), '故事未到 is absent from the site');

const views = html.match(/const views = \[([^\]]+)\]/);
assert(views && views[1].includes("'temple'") && views[1].includes("'temple-star'") && views[1].includes("'temple-shanhai'"), 'switchView knows the temple screens');
assert(html.includes("document.body.classList.toggle('temple-hall', viewName === 'temple')"), 'hall background class follows the hall view');
assert(html.includes("document.body.classList.toggle('temple-read', viewName === 'temple-star' || viewName === 'temple-shanhai')"), 'both chronicles use the read layout');
assert(html.includes("document.body.classList.toggle('temple-read--star', viewName === 'temple-star')"), 'star chronicle has its own background class');
assert(html.includes("document.body.classList.toggle('temple-read--shanhai', viewName === 'temple-shanhai')"), 'shan-hai chronicle has its own background class');
assert(html.includes("switchView('home')") && html.includes('window.scrollTo(0, 0)'), 'leaving the temple scrolls back to the top of the map');

const roster = html.slice(html.indexOf('const STAR_TRAIL_BEASTS = ['), html.indexOf('const GACHA_POOLS'));
const ids = roster.match(/id: '(st_[a-z]+)'/g).map(function (s) { return s.slice(5, -1); });
assert(ids.join(',') === 'st_elden,st_elijah,st_fey,st_lucia,st_malakor,st_noah,st_selina,st_serafina,st_thorin', 'gacha pool stays the nine summonable heroes, got ' + ids.join(','));
assert(!roster.includes('warwick') && !roster.includes('沃里克') && !html.includes("id: 'st_warwick'"), 'Warwick is not a gacha id');
assert(html.includes("{ id: 'sh13', name: '夔牛'"), 'sh13 display name is 夔牛');

assert(html.includes('family=Cinzel:wght@600;800') && html.includes('family=Cinzel+Decorative:wght@700;900'), 'Cinzel and Cinzel Decorative are loaded');
assert(html.includes('Noto+Serif+TC:wght@400;600;700;900'), 'Noto Serif TC includes the temple weights');
const templeCss = html.slice(html.indexOf('/* Knowledge Temple.'), html.indexOf('</style>'));
assert(templeCss.includes('color: #fff0d4') && templeCss.includes('color: #e5b95c') && templeCss.includes('color: #c9b089'), 'locked title, subtitle, and note colors');
assert(templeCss.includes('Cinzel Decorative') && templeCss.includes('"Noto Serif TC"') && templeCss.includes('"Cinzel"'), 'temple type stacks');
assert(templeCss.includes("url('assets/bg/ui-temple-hall-bg-1920.jpg?v=") && templeCss.includes('background-size: cover'), 'hall background covers');
assert(/#view-temple-star \.hero-scroll \{[\s\S]*?url\('assets\/bg\/rune-parchment-bg\.jpg\?v=ecde0c6a'\)/.test(templeCss), 'star scrolls stay on the live rune parchment');
assert(templeCss.includes("linear-gradient(rgba(13, 8, 6, 0.52), rgba(13, 8, 6, 0.70)),\n                url('assets/bg/ui-star-trail-story-bg-1920.jpg?v="), 'star page background overlay');
assert(templeCss.includes("linear-gradient(rgba(9, 5, 3, 0.52), rgba(9, 5, 3, 0.70)),\n                url('assets/bg/ui-shanhai-story-bg-1920.jpg?v="), 'shan-hai page background overlay');
assert(templeCss.includes("linear-gradient(rgba(245, 238, 223, 0.86), rgba(239, 228, 207, 0.90)),\n                url('assets/bg/ui-shanhai-scroll-parchment.jpg?v="), 'shan-hai scroll parchment overlay');
assert(templeCss.includes('background-position: center top') && templeCss.includes('background-attachment: fixed'), 'chronicle backgrounds are fixed and top-aligned');

function fileHash(rel) {
  const buf = fs.readFileSync(path.join(root, rel));
  return { buf: buf, hash: crypto.createHash('sha256').update(buf).digest('hex').slice(0, 8), bytes: buf.length };
}
const assets = [
  'assets/bg/ui-temple-hall-bg-1920.jpg',
  'assets/bg/ui-temple-book-star-trail.png',
  'assets/bg/ui-temple-book-shanhai.png',
  'assets/bg/rune-parchment-bg.jpg',
  'assets/bg/ui-temple-portrait-elijah.jpg',
  'assets/bg/ui-temple-portrait-selina.jpg',
  'assets/bg/ui-temple-portrait-serafina.jpg',
  'assets/bg/ui-temple-portrait-malakor.jpg',
  'assets/bg/ui-temple-portrait-elden.jpg',
  'assets/bg/ui-temple-portrait-warwick.jpg',
  'assets/bg/ui-temple-portrait-fey.jpg',
  'assets/bg/ui-temple-portrait-lucia.jpg',
  'assets/bg/ui-temple-portrait-noah.jpg',
  'assets/bg/ui-temple-portrait-thorin.jpg'
];
let total = 0;
assets.forEach(function (rel) {
  const info = fileHash(rel);
  total += info.bytes;
  assert(html.includes(rel + '?v=' + info.hash), rel + ' cache-bust matches sha256 ' + info.hash);
  const cap = rel.indexOf('portrait') !== -1 ? 400 * 1024 : 500 * 1024;
  assert(info.bytes < cap, rel + ' stays compressed, got ' + info.bytes);
});
assert(total < 6 * 1024 * 1024, 'new temple assets stay under 6MB, got ' + total);
const storyBgs = [
  'assets/bg/ui-shanhai-story-bg-1920.jpg',
  'assets/bg/ui-shanhai-scroll-parchment.jpg',
  'assets/bg/ui-star-trail-story-bg-1920.jpg'
];
let storyBytes = 0;
storyBgs.forEach(function (rel) {
  const info = fileHash(rel);
  storyBytes += info.bytes;
  assert(html.includes(rel + '?v=' + info.hash), rel + ' cache-bust matches sha256 ' + info.hash);
  assert(info.bytes < 1024 * 1024, rel + ' stays under 1MB, got ' + info.bytes);
});
assert(storyBytes < 2 * 1024 * 1024, 'three new story backgrounds stay under 2MB, got ' + storyBytes);
assert(fs.existsSync(path.join(root, '.nojekyll')), '.nojekyll stays');
assert(!fs.existsSync(path.join(root, 'preview-hall.png')), 'preview screenshot is not in the repo');
assert(!html.includes('ownedMonsters') || star.indexOf('ownedMonsters') === -1, 'star chronicle does not read ownedMonsters');

if (process.exitCode) {
  console.error('knowledge temple tests failed');
  process.exit(process.exitCode);
}
console.log('knowledge temple tests passed');
