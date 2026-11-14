/**
 * 知識聖殿：島嶼牌開門廳，星軌編年 10 人（含沃里克）。
 * 山海經封面留喺大廳，故事未到之前唔可以入。空卷頁仍留喺程式入面。
 * 沃里克唔入星軌抽卡池。
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
assert(!hall.includes("switchView('temple-shanhai')"), 'shan-hai book does not call switchView');
assert(!/onclick\s*=\s*["'][^"']*temple-shanhai/.test(hall), 'shan-hai book has no onclick into the empty page');
assert(!/href\s*=\s*["'][^"']*(?:temple-shanhai|view-temple-shanhai)/.test(hall), 'shan-hai book has no href into the empty page');
assert(hall.includes('>星軌命途<') && hall.includes('>符文紀元<'), 'star-trail title and subtitle are separate lines');
assert(hall.includes('>山海經<') && hall.includes('>神獸志異<'), 'shan-hai title and subtitle are separate lines');
assert(hall.includes('10 位英雄編年　可翻閱'), 'star-trail note counts 10, including Warwick');
assert(!hall.includes('9 位英雄'), 'hall no longer says 9 heroes');
assert(hall.includes('>故事未到<'), 'shan-hai hall note says 故事未到');
assert(!hall.includes('可先入內查看'), 'shan-hai note does not invite entry');
assert(hall.includes('ui-temple-hall-bg-1920.jpg') === false, 'hall background is CSS, not an img tag');
assert(hall.includes('ui-temple-book-star-trail.png?v=') && hall.includes('ui-temple-book-shanhai.png?v='), 'official book filenames');

const shanMark = hall.indexOf('temple-book--pending');
const shanOpen = hall.slice(hall.lastIndexOf('<', shanMark), hall.indexOf('>', shanMark) + 1);
const shanBook = hall.slice(shanMark);
assert(shanMark !== -1 && /^<div\b/.test(shanOpen), 'shan-hai book is visible and is not a button');
assert(!/\bbutton\b|onclick|href\s*=|tabindex|role\s*=\s*["']button["']|switchView/.test(shanOpen + shanBook), 'shan-hai book does not navigate');
assert(shanBook.includes('ui-temple-book-shanhai.png?v=') && shanBook.includes('>山海經<') && shanBook.includes('>神獸志異<') && shanBook.includes('>故事未到<'), 'shan-hai cover, title, subtitle, and note stay visible');
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

assert(shan.includes("switchView('temple')"), 'empty page returns to the hall');
assert(shan.includes('>卷宗尚未入庫<') && shan.includes('故事尚未送到'), 'shan-hai stays the empty coming-soon page');
assert(shan.includes('同事嘅山海經故事同圖卡尚未送到'), 'shan-hai keeps the waiting copy');
assert(!shan.includes('class="portrait-img"') && !shan.includes('ui-temple-portrait-'), 'shan-hai has no invented portraits');

const views = html.match(/const views = \[([^\]]+)\]/);
assert(views && views[1].includes("'temple'") && views[1].includes("'temple-star'") && views[1].includes("'temple-shanhai'"), 'switchView knows the temple screens');
assert(html.includes("document.body.classList.toggle('temple-hall', viewName === 'temple')"), 'hall background class follows the hall view');
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
const pendingCss = templeCss.slice(templeCss.indexOf('#view-temple .temple-book.temple-book--pending'));
assert(pendingCss.startsWith('#view-temple .temple-book.temple-book--pending'), 'pending book has a disabled look');
assert(/\{\s*cursor:\s*default;\s*opacity:\s*0\.\d+;/.test(pendingCss), 'pending book uses the default cursor and stays slightly dimmed');
assert(/temple-book--pending:hover[\s\S]*?transform:\s*none/.test(pendingCss), 'pending book does not lift on hover');
assert(templeCss.includes('Cinzel Decorative') && templeCss.includes('"Noto Serif TC"') && templeCss.includes('"Cinzel"'), 'temple type stacks');
assert(templeCss.includes("url('assets/bg/ui-temple-hall-bg-1920.jpg?v=") && templeCss.includes('background-size: cover'), 'hall background covers');
assert(templeCss.includes("url('assets/bg/rune-parchment-bg.jpg?v="), 'parchment backs the chronicle');

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
assert(fs.existsSync(path.join(root, '.nojekyll')), '.nojekyll stays');
assert(!fs.existsSync(path.join(root, 'preview-hall.png')), 'preview screenshot is not in the repo');
assert(!html.includes('ownedMonsters') || star.indexOf('ownedMonsters') === -1, 'star chronicle does not read ownedMonsters');

if (process.exitCode) {
  console.error('knowledge temple tests failed');
  process.exit(process.exitCode);
}
console.log('knowledge temple tests passed');
