/**
 * 戰鬥抽題硬跳過有圖題，並核對年級 unitKey／戰鬥單元池。
 * node scripts/battle-image-skip-test.js
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

const ctx = {
    console,
    Math,
    Set,
    String,
    Number,
    parseInt,
    selectedGrade: 'G1',
    usedWordQuestionIds: new Set(),
    usedQuestionsMap: new Set()
};
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, '數學試題庫.js'), 'utf8'), ctx, { filename: '數學試題庫.js' });
vm.runInContext(fs.readFileSync(path.join(root, 'unsolvable-blacklist.js'), 'utf8'), ctx, { filename: 'unsolvable-blacklist.js' });
const drawSrc = sliceBetween(html, 'function gradeNumFromSelected()', 'function generateDynamicQuestion()');
vm.runInContext(drawSrc + [
    'this.gradeNumFromSelected = gradeNumFromSelected;',
    'this.isBattleBlacklisted = isBattleBlacklisted;',
    'this.questionStemExpectsFigure = questionStemExpectsFigure;',
    'this.questionRefsMissingImage = questionRefsMissingImage;',
    'this.questionHasAttachedImage = questionHasAttachedImage;',
    'this.battleQuestionEligible = battleQuestionEligible;',
    'this.filterBattleQuestionPool = filterBattleQuestionPool;',
    'this.questionMatchesUnitRule = questionMatchesUnitRule;',
    'this.pickWordBankQuestion = pickWordBankQuestion;',
    'this.UNIT_BANK_RULES = UNIT_BANK_RULES;',
    'this.questionStemLen = questionStemLen;'
].join('\n'), ctx, { filename: 'battle-draw.js' });

const bank = ctx.WORD_QUESTION_BANK;
assert(Array.isArray(bank) && bank.length > 1000, 'question bank loaded');
assert(ctx.BATTLE_UNSOLVABLE_BLACKLIST.length === 177, 'blacklist stays at the 177-id union');

const fixture = [
    { id: 'plain', question: '3 + 4 = ?', options: ['7', '8'], answer: '7' },
    { id: 'with-image', question: '3 + 4 = ?', image: 'q-images/a.webp' },
    { id: 'blank-image', question: '5 + 1 = ?', image: '' },
    { id: 'whitespace-image', question: '5 + 2 = ?', image: '   ' },
    { id: 'image-url', question: '6 + 1 = ?', imageUrl: 'q-images/b.webp' },
    { id: 'img-field', question: '6 + 2 = ?', img: 'q-images/c.png' },
    { id: 'figure-obj', question: '6 + 3 = ?', figure: { url: 'q-images/d.png' } },
    { id: 'attachment', question: '6 + 4 = ?', attachment: { src: 'q-images/e.png' } },
    { id: 'attachments', question: '6 + 5 = ?', attachments: ['q-images/f.png'] },
    { id: 'stem-only', question: '下圖有多少個圓形？' },
    { id: 'image-and-stem', question: '下圖有多少個圓形？', image: 'q-images/g.png' },
    { id: '3B_L14_Q07', question: '8 + 1 = ?' },
    { id: 'empty-figure', question: '9 + 1 = ?', figure: {} },
    { id: 'clock-object', question: '時鐘上面的數字是 3。3 + 1 = ?' }
];
const keptIds = ctx.filterBattleQuestionPool(fixture).map(q => q.id).sort();
assert(keptIds.join(',') === 'blank-image,clock-object,empty-figure,plain', 'hard image skip keeps only text questions, got ' + keptIds.join(','));
assert(ctx.filterBattleQuestionPool([{ id: 'only', question: '下圖', image: 'q-images/a.png' }]).length === 0, 'image-only pool is empty');
assert(ctx.filterBattleQuestionPool(null).length === 0, 'null pool is empty');

const savedBank = ctx.WORD_QUESTION_BANK;
ctx.WORD_QUESTION_BANK = [
    { id: '1A_ONLY_IMG', grade: 1, unitKey: 'basic_addition', topic: '基本加法', question: '睇圖計 1+1', options: ['2', '3'], answer: '2', image: 'q-images/x.png' }
];
ctx.selectedGrade = 'G1';
ctx.usedWordQuestionIds = new Set();
ctx.usedQuestionsMap = new Set();
assert(ctx.pickWordBankQuestion('g1_u2') === null, 'draw returns null when every matched question has an image');
ctx.WORD_QUESTION_BANK = [
    { id: '1A_IMG', grade: 1, unitKey: 'length_distance', topic: '長度', question: '下圖幾厘米', options: ['1', '2'], answer: '1', image: 'q-images/len.png' },
    { id: '1A_TEXT', grade: 1, unitKey: 'basic_addition', topic: '基本加法', question: '1 + 1 = ?', options: ['2', '3'], answer: '2' }
];
ctx.usedWordQuestionIds = new Set();
const widened = ctx.pickWordBankQuestion('g1_u5');
assert(widened && widened.image == null && widened._bankMeta.id === '1A_TEXT', 'empty image unit falls back to a text question');
assert(widened._bankMeta.fallback === 'grade', 'fallback level is the grade pool');
ctx.WORD_QUESTION_BANK = savedBank;

function gradePoolFor(g) {
    let gradePool = bank.filter(q => q && q.grade === g && !ctx.isBattleBlacklisted(q));
    if (g >= 1 && g <= 4) {
        const ephRe = new RegExp('^' + g + '(A|B|DA|DB)_');
        const eph = gradePool.filter(q => ephRe.test(String(q.id || '')));
        if (eph.length) gradePool = eph;
    }
    return gradePool;
}

vm.runInContext(
    sliceBetween(html, 'const GRADE_UNITS = {', 'let currentUser') + '\nthis.GRADE_UNITS = GRADE_UNITS;\n',
    ctx,
    { filename: 'grade-units.js' }
);
assert(ctx.GRADE_UNITS && ctx.GRADE_UNITS.G1 && ctx.GRADE_UNITS.G6, 'GRADE_UNITS extracted');

let imageTruth = 0;
let imageAlreadyBl = 0;
let skippedSolely = 0;
let beforeEligible = 0;
let afterEligible = 0;
let shortEligible = 0;
let mediumEligible = 0;
const byPair = new Map();
for (let i = 0; i < bank.length; i++) {
    const q = bank[i];
    if (q.image) imageTruth++;
    const bl = ctx.isBattleBlacklisted(q);
    const stemGap = ctx.questionRefsMissingImage(q);
    const before = !bl && !stemGap;
    const after = ctx.battleQuestionEligible(q);
    if (q.image && bl) imageAlreadyBl++;
    if (q.image && !bl) {
        skippedSolely++;
        assert(!stemGap, 'an attached image is not also dropped as a missing-image stem');
    }
    if (before) beforeEligible++;
    if (after) {
        afterEligible++;
        assert(!q.image && !ctx.questionHasAttachedImage(q), 'eligible question still has an image');
        const n = ctx.questionStemLen(q);
        if (n <= 55) shortEligible++;
        else if (n <= 80) mediumEligible++;
        else assert(false, 'text question longer than 80: ' + q.id);
    }
    const pairKey = 'G' + q.grade + '\t' + (q.unitKey || '(none)');
    if (!byPair.has(pairKey)) byPair.set(pairKey, { grade: q.grade, unitKey: q.unitKey || '(none)', before: 0, after: 0 });
    const row = byPair.get(pairKey);
    if (before) row.before++;
    if (after) row.after++;
}
assert(imageTruth === 1086, 'bank image count changed: ' + imageTruth);
assert(imageAlreadyBl === 14, 'blacklisted image count changed: ' + imageAlreadyBl);
assert(skippedSolely === imageTruth - imageAlreadyBl, 'sole image skips should be every non-blacklisted image');
assert(beforeEligible - skippedSolely === afterEligible, 'remaining eligible = previous eligible minus sole image skips');
assert(shortEligible + mediumEligible === afterEligible, 'every remaining text question is within 80 characters');

const filteredAll = ctx.filterBattleQuestionPool(bank);
assert(filteredAll.every(q => !q.image && ctx.battleQuestionEligible(q)), 'full-bank filter still returns an image');
assert(filteredAll.length === shortEligible, 'full bank prefers the short text pool, got ' + filteredAll.length + ' vs ' + shortEligible);

const newlyEmpty = [];
const alreadyEmpty = [];
const nearEmpty = [];
byPair.forEach(row => {
    if (row.before === 0) alreadyEmpty.push(row);
    else if (row.after === 0) newlyEmpty.push(row);
    else if (row.after <= 2) nearEmpty.push(row);
});
const sortRows = (rows) => rows.sort((a, b) => a.grade - b.grade || String(a.unitKey).localeCompare(String(b.unitKey)));
sortRows(newlyEmpty);
sortRows(alreadyEmpty);
sortRows(nearEmpty);
assert(alreadyEmpty.length === 0, 'a grade+unitKey pool was already empty before the image rule');

const byUnitKey = new Map();
byPair.forEach(row => {
    if (!byUnitKey.has(row.unitKey)) byUnitKey.set(row.unitKey, { before: 0, after: 0, grades: [] });
    const acc = byUnitKey.get(row.unitKey);
    acc.before += row.before;
    acc.after += row.after;
    acc.grades.push(row);
});
let unitKeysNewlyEmpty = 0;
byUnitKey.forEach(acc => {
    if (acc.before > 0 && acc.after === 0) unitKeysNewlyEmpty++;
});

const battleRows = [];
Object.keys(ctx.GRADE_UNITS).forEach(gName => {
    const g = parseInt(gName.slice(1), 10);
    const gradePool = gradePoolFor(g);
    ctx.GRADE_UNITS[gName].forEach(unit => {
        const matched = gradePool.filter(q => ctx.questionMatchesUnitRule(q, ctx.UNIT_BANK_RULES[unit.id]));
        const before = matched.filter(q => !ctx.isBattleBlacklisted(q) && !ctx.questionRefsMissingImage(q)).length;
        const after = matched.filter(ctx.battleQuestionEligible).length;
        battleRows.push({ id: unit.id, name: unit.name, grade: gName, before, after, matched: matched.length });
    });
});
const battleNewlyEmpty = battleRows.filter(r => r.before > 0 && r.after === 0).map(r => r.id);
const battleAlreadyEmpty = battleRows.filter(r => r.before === 0 && r.after === 0).map(r => r.id);
const battleNear = battleRows.filter(r => r.after > 0 && r.after < 3).map(r => r.id);
assert(battleNewlyEmpty.join(',') === 'g1_u5,g2_u4,g3_u3,g4_u4', 'newly empty battle units changed: ' + battleNewlyEmpty.join(','));
assert(battleAlreadyEmpty.join(',') === 'g2_u6,g4_u5,g5_u1', 'already empty battle units changed: ' + battleAlreadyEmpty.join(','));
assert(battleNear.join(',') === 'g3_u6', 'near-empty battle units changed: ' + battleNear.join(','));

ctx.usedWordQuestionIds = new Set();
ctx.usedQuestionsMap = new Set();
battleRows.forEach(row => {
    ctx.selectedGrade = row.grade;
    for (let n = 0; n < 12; n++) {
        const drawn = ctx.pickWordBankQuestion(row.id);
        if (!drawn) {
            assert(row.after === 0, row.id + ' returned null while text questions remain');
            const gradeAfter = gradePoolFor(parseInt(row.grade.slice(1), 10)).filter(ctx.battleQuestionEligible).length;
            assert(gradeAfter === 0, row.id + ' grade fallback still has text questions');
            continue;
        }
        assert(!drawn.image, row.id + ' drew an image question ' + drawn._bankMeta.id);
        const src = bank.find(q => q.id === drawn._bankMeta.id);
        assert(src && ctx.battleQuestionEligible(src), row.id + ' drew an ineligible question ' + drawn._bankMeta.id);
    }
});

const lines = [];
lines.push('bank ' + bank.length);
lines.push('image_truthy ' + imageTruth);
lines.push('image_already_blacklisted ' + imageAlreadyBl);
lines.push('skipped_solely_by_image_rule ' + skippedSolely);
lines.push('eligible_before ' + beforeEligible);
lines.push('eligible_after ' + afterEligible);
lines.push('eligible_short_le_55 ' + shortEligible);
lines.push('eligible_medium_56_to_80 ' + mediumEligible);
lines.push('grade_unitKey_pairs ' + byPair.size);
lines.push('grade_unitKey_already_empty ' + alreadyEmpty.length);
lines.push('grade_unitKey_newly_empty ' + newlyEmpty.length);
lines.push('grade_unitKey_near_1_or_2 ' + nearEmpty.length);
lines.push('unitKey_collapsed_newly_empty ' + unitKeysNewlyEmpty);
lines.push('NEWLY_EMPTY');
newlyEmpty.forEach(r => lines.push('G' + r.grade + ' ' + r.unitKey + ' before=' + r.before + ' after=0'));
lines.push('NEAR_EMPTY');
nearEmpty.forEach(r => lines.push('G' + r.grade + ' ' + r.unitKey + ' before=' + r.before + ' after=' + r.after));
lines.push('BATTLE_UNITS');
battleRows.forEach(r => lines.push(r.grade + ' ' + r.id + ' ' + r.name + ' before=' + r.before + ' after=' + r.after));
const cross = [];
byUnitKey.forEach((acc, unitKey) => {
    const emptied = acc.grades.filter(g => g.before > 0 && g.after === 0);
    const alive = acc.grades.filter(g => g.after > 0);
    if (emptied.length && alive.length) {
        cross.push(unitKey + ' empty=' + emptied.map(g => 'G' + g.grade + ':' + g.before).join(',') + ' alive=' + alive.map(g => 'G' + g.grade + ':' + g.after).join(','));
    }
});
lines.push('CROSS_GRADE');
cross.forEach(line => lines.push(line));
console.log(lines.join('\n'));
console.log('OK battle image skip');
