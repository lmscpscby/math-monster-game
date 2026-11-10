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
  { cls: 'adventure-card--count', file: 'assets/bg/ui-train-unit-01-count.png', sha256: '3f3b07d79ed1fa8f9cc1e4ed3c560b22cbd8ded9b9bcef926ba11b247cc486bc' },
  { cls: 'adventure-card--addsub', file: 'assets/bg/ui-train-unit-02-addsub.png', sha256: 'e16118272e56743c564d3c6c97df647ca0d92aaec8cdb1c6efcc821a09b53679' },
  { cls: 'adventure-card--hundred', file: 'assets/bg/ui-train-unit-03-hundred.png', sha256: '44a1a7fcde6e883a1e0ec36381940f1ddd6ef36aa25d327c5bc009c9fd4ec098' },
  { cls: 'adventure-card--coins', file: 'assets/bg/ui-train-unit-04-coins.png', sha256: '85cf77aabf250c77f9e8645538eec7d2212709ca1066040ae2d02a6a588d2196' },
  { cls: 'adventure-card--length', file: 'assets/bg/ui-train-unit-05-length.png', sha256: 'd9c4168f60a6926e3c9aa6ecab8964165db0d8c1da70c9736b39903aa6ca5929' },
  { cls: 'adventure-card--time', file: 'assets/bg/ui-train-unit-06-time.png', sha256: '98a762eb12796a01c5d7fa7743589d7838aefab2833538432336afb3e773b73b' },
  { cls: 'adventure-card--fractions', file: 'assets/bg/ui-train-unit-07-fractions.png', sha256: '0125b41ad9e7fe2c0424f8c3eae0331efdf72c5bf4afe267e15d993495b8f9d5' },
  { cls: 'adventure-card--measure', file: 'assets/bg/ui-train-unit-08-measure.png', sha256: '1e44d88994f07e65d754331e89963bebf747b57c1d189906d599fc233c87018b' },
  { cls: 'adventure-card--algebra', file: 'assets/bg/ui-train-unit-09-algebra.png', sha256: '4226ef0a7a35ca6e52966d821fc66aab4ee0095c61dddad8bc686f905e6115ec' }
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
assert(html.includes("ui-adventure-tower-add-fire.png?v=39a271a4"), 'adventure fire tower cache-bust matches the compressed plate');
assert(html.includes("ui-adventure-tower-sub-ice.png?v=774dcc7c"), 'adventure ice tower cache-bust matches the compressed plate');
assert(html.includes("ui-ranked-card-water-scenic-wide.png"), 'ranked scenic cards stay on the scenic files');
assert(!/adventure-tower-card--add[\s\S]{0,180}ui-train-unit-/.test(html), 'tower cards do not use training art');
