/**
 * 四神塔：卡片 SHA／cache-bust、樓層解鎖、星星獎勵、元素戰場。
 * node scripts/adventure-tower-test.js
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const CARDS = {
  addition: {
    file: 'assets/bg/ui-adventure-tower-add-fire.png',
    sha256: '862ab859d82d4d998704c65729490e1848f70c969de9c85053ee1641479bd9bd',
    label: '火焰加法塔',
    element: 'fire'
  },
  subtraction: {
    file: 'assets/bg/ui-adventure-tower-sub-ice.png',
    sha256: '9f6162942eecc8103fb783e695ea052e00a701e89d2c402d88241913f8943b83',
    label: '冰霜減法塔',
    element: 'water'
  },
  multiplication: {
    file: 'assets/bg/ui-adventure-tower-mul-emerald.png',
    sha256: '7cfb7a7fd6beefdf4eb3883424d795f1480f8c10b9df3c0f103f35e6a70fc4f1',
    label: '翡翠乘法塔',
    element: 'grass'
  },
  division: {
    file: 'assets/bg/ui-adventure-tower-div-thunder.png',
    sha256: '9a7bfb1323210924977908cc253fa0479ac418dae20f0a18fcb93976def07d67',
    label: '雷霆除法塔',
    element: 'thunder'
  }
};

const STAGES = {
  fire: 'assets/bg/ui-battle-stage-bg-fire-1920.png',
  water: 'assets/bg/ui-battle-stage-bg-water-1920.png',
  grass: 'assets/bg/ui-battle-stage-bg-grass-1920.png',
  thunder: 'assets/bg/ui-battle-stage-bg-thunder-1920.png'
};

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exitCode = 1;
  } else {
    console.log('ok:', msg);
  }
}

Object.keys(CARDS).forEach(function (id) {
  const spec = CARDS[id];
  const bytes = fs.readFileSync(path.join(root, spec.file));
  const sha = crypto.createHash('sha256').update(bytes).digest('hex');
  assert(sha === spec.sha256, id + ' card SHA-256');
  const v = sha.slice(0, 8);
  assert(html.includes(spec.file + '?v=' + v), id + ' cache-bust ?v=' + v);
  assert(html.includes(spec.label), 'hub label ' + spec.label);
});

const hubHtml = html.slice(html.indexOf('id="adventure-hub"'), html.indexOf('id="adventure-floors"'));
assert(hubHtml.includes('ui-adventure-tower-add-fire.png') === false, 'hub markup uses CSS classes, not raw old paths');
assert(hubHtml.includes('adventure-tower-card--add') && hubHtml.includes('adventure-tower-card--sub') && hubHtml.includes('adventure-tower-card--mul') && hubHtml.includes('adventure-tower-card--div'), 'hub uses the four new card classes');
assert(!/darkforest|sunkencity|cloudrealm|adventure-tower-training/.test(hubHtml), 'hub tiles are not the old four locations');
assert(!html.includes("onclick=\"startClimbBattle()\""), 'old single-climb start is gone');
assert(html.includes('function enterAdventure()'), 'lobby still calls enterAdventure');

const markerA = '/* ADVENTURE_TOWER_LOGIC_START */';
const markerB = '/* ADVENTURE_TOWER_LOGIC_END */';
const start = html.indexOf(markerA);
const end = html.indexOf(markerB);
assert(start >= 0 && end > start, 'adventure logic markers');
const block = html.slice(start + markerA.length, end);
const context = { console: console, Math: Math, Number: Number, String: String, Object: Object, Array: Array };
vm.createContext(context);
vm.runInContext(block, context);

assert(context.adventureTowerElement('addition') === 'fire', 'addition → fire');
assert(context.adventureTowerElement('subtraction') === 'water', 'subtraction → water');
assert(context.adventureTowerElement('multiplication') === 'grass', 'multiplication → grass');
assert(context.adventureTowerElement('division') === 'thunder', 'division → thunder');

const zeros = [0, 0, 0, 0, 0];
assert(context.adventureFloorUnlocked(zeros, 0) === true, 'floor 1 open');
assert(context.adventureFloorUnlocked(zeros, 1) === false, 'floor 2 locked');
assert(context.adventureFloorUnlocked(zeros, 5) === false, 'endless locked');
const one = [1, 0, 0, 0, 0];
assert(context.adventureFloorUnlocked(one, 1) === true, 'floor 2 opens after floor 1');
assert(context.adventureFloorUnlocked(one, 2) === false, 'floor 3 still locked');
const all = [3, 2, 1, 1, 1];
assert(context.adventureFloorUnlocked(all, 5) === true, 'endless opens after five clears');
assert(context.adventureClearedCount(all) === 5, 'five cleared');
assert(context.adventureClearedCount([0, 0, 0, 0, 0]) === 0, 'none cleared');

assert(context.adventureStandardWin(0, 100, 5) === true, 'monster down is a win');
assert(context.adventureStandardWin(20, 60, 3) === true, '3 correct and alive is a win');
assert(context.adventureStandardWin(40, 0, 3) === false, 'dead player is not a win');
assert(context.adventureStandardWin(40, 80, 2) === false, '2 correct is not a win');
assert(context.adventureStarReward(5) === 3, '100% is 3 stars');
assert(context.adventureStarReward(4) === 2, '80% is 2 stars');
assert(context.adventureStarReward(3) === 1, '60% is 1 star');
assert(context.adventureScaledReward(30, 3) === 30, 'full gold');
assert(context.adventureScaledReward(30, 1) === 10, 'one-star gold');
assert(context.adventureScaledReward(40, 2) === 26, 'two-star exp');
assert(context.adventureHitDamage(50) === 10, 'five hits clear 50 HP');
assert(context.adventureHitDamage(70) === 14, 'five hits clear 70 HP');
assert(context.adventureHitDamage(160) === 32, 'five hits clear 160 HP');
assert(context.adventureWrongDamage(false, 9) === 20, 'standard wrong is 20');
assert(context.adventureWrongDamage(true, 1) === 15, 'endless wave 1 wrong is 15');
assert(context.adventureWrongDamage(true, 9) === 30, 'endless wave 9 wrong scales');
assert(context.adventureWrongDamage(true, 40) === 50, 'endless wrong caps at 50');

const hit = context.adventureEndlessHitReward(2, 6);
assert(hit.multiplier === 1 + 2 * 0.2 + 6 * 0.15, 'endless multiplier');
assert(hit.gold === Math.floor(15 * hit.multiplier), 'endless gold');
assert(hit.exp === Math.floor(20 * hit.multiplier), 'endless exp');

assert(context.adventureAnswersMatch('7 r 2', '7 r 2'), 'remainder spaces match');
assert(context.adventureAnswersMatch('7r2', '7 r 2'), 'compact remainder matches');
assert(context.adventureAnswersMatch(' 12 ', '12'), 'trimmed number matches');
assert(context.adventureAnswersMatch('11', '12') === false, 'wrong number does not match');

let built = '';
built = context.adventureApplyKey(built, '5');
built = context.adventureApplyKey(built, '3');
assert(built === '53', 'keypad digits append');
built = context.adventureApplyKey(built, 'back');
assert(built === '5', 'keypad backspace drops the last character');
built = context.adventureApplyKey(built, 'clear');
assert(built === '', 'keypad clear empties the answer');
built = context.adventureApplyKey('7', ' r ');
built = context.adventureApplyKey(built, '2');
assert(built === '7 r 2', 'remainder key builds 7 r 2');
assert(context.adventureApplyKey('', 'back') === '', 'backspace on empty stays empty');

const padFn = html.slice(html.indexOf('function renderTowerAnswerPad'), html.indexOf('function adventureShouldEnd'));
assert(padFn.includes("createElement('input')") === false, 'tower pad does not create a text input');
assert(padFn.includes('.focus()') === false, 'tower pad does not focus a field');
assert(padFn.includes('tower-answer-display'), 'tower pad paints a non-editable display');
assert(padFn.includes("createElement('div')"), 'answer area is a plain element');
assert(!html.includes('tower-answer-input'), 'editable answer input id is gone');
assert(!html.includes('輸入答案'), 'typing placeholder copy is gone');
assert(!html.includes('輸入答案後攻擊'), 'hint no longer tells players to type in the blank');
assert(html.includes('按數字鍵後攻擊'), 'hint points at the keypad');
assert(html.includes('餘數寫成 7 r 2'), 'division remainder hint stays');

function parsePrompt(q) {
  const m = String(q.prompt).match(/(-?\d+)\s*([+\-×÷])\s*(-?\d+)/);
  if (!m) {
    const triple = String(q.prompt).match(/(\d+)\s*×\s*(\d+)\s*×\s*(\d+)/);
    if (!triple) throw new Error('unparsed ' + q.prompt);
    return { a: +triple[1], op: '××', b: +triple[2], c: +triple[3] };
  }
  return { a: +m[1], op: m[2], b: +m[3] };
}

let genFails = 0;
for (let i = 0; i < 40; i++) {
  const q = context.genAdd(1, 9, 1, 9);
  const p = parsePrompt(q);
  if (!(p.a >= 1 && p.a <= 9 && p.b >= 1 && p.b <= 9 && q.ans === String(p.a + p.b))) genFails++;
  const no = context.genAddNoCarry();
  const np = parsePrompt(no);
  const ones = (np.a % 10) + (np.b % 10);
  const tens = Math.floor(np.a / 10) + Math.floor(np.b / 10);
  if (!(ones < 10 && tens < 10 && no.ans === String(np.a + np.b))) genFails++;
  const carry = context.genAddCarry();
  const cp = parsePrompt(carry);
  if (!((cp.a % 10) + (cp.b % 10) >= 10 && carry.ans === String(cp.a + cp.b))) genFails++;
  const sub = context.genSub(1, 9, 1, 9);
  const sp = parsePrompt(sub);
  if (!(sp.a >= sp.b && sub.ans === String(sp.a - sp.b))) genFails++;
  const mul = context.genMul([2, 3, 4], [5, 6]);
  const mp = parsePrompt(mul);
  if (mul.ans !== String(mp.a * mp.b)) genFails++;
  const div = context.genDivExact(2, 9, 2, 9);
  const dp = parsePrompt(div);
  if (dp.a !== dp.b * Number(div.ans)) genFails++;
  const rem = context.genDivRemainder(2, 9);
  if (!/^\d+ r [1-8]$/.test(rem.ans)) genFails++;
  ['addition', 'subtraction', 'multiplication', 'division'].forEach(function (id) {
    const easy = context.genEndlessQuestion(id, 2);
    const hard = context.genEndlessQuestion(id, 8);
    if (!easy.ans || !hard.ans) genFails++;
  });
}
assert(genFails === 0, '40 rounds of floor generators and endless questions');

const towers = vm.runInContext('ADVENTURE_TOWERS', context);
['addition', 'subtraction', 'multiplication', 'division'].forEach(function (id) {
  const tower = towers[id];
  assert(tower.floors.length === 6, id + ' has 6 floors');
  assert(tower.floors[5].isEndless === true, id + ' floor 6 is endless');
  assert(tower.element === CARDS[id].element, id + ' element ' + tower.element);
  for (let f = 0; f < 5; f++) {
    const q = tower.floors[f].gen();
    assert(q && q.prompt && q.ans != null, id + ' floor ' + (f + 1) + ' generates');
  }
  assert(tower.floors[0].hp === 50 && tower.floors[4].hp === 160, id + ' HP curve');
  assert(tower.floors[0].gold === 30 && tower.floors[4].gold === 180, id + ' gold curve');
});

const merged = context.maxAdventureProgress(
  { level: 2, exp: 10, addition: [3, 1, 0, 0, 0], subtraction: [0, 0, 0, 0, 0], multiplication: [0, 0, 0, 0, 0], division: [1, 0, 0, 0, 0] },
  { level: 1, exp: 90, addition: [1, 0, 0, 0, 0], subtraction: [2, 0, 0, 0, 0], multiplication: [0, 0, 0, 0, 0], division: [0, 0, 0, 0, 0] }
);
assert(merged.addition.join(',') === '3,1,0,0,0', 'merge keeps higher stars');
assert(merged.subtraction[0] === 2 && merged.division[0] === 1, 'merge unions towers');
assert(merged.level === 2 && merged.exp === 10, 'merge keeps higher level');
assert(context.adventureStarTotal({ adventureProgress: merged }) === 3 + 1 + 2 + 1, 'star total');

const entryFn = html.slice(html.indexOf('function applyBattleStageForEntry'), html.indexOf('function prefersReducedMotion'));
assert(entryFn.includes('adventureTowerElement(adventureTowerId)'), 'adventure entry maps the tower element');
assert(entryFn.includes('applyAdventureElementStage(advElement)'), 'adventure entry tries the elemental plate');
assert(entryFn.trim().endsWith('applyRandomBattleStage();\n        }'), 'random pool remains the fallback');
Object.keys(STAGES).forEach(function (element) {
  assert(fs.existsSync(path.join(root, STAGES[element])), element + ' stage file is on disk');
  assert(html.includes(STAGES[element]), 'index references ' + element + ' stage');
});

if (process.exitCode) {
  console.error('adventure tower checks failed');
} else {
  console.log('adventure tower checks passed');
}
