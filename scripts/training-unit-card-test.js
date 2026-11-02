/**
 * 訓練場單元風景卡：九張 SHA、1224×692、?v=、依年級列表 index 套用，標題用 GRADE_UNITS.name。
 * node scripts/training-unit-card-test.js
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const CARDS = [
  { cls: 'adventure-card--count', file: 'assets/bg/ui-train-unit-01-count.png', sha256: '6a11e095076006123c0f366d2d495ec89cda7d378dd7cc168deb659bf7cc0de7' },
  { cls: 'adventure-card--addsub', file: 'assets/bg/ui-train-unit-02-addsub.png', sha256: 'd540831c7e78d6a13d4d1e3aace360c948c199e8029f2ac3b719bab2244846b2' },
  { cls: 'adventure-card--hundred', file: 'assets/bg/ui-train-unit-03-hundred.png', sha256: '5be7b13df419ea1e4d4bed623226dbfd2e4a48f8919613b32b1351228fca1142' },
  { cls: 'adventure-card--coins', file: 'assets/bg/ui-train-unit-04-coins.png', sha256: 'ccd211a110d24feb21bd47a16f023018e4142698532870ddf01565bbb83cd366' },
  { cls: 'adventure-card--length', file: 'assets/bg/ui-train-unit-05-length.png', sha256: '08a01eccbe70d96aa96bb1aa5f618a98fd3bc989d758d6554d0bb71a22fb3865' },
  { cls: 'adventure-card--time', file: 'assets/bg/ui-train-unit-06-time.png', sha256: 'daa87a9c10b9bd133078d3b43ae5624073086821ba6ced234153aaeb366b63a5' },
  { cls: 'adventure-card--fractions', file: 'assets/bg/ui-train-unit-07-fractions.png', sha256: 'd045ecf2e42507989687bf1a152b26e0eb470308e4f5a6445b3b99f86efe1121' },
  { cls: 'adventure-card--measure', file: 'assets/bg/ui-train-unit-08-measure.png', sha256: 'f83c68acf4cf58f76aafb15fd99df8ed820aaa5171183b21af83d5e4794810ae' },
  { cls: 'adventure-card--algebra', file: 'assets/bg/ui-train-unit-09-algebra.png', sha256: '5400e7fc8b7134e5d597812506f8c9f2e538c69766b9747ae2fa5c4f4728f49e' }
];

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exitCode = 1;
  } else {
    console.log('ok:', msg);
  }
}

function pngSize(buf) {
  assert(buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'png signature');
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

CARDS.forEach(function (spec, index) {
  const bytes = fs.readFileSync(path.join(root, spec.file));
  const sha = crypto.createHash('sha256').update(bytes).digest('hex');
  const size = pngSize(bytes);
  const v = sha.slice(0, 8);
  assert(sha === spec.sha256, 'slot ' + index + ' SHA-256');
  assert(size.w === 1224 && size.h === 692, 'slot ' + index + ' is 1224×692');
  assert(html.includes(spec.file + '?v=' + v), 'slot ' + index + ' cache-bust ?v=' + v);
  assert(html.includes('.' + spec.cls + ' .adventure-card__frame'), spec.cls + ' sets the frame image');
});

const listStart = html.indexOf('const TRAIN_UNIT_SCENIC = [');
const listEnd = html.indexOf('];', listStart);
assert(listStart >= 0 && listEnd > listStart, 'scenic list is an index array');
const listBody = html.slice(listStart, listEnd);
CARDS.forEach(function (spec, index) {
  const at = listBody.indexOf("'" + spec.cls + "'");
  assert(at >= 0, 'list contains ' + spec.cls);
  const earlier = CARDS.slice(0, index).every(function (prev) {
    const prevAt = listBody.indexOf("'" + prev.cls + "'");
    return prevAt >= 0 && prevAt < at;
  });
  assert(earlier, 'slot ' + index + ' is ' + spec.cls);
});
assert(html.includes('const scenic = TRAIN_UNIT_SCENIC[idx]'), 'cards pick art by unit index');
assert(!html.includes("g1_u1: 'adventure-card--count'"), 'art is not pinned to G1 ids');

const unitsStart = html.indexOf('const GRADE_UNITS = ');
const unitsEnd = html.indexOf('let currentUser');
assert(unitsStart >= 0 && unitsEnd > unitsStart, 'GRADE_UNITS block');
const context = { console: console };
vm.createContext(context);
vm.runInContext(html.slice(unitsStart, unitsEnd) + '\nthis.GRADE_UNITS = GRADE_UNITS;\n', context);
const units = context.GRADE_UNITS;
assert(units.G1.length === 6, 'G1 has 6 units');
assert(units.G2.length === 7, 'G2 has 7 units');
assert(units.G3.length === 6 && units.G4.length === 6, 'G3 and G4 have 6 units');
assert(units.G5.length === 9 && units.G6.length === 9, 'G5 and G6 have 9 units');
assert(units.G2[6].name.indexOf('時間') >= 0, 'G2 slot 7 title is still its unit name');
assert(units.G5[8].name.indexOf('代數') >= 0, 'G5 slot 9 title is still its unit name');
assert(units.G6[6].name.indexOf('折線圖') >= 0, 'G6 slot 7 title is still its unit name');
assert(units.G6[8].name.indexOf('方程') >= 0, 'G6 slot 9 title is still its unit name');
['G1', 'G2', 'G3', 'G4', 'G5', 'G6'].forEach(function (grade) {
  units[grade].forEach(function (unit) {
    assert(html.includes(unit.name), grade + ' title stays in HTML: ' + unit.name);
  });
});

assert(html.includes("title.textContent = u.name"), 'unit titles are HTML text, not baked into the image');
assert(html.includes("openTeamSelect(u.id, false)"), 'unit cards still open the quiz team select');
assert(html.includes('ui-adventure-unit-card-scenic-wide.png'), 'shared frame remains the fallback');
assert(html.includes("ui-adventure-tower-add-fire.png?v=862ab859"), 'adventure fire tower art is unchanged');
assert(html.includes("ui-adventure-tower-sub-ice.png?v=9f616294"), 'adventure ice tower art is unchanged');
assert(html.includes("ui-ranked-card-water-scenic-wide.png"), 'ranked scenic cards are unchanged');
assert(!/adventure-tower-card--add[\s\S]{0,180}ui-train-unit-/.test(html), 'tower cards do not use training art');
