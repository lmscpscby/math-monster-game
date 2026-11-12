/**
 * 六年級選關：九個課名同次序、舊關不再可選、每關只抽自己嘅 6P_Lxx。
 * node scripts/grade6-select-gate-test.js
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
}

function sliceBetween(src, startMark, endMark) {
    const start = src.indexOf(startMark);
    const end = src.indexOf(endMark, start + startMark.length);
    assert(start !== -1 && end > start, 'missing marker ' + startMark);
    return src.slice(start, end);
}

const GATES = [
    { id: 'g6_l04', name: '小數和分數互化與比較', prefix: '6P_L04_', topic: '小數和分數互化與比較', drawable: 20 },
    { id: 'g6_l03', name: '小數除法', prefix: '6P_L03_', topic: '小數除法', drawable: 20 },
    { id: 'g6_l02', name: '分數四則混合計算', prefix: '6P_L02_', topic: '分數四則混合計算', drawable: 20 },
    { id: 'g6_l01', name: '分數除法', prefix: '6P_L01_', topic: '分數除法', drawable: 20 },
    { id: 'g6_l05', name: '百分數', prefix: '6P_L05_', topic: '百分數', drawable: 20 },
    { id: 'g6_l06', name: '圓周', prefix: '6P_L06_', topic: '圓周', drawable: 20 },
    { id: 'g6_l07', name: '圓面積', prefix: '6P_L07_', topic: '圓面積', drawable: 19 },
    { id: 'g6_l09', name: '簡易方程(二)', prefix: '6P_L09_', topic: '簡易方程（二）', drawable: 20 },
    { id: 'g6_l08', name: '體積與容量', prefix: '6P_L08_', topic: '體積與容量', drawable: 20 }
];

const REMOVED_LABELS = [
    '速率（m/s, km/h 換算與計算）',
    '圓周長與圓面積計算',
    '圓周長與圓面積',
    '排水法測量不規則物件體積（量杯、水缸）',
    '排水法',
    '折線圖與統計數據分析及誤用',
    '折線圖與統計',
    '時間間隔、開始與結束時間計算',
    '時間間隔',
    '百分數的應用（折扣、加減與比較）',
    '分數、小數與百分數的互化',
    '簡易方程及應用題'
];

const REMOVED_IDS = ['g6_u1', 'g6_u2', 'g6_u3', 'g6_u4', 'g6_u5', 'g6_u6', 'g6_u7', 'g6_u8', 'g6_u9'];

const ctx = {
    console,
    Math,
    Set,
    String,
    Number,
    parseInt,
    selectedGrade: 'G6',
    usedWordQuestionIds: new Set(),
    usedQuestionsMap: new Set()
};
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, '數學試題庫.js'), 'utf8'), ctx, { filename: '數學試題庫.js' });
vm.runInContext(fs.readFileSync(path.join(root, 'unsolvable-blacklist.js'), 'utf8'), ctx, { filename: 'unsolvable-blacklist.js' });
vm.runInContext(sliceBetween(html, 'function gradeNumFromSelected()', 'function generateDynamicQuestion()') + [
    'this.questionMatchesUnitRule = questionMatchesUnitRule;',
    'this.pickWordBankQuestion = pickWordBankQuestion;',
    'this.battleQuestionEligible = battleQuestionEligible;',
    'this.questionRefsMissingImage = questionRefsMissingImage;',
    'this.UNIT_BANK_RULES = UNIT_BANK_RULES;'
].join('\n'), ctx, { filename: 'battle-draw.js' });
vm.runInContext(
    sliceBetween(html, 'const GRADE_UNITS = {', 'let currentUser') + '\nthis.GRADE_UNITS = GRADE_UNITS;\n',
    ctx,
    { filename: 'grade-units.js' }
);

const g6 = ctx.GRADE_UNITS.G6;
assert(g6.map(u => u.name).join('\n') === GATES.map(g => g.name).join('\n'), 'G6 names/order drifted');
assert(g6.map(u => u.id).join(',') === GATES.map(g => g.id).join(','), 'G6 gate ids drifted');
assert(ctx.GRADE_UNITS.G1.length === 6 && ctx.GRADE_UNITS.G5.length === 9, 'other grades changed size');
assert(ctx.GRADE_UNITS.G1[0].id === 'g1_u1' && ctx.GRADE_UNITS.G5[0].id === 'g5_u9', 'G1–G5 gate ids moved');

const unitsBlock = sliceBetween(html, 'const GRADE_UNITS = {', 'let currentUser');
const rulesBlock = sliceBetween(html, 'const UNIT_BANK_RULES = {', 'function questionMatchesUnitRule');
REMOVED_LABELS.forEach(label => {
    assert(unitsBlock.indexOf(label) === -1, 'GRADE_UNITS still lists ' + label);
    assert(g6.every(u => u.name.indexOf(label) === -1), 'selectable name still contains ' + label);
});
assert(unitsBlock.indexOf('圓周長與圓面積') === -1, 'combined circle label remains a gate');
assert(html.indexOf('排水法') === -1, '排水法 remains in the page');
REMOVED_IDS.forEach(id => {
    assert(!ctx.UNIT_BANK_RULES[id], id + ' is still a bank rule');
    assert(rulesBlock.indexOf(id + ':') === -1, id + ' remains in UNIT_BANK_RULES');
    assert(g6.every(u => u.id !== id), id + ' is still a selectable gate');
});

const liveG6 = ctx.WORD_QUESTION_BANK.filter(q => q.grade === 6);
assert(liveG6.length === 180, 'grade 6 bank size changed');

GATES.forEach(gate => {
    const rule = ctx.UNIT_BANK_RULES[gate.id];
    assert(rule && rule.idPrefix === gate.prefix, gate.id + ' is not pinned to ' + gate.prefix);
    assert(rule.topic === gate.topic, gate.id + ' topic field drifted');
    assert(!rule.unitKeys, gate.id + ' still matches on unitKey');
    const matched = liveG6.filter(q => ctx.questionMatchesUnitRule(q, rule));
    const ids = matched.map(q => q.id).sort();
    const expected = [];
    for (let n = 1; n <= 20; n++) expected.push(gate.prefix + 'Q' + String(n).padStart(2, '0'));
    assert(ids.join(',') === expected.join(','), gate.name + ' pool is not its 20 ids: ' + ids.join(','));
    assert(matched.every(q => q.topic === gate.topic), gate.name + ' mixed topics');
    const eligible = matched.filter(ctx.battleQuestionEligible);
    assert(eligible.length === gate.drawable, gate.name + ' drawable ' + eligible.length + '/' + matched.length);
    const blocked = matched.filter(q => !ctx.battleQuestionEligible(q)).map(q => q.id);
    if (gate.id === 'g6_l07') {
        assert(blocked.join(',') === '6P_L07_Q18', '圓面積 blocked ids: ' + blocked.join(','));
        assert(ctx.questionRefsMissingImage(matched.find(q => q.id === '6P_L07_Q18')), '6P_L07_Q18 was not skipped by the figure-stem rule');
    } else {
        assert(blocked.length === 0, gate.name + ' unexpected skip: ' + blocked.join(','));
    }

    ctx.selectedGrade = 'G6';
    ctx.usedWordQuestionIds = new Set();
    const seen = new Set();
    for (let n = 0; n < 40; n++) {
        const drawn = ctx.pickWordBankQuestion(gate.id);
        assert(drawn, gate.id + ' drew nothing');
        assert(String(drawn._bankMeta.id).indexOf(gate.prefix) === 0, gate.name + ' drew ' + drawn._bankMeta.id);
        assert(drawn._bankMeta.fallback !== 'grade', gate.name + ' used the grade fallback');
        seen.add(drawn._bankMeta.id);
    }
    assert(seen.size >= 8, gate.name + ' draw set collapsed to ' + seen.size);
    console.log(gate.name + ' matched=20 drawable=' + eligible.length + '/20 draws=' + seen.size);
});

assert(ctx.GRADE_UNITS.G6[7].name === '簡易方程(二)', 'equation gate label is not half-width');
assert(ctx.UNIT_BANK_RULES.g6_l09.topic === '簡易方程（二）', 'equation topic is not the full-width bank field');

function unitKeysFor(prefix) {
    return [...new Set(liveG6.filter(q => String(q.id).indexOf(prefix) === 0).map(q => q.unitKey))];
}
assert(unitKeysFor('6P_L01_').join(',') === 'fraction' && unitKeysFor('6P_L02_').join(',') === 'fraction', 'L01/L02 are not both unitKey fraction');
assert(unitKeysFor('6P_L03_').join(',') === 'decimal' && unitKeysFor('6P_L04_').join(',') === 'decimal', 'L03/L04 are not both unitKey decimal');
assert(unitKeysFor('6P_L06_').join(',') === 'circle' && unitKeysFor('6P_L07_').join(',') === 'circle', 'L06/L07 are not both unitKey circle');

[['g6_l01', '6P_L02_'], ['g6_l02', '6P_L01_'], ['g6_l03', '6P_L04_'], ['g6_l04', '6P_L03_'], ['g6_l06', '6P_L07_'], ['g6_l07', '6P_L06_']].forEach(pair => {
    const leaked = liveG6.filter(q => String(q.id).indexOf(pair[1]) === 0 && ctx.questionMatchesUnitRule(q, ctx.UNIT_BANK_RULES[pair[0]]));
    assert(leaked.length === 0, pair[0] + ' still includes ' + pair[1]);
});

ctx.selectedGrade = 'G6';
ctx.usedWordQuestionIds = new Set();
REMOVED_IDS.forEach(id => {
    assert(ctx.pickWordBankQuestion(id) === null, id + ' still acts as a grade-fallback entry');
});

['G1', 'G2', 'G3', 'G4', 'G5'].forEach(grade => {
    ctx.GRADE_UNITS[grade].forEach(unit => {
        const rule = ctx.UNIT_BANK_RULES[unit.id];
        assert(rule && !rule.idPrefix, grade + ' ' + unit.id + ' picked up a lesson prefix rule');
    });
});

console.log('OK grade 6 select gates');
