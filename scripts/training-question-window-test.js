/**
 * 訓練場最近 35 題唔好咁快重複。冒險／排位／PvP 唔用呢個窗口。
 * node scripts/training-question-window-test.js
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
    throw new Error(msg);
  }
  console.log('ok:', msg);
}

function makeEl() {
  const el = {
    hidden: true,
    textContent: '',
    innerText: '',
    innerHTML: '',
    className: '',
    style: {},
    children: [],
    classList: null,
    setAttribute() {},
    getAttribute() { return null; },
    appendChild(child) { this.children.push(child); return child; },
    addEventListener() {},
    querySelector() { return makeEl(); },
    querySelectorAll() { return []; }
  };
  el.classList = {
    add(name) { if (name === 'hidden') el.hidden = true; },
    remove(name) { if (name === 'hidden') el.hidden = false; },
    toggle() {},
    contains(name) { return name === 'hidden' ? el.hidden : false; }
  };
  return el;
}

function sliceBetween(src, startMark, endMark) {
  const start = src.indexOf(startMark);
  const end = src.indexOf(endMark, start + startMark.length);
  if (start < 0 || end < 0) throw new Error('missing ' + startMark);
  return src.slice(start, end);
}

const els = Object.create(null);
const storage = Object.create(null);
let randomValue = 0;
const math = Object.create(Math);
math.random = function () { return randomValue; };

const sandbox = {
  console,
  setTimeout: function () { return 0; },
  clearTimeout: function () {},
  setInterval: function () { return 0; },
  clearInterval: function () {},
  Date, Math: math, JSON, Number, String, Boolean, Object, Array, Promise, Error, RegExp,
  parseInt, parseFloat, isFinite, isNaN, encodeURIComponent, decodeURIComponent,
  alert() {},
  confirm() { return true; },
  fetch: async function () { return { ok: false, status: 0, text: async function () { return '{"ok":false}'; } }; },
  localStorage: {
    getItem(k) { return Object.prototype.hasOwnProperty.call(storage, k) ? storage[k] : null; },
    setItem(k, v) { storage[k] = String(v); },
    removeItem(k) { delete storage[k]; }
  },
  performance: { now() { return 0; } },
  navigator: { userAgent: 'node' },
  document: {
    getElementById(id) {
      if (!els[id]) els[id] = makeEl();
      return els[id];
    },
    querySelector() { return makeEl(); },
    querySelectorAll() { return []; },
    createElement() { return makeEl(); },
    addEventListener() {},
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
vm.runInContext(html.slice(scriptStart, scriptEnd) + `
  globalThis.__test = {
    setUser(u) { currentUser = u; },
    user() { return currentUser; },
    merge(a, b, opts) { return mergeProgressProfiles(a, b, opts || {}); },
    setRanked(v) { isRankedMode = !!v; },
    setClimb(v) { isClimbMode = !!v; },
    setGrade(g) { selectedGrade = g; },
    setStrand(id) { pendingStrandId = id; },
    setBank(bank) { WORD_QUESTION_BANK = bank; },
    pick(unit) { return pickWordBankQuestion(unit); },
    generate() { return generateDynamicQuestion(); },
    clearBattle() { usedQuestionsMap.clear(); usedWordQuestionIds.clear(); },
    window() { return (currentUser && currentUser.trainingRecentQuestions) ? currentUser.trainingRecentQuestions.slice() : []; },
    db() { return JSON.parse(localStorage.getItem('math_monster_users') || '{}'); }
  };
`, sandbox, { filename: 'index.html' });

const api = sandbox.__test;

function bankQuestion(id, prefix, topic) {
  return {
    id: id,
    grade: 6,
    unitKey: 'fraction',
    topic: topic,
    question: '計算題 ' + id + ' 的答案是多少？',
    options: ['1', '2', '3', '4'],
    answer: '1'
  };
}

function makePool(prefix, topic, count) {
  const list = [];
  for (let i = 1; i <= count; i++) {
    list.push(bankQuestion(prefix + 'Q' + String(i).padStart(2, '0'), prefix, topic));
  }
  return list;
}

function freshUser(extra) {
  return Object.assign({
    nickname: 'trainer',
    school: '梨木樹天主教小學',
    className: '6B',
    classNo: 8,
    gold: 20,
    expPacks: 2,
    hpPotions: 0,
    rankScore: 0,
    ownedMonsters: [{ id: 'fire_base', level: 1, exp: 0 }],
    trainingRecentQuestions: []
  }, extra || {});
}

const bigPool = makePool('6P_L01_', '分數除法', 40).concat(makePool('6P_L02_', '分數四則混合計算', 10));
api.setBank(bigPool);
api.setUser(freshUser());
api.setGrade('G6');
api.setRanked(false);
api.setClimb(false);
api.setStrand('g6_l01');
randomValue = 0;

const served = [];
for (let i = 0; i < 36; i++) {
  api.clearBattle();
  const drawn = api.pick('g6_l01');
  if (!drawn || drawn._bankMeta.unitId !== 'g6_l01') {
    throw new Error('training draw left g6_l01: ' + (drawn && drawn._bankMeta && drawn._bankMeta.id));
  }
  served.push(drawn._bankMeta.id);
}
assert(new Set(served).size === 36, 'first 36 training draws are unique, got ' + new Set(served).size);
assert(served.indexOf(served[0], 1) === -1, 'the first id stays out of the window for the next 35');
api.clearBattle();
const returned = api.pick('g6_l01');
assert(returned._bankMeta.id === served[0], 'after 35 other questions the oldest id may return, got ' + returned._bankMeta.id);
assert(api.window().length === 35, 'window stays capped at 35, got ' + api.window().length);
assert(api.window().indexOf('id:' + served[0]) !== -1, 'a served repeat is recorded again');

api.setUser(freshUser());
api.setBank(makePool('6P_L01_', '分數除法', 12).concat(makePool('6P_L02_', '分數四則混合計算', 10)));
api.clearBattle();
const small = [];
for (let i = 0; i < 12; i++) {
  api.clearBattle();
  const drawn = api.pick('g6_l01');
  if (String(drawn._bankMeta.id).indexOf('6P_L01_') !== 0) {
    throw new Error('small pool draw left the unit: ' + drawn._bankMeta.id);
  }
  small.push(drawn._bankMeta.id);
}
assert(new Set(small).size === 12, 'a 12-question unit is exhausted before any repeat');
api.clearBattle();
const repeated = api.pick('g6_l01');
assert(small.indexOf(repeated._bankMeta.id) !== -1, 'after the unique pool is used, a repeat from the same unit is allowed');
assert(String(repeated._bankMeta.id).indexOf('6P_L01_') === 0, 'a repeat does not jump to the other unit');
assert(repeated._bankMeta.fallback !== 'grade', 'repeat does not use the grade fallback');

api.setUser(freshUser({
  trainingRecentQuestions: makePool('6P_L01_', '分數除法', 35).map(function (q) { return 'id:' + q.id; })
}));
api.setBank(bigPool);
api.setRanked(true);
api.setClimb(false);
api.clearBattle();
const ranked = api.pick('g6_l01');
assert(ranked._bankMeta.id === '6P_L01_Q01', 'ranked picker ignores the training window, got ' + ranked._bankMeta.id);
assert(api.window().length === 35 && api.window()[0] === 'id:6P_L01_Q01', 'ranked draw does not record into the training window');

api.setRanked(false);
api.setClimb(true);
api.clearBattle();
const climb = api.pick('g6_l01');
assert(climb._bankMeta.id === '6P_L01_Q01', 'climb/adventure flag does not apply the training window, got ' + climb._bankMeta.id);
assert(api.window().length === 35, 'climb draw does not append the training window');

api.setClimb(false);
api.setRanked(false);
api.setUser(freshUser({ nickname: 'reload-trainer' }));
api.setBank(bigPool);
api.clearBattle();
const firstSaved = api.pick('g6_l01');
const stored = api.db()['user_reload-trainer'];
assert(stored && stored.trainingRecentQuestions.join(',') === 'id:' + firstSaved._bankMeta.id, 'served training id is in the saved profile');
const reloaded = JSON.parse(JSON.stringify(stored));
api.setUser(reloaded);
api.clearBattle();
const afterReload = api.pick('g6_l01');
assert(afterReload._bankMeta.id !== firstSaved._bankMeta.id, 'reloaded window still skips the question served before reload');

const mergedWindow = api.merge(
  {
    gold: 1, expPacks: 1, updatedAt: '2026-11-23T04:00:00.000Z',
    ownedMonsters: [{ id: 'fire_base', level: 1, exp: 0 }],
    trainingRecentQuestions: []
  },
  {
    gold: 1, expPacks: 1, updatedAt: '2026-11-23T01:00:00.000Z',
    ownedMonsters: [{ id: 'fire_base', level: 1, exp: 0 }],
    trainingRecentQuestions: ['id:from-other-ipad']
  }
);
assert(mergedWindow.trainingRecentQuestions.join(',') === 'id:from-other-ipad', 'an empty newer list does not wipe the other device');

api.setBank([]);
api.setUser(freshUser({ nickname: 'template-trainer', trainingRecentQuestions: [] }));
api.setGrade('G5');
api.setStrand('g5_u7');
api.setRanked(false);
api.setClimb(false);
api.clearBattle();
const templ = api.generate();
assert(templ && templ.question.indexOf('三角柱') !== -1, 'template unit still generates its only question');
assert(api.window().length === 1 && api.window()[0].indexOf('tpl:') === 0, 'template question gets a stable tpl key');
const templKey = api.window()[0];
api.clearBattle();
const templAgain = api.generate();
assert(templAgain.question === templ.question, 'a one-question template unit may repeat after it is in the window');
assert(api.window().join(',') === templKey, 'repeating the only template question does not grow the window');
api.setRanked(true);
api.clearBattle();
api.generate();
assert(api.window().join(',') === templKey, 'ranked template generation does not record a training key');

function scanRealPools() {
  const ctx = {
    console, Math, Set, String, Number, parseInt,
    selectedGrade: 'G1',
    usedWordQuestionIds: new Set(),
    usedQuestionsMap: new Set()
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, '數學試題庫.js'), 'utf8'), ctx, { filename: '數學試題庫.js' });
  vm.runInContext(fs.readFileSync(path.join(root, 'unsolvable-blacklist.js'), 'utf8'), ctx, { filename: 'unsolvable-blacklist.js' });
  vm.runInContext(sliceBetween(html, 'function gradeNumFromSelected()', 'function generateDynamicQuestion()') + [
    'this.pickWordBankQuestion = pickWordBankQuestion;',
    'this.battleQuestionEligible = battleQuestionEligible;',
    'this.questionMatchesUnitRule = questionMatchesUnitRule;',
    'this.filterBattleQuestionPool = filterBattleQuestionPool;',
    'this.UNIT_BANK_RULES = UNIT_BANK_RULES;'
  ].join('\n'), ctx, { filename: 'battle-draw.js' });
  vm.runInContext(sliceBetween(html, 'const GRADE_UNITS = {', 'let currentUser') + '\nthis.GRADE_UNITS = GRADE_UNITS;\n', ctx);
  const rows = [];
  ['G1', 'G2', 'G3', 'G4', 'G5', 'G6'].forEach(function (grade) {
    const g = Number(grade.slice(1));
    (ctx.GRADE_UNITS[grade] || []).forEach(function (unit) {
      const rule = ctx.UNIT_BANK_RULES[unit.id];
      const matched = ctx.WORD_QUESTION_BANK.filter(function (q) {
        return q && q.grade === g && rule && ctx.questionMatchesUnitRule(q, rule);
      });
      const eligible = matched.filter(ctx.battleQuestionEligible);
      rows.push({ id: unit.id, name: unit.name, eligible: eligible.length });
    });
  });
  rows.sort(function (a, b) { return a.eligible - b.eligible; });
  const under = rows.filter(function (row) { return row.eligible > 0 && row.eligible < 30; });
  const over = rows.filter(function (row) { return row.eligible >= 35; });
  console.log('real unit eligible pools: ' + rows.map(function (row) {
    return row.id + '=' + row.eligible;
  }).join(', '));
  console.log('drawable pools under 30: ' + under.map(function (row) { return row.id; }).join(', '));
  console.log('drawable pools at least 35: ' + over.map(function (row) { return row.id + '=' + row.eligible; }).join(', '));

  ctx.currentUser = { trainingRecentQuestions: [] };
  ctx.selectedGrade = 'G6';
  ctx.isRankedMode = false;
  ctx.isClimbMode = false;
  const g6 = [];
  for (let i = 0; i < 20; i++) {
    ctx.usedWordQuestionIds = new Set();
    const drawn = ctx.pickWordBankQuestion('g6_l01');
    if (!drawn || String(drawn._bankMeta.id).indexOf('6P_L01_') !== 0) {
      throw new Error('real g6_l01 left its prefix');
    }
    g6.push(drawn._bankMeta.id);
  }
  if (new Set(g6).size !== 20) throw new Error('real g6_l01 did not exhaust 20 uniques, got ' + new Set(g6).size);
  ctx.usedWordQuestionIds = new Set();
  const g6Repeat = ctx.pickWordBankQuestion('g6_l01');
  if (g6.indexOf(g6Repeat._bankMeta.id) === -1) throw new Error('real g6_l01 refused to repeat after 20');
  if (String(g6Repeat._bankMeta.fallback) === 'grade') throw new Error('real g6_l01 repeat used another unit');

  ctx.currentUser = { trainingRecentQuestions: [] };
  ctx.selectedGrade = 'G5';
  const wide = [];
  for (let i = 0; i < 36; i++) {
    ctx.usedWordQuestionIds = new Set();
    const drawn = ctx.pickWordBankQuestion('g5_u3');
    if (!drawn) throw new Error('real g5_u3 returned nothing');
    wide.push(drawn._bankMeta.id);
  }
  if (new Set(wide).size !== 36) throw new Error('real g5_u3 repeated inside the first 36, got ' + new Set(wide).size);
  const recent = ctx.currentUser.trainingRecentQuestions.slice();
  ctx.usedWordQuestionIds = new Set();
  const wideNext = ctx.pickWordBankQuestion('g5_u3');
  if (recent.indexOf('id:' + wideNext._bankMeta.id) !== -1) {
    throw new Error('real g5_u3 drew a question still inside the 35-window: ' + wideNext._bankMeta.id);
  }
  return { rows: rows, under: under, over: over };
}

const pools = scanRealPools();
assert(pools.under.some(function (row) { return row.id === 'g6_l01'; }), 'grade 6 lesson pools stay under 30');
assert(pools.over.some(function (row) { return row.id === 'g5_u3'; }), 'at least one real unit can fill a 35-window');
console.log('ok: real g6_l01 exhausts 20 then repeats; real g5_u3 skips the last 35');

if (!process.exitCode) console.log('training-question-window-test: ok');
