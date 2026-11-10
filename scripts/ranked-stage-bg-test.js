/**
 * 積分爭霸賽屬性戰場：檔案 SHA-256、cache-bust、stage key / element id 對應。
 * node scripts/ranked-stage-bg-test.js
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const EXPECTED = {
  water: {
    file: 'assets/bg/ui-battle-stage-bg-water-1920.png',
    sha256: '3070bcae0668f06d8f1ee75026b22fbb01274f03fb0853d7d595087953affb8d'
  },
  fire: {
    file: 'assets/bg/ui-battle-stage-bg-fire-1920.png',
    sha256: '9b29a09d26afa91cf89e951a43e61e0a1ad3bd2c7cfa6e0049fbe190daa14c45'
  },
  grass: {
    file: 'assets/bg/ui-battle-stage-bg-grass-1920.png',
    sha256: '47f4f3a3258cb92ae8bb111a2650c3231082fe945a2c52618fcd8e7b4f794f9c'
  },
  thunder: {
    file: 'assets/bg/ui-battle-stage-bg-thunder-1920.png',
    sha256: '0024070fbc70b0cbe4334b748dbb4a41c4bb7651dd76bd0c73a8b41fff368f7c'
  }
};

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exitCode = 1;
  } else {
    console.log('ok:', msg);
  }
}

Object.keys(EXPECTED).forEach(function (elementId) {
  const spec = EXPECTED[elementId];
  const bytes = fs.readFileSync(path.join(root, spec.file));
  const sha = crypto.createHash('sha256').update(bytes).digest('hex');
  assert(sha === spec.sha256, elementId + ' SHA-256 ' + sha);
  assert(sha.slice(0, 8) === spec.sha256.slice(0, 8), elementId + ' cache key ' + sha.slice(0, 8));
  assert(html.includes("'" + spec.file + "'") || html.includes('"' + spec.file + '"'), 'index.html references ' + spec.file);
  assert(html.includes("v: '" + sha.slice(0, 8) + "'"), 'index.html cache-busts ' + elementId + ' with ?v=' + sha.slice(0, 8));
});

const poolStart = html.indexOf('const BATTLE_STAGE_BACKGROUNDS = [');
const poolEnd = html.indexOf('];', poolStart);
const pool = html.slice(poolStart, poolEnd);
Object.keys(EXPECTED).forEach(function (elementId) {
  assert(!pool.includes(path.basename(EXPECTED[elementId].file)), 'random pool excludes ' + elementId);
});
assert(pool.includes('ui-battle-stage-bg-1920.png'), 'random pool keeps parchment');
assert(pool.includes('ui-battle-stage-bg-forest-1920.png'), 'random pool keeps forest');
assert(pool.includes('ui-battle-stage-bg-beach-1920.png'), 'random pool keeps beach');
assert(pool.includes('ui-battle-stage-bg-volcano-1920.png'), 'random pool keeps volcano');
assert(pool.includes('ui-battle-stage-bg-arena-1920.png'), 'random pool keeps arena');

const markerA = 'const RANKED_STAGE_ELEMENT = {';
const markerB = '/* RANKED_ATTRIBUTE_STAGE_BG_END */';
const start = html.indexOf(markerA);
const end = html.indexOf(markerB);
assert(start >= 0 && end > start, 'ranked stage block markers');
const block = html.slice(start, end);

const context = { console, Number, String, Object };
vm.createContext(context);
vm.runInContext(block, context);

const cases = [
  [10, 'water'],
  ['10', 'water'],
  [20, 'fire'],
  [30, 'grass'],
  [40, 'thunder'],
  ['water', 'water'],
  ['fire', 'fire'],
  ['grass', 'grass'],
  ['thunder', 'thunder'],
  ['水', 'water'],
  ['火', 'fire'],
  ['草', 'grass'],
  ['雷', 'thunder'],
  ['水系', 'water'],
  ['火系', 'fire'],
  ['草系', 'grass'],
  ['雷系', 'thunder'],
  ['WATER', 'water'],
  ['Thunder', 'thunder']
];

cases.forEach(function (pair) {
  const elementId = context.rankedElementId(pair[0]);
  const url = context.rankedAttributeStageUrl(pair[0]);
  const spec = EXPECTED[pair[1]];
  assert(elementId === pair[1], 'key ' + pair[0] + ' → ' + elementId);
  assert(url === spec.file + '?v=' + spec.sha256.slice(0, 8), 'url for ' + pair[0] + ' is ' + url);
});

['rock', 'fight', 15, '', null, '雷電'].forEach(function (key) {
  assert(context.rankedElementId(key) === '', 'non-attribute key ' + key + ' is unmapped');
  assert(context.rankedAttributeStageUrl(key) === '', 'non-attribute key ' + key + ' has no plate');
});

const entryFn = html.slice(html.indexOf('function applyBattleStageForEntry'), html.indexOf('function prefersReducedMotion'));
const beforeRandom = entryFn.slice(0, entryFn.indexOf('applyRandomBattleStage()'));
assert(entryFn.includes('applyRankedAttributeBattleStage(elementId)'), 'ranked entry applies the attribute plate');
assert(beforeRandom.includes('if (elementId)') && beforeRandom.includes('return;'), 'ranked attribute entry returns before the random pool');
assert(entryFn.trim().endsWith('applyRandomBattleStage();\n        }'), 'random pool is only the non-attribute fallback');

const startBattle = html.slice(html.indexOf('function startBattleWithSelectedTeam'), html.indexOf('function setupRankedBossEnemy'));
assert(startBattle.includes('applyBattleStageForEntry()'), 'battle entry uses applyBattleStageForEntry');
assert(!startBattle.includes('applyRandomBattleStage()'), 'battle entry does not call applyRandomBattleStage directly');

if (process.exitCode) {
  console.error('ranked stage background checks failed');
} else {
  console.log('ranked stage background checks passed');
}
