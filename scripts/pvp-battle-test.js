/**
 * 1v1 怪獸對戰：傷害、同步、出題隔離、獸鑑。
 * node scripts/pvp-battle-test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const peerSrc = fs.readFileSync(path.join(root, 'pvp-peer.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function assert(cond, msg) {
    if (!cond) {
        console.error('FAIL:', msg);
        process.exitCode = 1;
    }
}

function sliceBetween(src, startMark, endMark) {
    const start = src.indexOf(startMark);
    const end = src.indexOf(endMark);
    assert(start !== -1 && end > start, 'missing marker ' + startMark);
    return src.slice(start, end);
}

const peerContext = {
    console,
    Math,
    Date,
    Number,
    String,
    Object,
    Array,
    JSON,
    parseInt,
    isFinite,
    Uint32Array,
    setTimeout,
    clearTimeout,
    performance: { now: function () { return 0; } },
    document: {
        readyState: 'complete',
        getElementById: function () { return null; },
        querySelector: function () { return null; },
        addEventListener: function () {},
        createElement: function () { return {}; }
    }
};
peerContext.window = peerContext;
function getElementAdvantageMultiplier(atk, def) {
    const chart = {
        fire: { grass: 1.5, water: 0.7 },
        water: { fire: 1.5, grass: 0.7 },
        grass: { water: 1.5, fire: 0.7 }
    };
    const row = chart[atk];
    if (!row || row[def] == null) return 1;
    return row[def];
}
peerContext.getElementAdvantageMultiplier = getElementAdvantageMultiplier;
vm.createContext(peerContext);
vm.runInContext(peerSrc, peerContext, { filename: 'pvp-peer.js' });

const rules = peerContext.MmgPvp.rules;
assert(rules && typeof rules.damageHit === 'function', 'rules exported');

const tank = { element: 'fire', atk: 40, maxHp: 400 };
const mirror = { element: 'fire', atk: 40, maxHp: 400 };
const neutral = rules.damageHit(tank, mirror, 9000);
assert(neutral.dmg === 72 && neutral.speed === false && neutral.cap === 112, 'ATK×1.8 under 28% cap, got ' + JSON.stringify(neutral));
const speed = rules.damageHit(tank, mirror, 1000);
assert(speed.dmg === 82 && speed.speed === true, '8s speed bonus ×1.15, got ' + JSON.stringify(speed));
assert(rules.damageHit(tank, mirror, 8000).speed === true, 'exactly 8s still gets the bonus');
assert(rules.damageHit(tank, mirror, 8001).speed === false, 'just over 8s has no bonus');

const heavy = rules.damageHit({ element: 'fire', atk: 500, maxHp: 400 }, mirror, null);
assert(heavy.dmg === 112 && heavy.cap === 112, 'high ATK stops at 28% cap, got ' + heavy.dmg);
const heavyFast = rules.damageHit({ element: 'fire', atk: 500, maxHp: 400 }, mirror, 500);
assert(heavyFast.dmg === 128, 'speed bonus cannot pass floor(cap×1.15), got ' + heavyFast.dmg);

const adv = rules.damageHit({ element: 'fire', atk: 40, maxHp: 400 }, { element: 'grass', atk: 40, maxHp: 400 }, null);
assert(adv.dmg === 108 && adv.mult === 1.5, '克制 1.5, got ' + JSON.stringify(adv));
const weak = rules.damageHit({ element: 'fire', atk: 40, maxHp: 400 }, { element: 'water', atk: 40, maxHp: 400 }, null);
assert(weak.dmg === 50 && weak.mult === 0.7, '被克 0.7, got ' + JSON.stringify(weak));

assert(rules.selfChip({ maxHp: 400 }) === 48, '12% self chip');
assert(rules.selfChip({ maxHp: 60 }) === 8, 'chip floor is 8');
assert(rules.selfChip({ maxHp: 5 }) === 5, 'chip cannot exceed max HP');
assert(rules.cleanMs(0) === 0 && rules.cleanMs(8000) === 8000, 'cleanMs keeps fast answers');
assert(rules.cleanMs(-1) === null && rules.cleanMs(120001) === null && rules.cleanMs(null) === null, 'cleanMs rejects bad timings');

const onlyMe = { element: 'water', atk: 500, maxHp: 200 };
const onlyThem = { element: 'water', atk: 500, maxHp: 200 };
let myHp = 200;
let theirHp = 200;
let rounds = 0;
let ko = '';
while (!ko && rounds < 10) {
    rounds += 1;
    const step = rules.resolveRound(onlyMe, onlyThem, true, false, 9000, null, myHp, theirHp);
    myHp = step.myHp;
    theirHp = step.theirHp;
    ko = step.ko;
    if (rounds === 1) {
        assert(step.myDealt === 56 && step.theirChip === 24 && step.myChip === 0, 'correct hits, wrong side chips, got ' + JSON.stringify(step));
        assert(myHp === 200, 'a correct answer does not chip yourself');
    }
}
assert(ko === 'me', 'only the correct side wins, got ' + ko);
assert(rounds >= 2 && rounds <= 6, 'KO takes multiple rounds, got ' + rounds);
assert(myHp === 200 && theirHp === 0, 'winner kept HP and loser hit 0');

myHp = 200;
theirHp = 200;
rounds = 0;
ko = '';
while (!ko && rounds < 10) {
    rounds += 1;
    const step = rules.resolveRound(onlyMe, onlyThem, true, true, null, null, myHp, theirHp);
    myHp = step.myHp;
    theirHp = step.theirHp;
    ko = step.ko;
}
assert(ko === 'draw' && rounds === 4, 'both correct and same stats draw on round 4, got ' + ko + ' r' + rounds);
assert(myHp === 0 && theirHp === 0, 'simultaneous KO zeroes both');

const q = rules.adaptGenerated({
    question: '【小數】下圖的數是多少？',
    options: ['1', '2', '2', '3'],
    correctAnswer: '2',
    image: 'q-images/5A15N102b_12C_041N__num.webp'
}, 'r3');
assert(q && q.stem === '下圖的數是多少？' && q.answer === '2' && q.options.length === 3, 'adapt strips unit tag and duplicate options');
assert(q.image.indexOf('q-images/') === 0, 'local question image kept');
const badImg = rules.adaptGenerated({
    question: '1 + 1 = ?',
    options: ['2', '3'],
    correctAnswer: '2',
    image: 'https://evil.example/a.png'
}, 'r1');
assert(badImg && badImg.image === '' && badImg.stem === '1 + 1 = ?', 'remote image URL is dropped, question stays');
assert(rules.sanitizeQuestion({ t: 'question', roundId: 'r25', stem: '1+1', options: ['2', '3'], answer: '2' }) === null, 'round above 24 is rejected');
assert(rules.makeQuestion || peerContext.MmgPvp.makeQuestion, 'fallback question still exported');
const fb = peerContext.MmgPvp.makeQuestion();
const fbOk = rules.sanitizeQuestion({ t: 'question', roundId: 'r1', stem: fb.stem, options: fb.options, answer: fb.answer });
assert(fbOk && fbOk.answer === fb.answer, 'arithmetic fallback still passes the sanitizer');

const syncKo = rules.interpretSync({
    t: 'sync', roundId: 'r2', hostHp: 10, guestHp: 0, winner: 'guest', cap: 0,
    hostDealt: 50, guestDealt: 0, hostChip: 0, guestChip: 8, hostOk: 1, guestOk: 0
});
assert(syncKo && syncKo.winner === 'host', 'HP at 0 overrides a lying winner field');
const syncCap = rules.interpretSync({
    t: 'sync', roundId: 'r24', hostHp: 40, guestHp: 55, winner: 'guest', cap: 1
});
assert(syncCap && syncCap.winner === 'guest' && syncCap.cap === 1, 'round cap can name a winner while both still have HP');
const syncLive = rules.interpretSync({
    t: 'sync', roundId: 'r4', hostHp: 40, guestHp: 55, winner: 'guest', cap: 0
});
assert(syncLive && syncLive.winner === '', 'without cap or a KO the fight continues');
assert(rules.interpretSync({ t: 'sync', roundId: 'nope', hostHp: 1, guestHp: 1 }) === null, 'bad round id is ignored');

const calls = [];
const isoContext = {
    console,
    Set,
    document: { body: { classList: { contains: function () { return isoContext.battleOpen; } } } },
    usedQuestionsMap: new Set(['keep-me']),
    usedWordQuestionIds: new Set(['keep-w']),
    lastQuestionTypeIndex: 3,
    isRankedMode: false,
    pendingStrandId: 'g1_u1',
    battleOpen: false,
    generateDynamicQuestion: function () {
        calls.push({
            ranked: isoContext.isRankedMode,
            strand: isoContext.pendingStrandId,
            hasOld: isoContext.usedQuestionsMap.has('keep-me'),
            hasPvp: isoContext.usedQuestionsMap.has('pvp-stem-1')
        });
        const stem = 'pvp-stem-' + calls.length;
        isoContext.usedQuestionsMap.add(stem);
        isoContext.usedWordQuestionIds.add('w' + calls.length);
        return { question: stem, options: ['1', '2'], correctAnswer: '1' };
    }
};
vm.createContext(isoContext);
vm.runInContext(sliceBetween(html, '/* PVP_QUESTION_ISOLATION_START', '/* PVP_QUESTION_ISOLATION_END */'), isoContext);
const first = isoContext.generatePvpQuestion();
assert(first && first.question === 'pvp-stem-1', 'first isolated question');
assert(isoContext.isRankedMode === false && isoContext.pendingStrandId === 'g1_u1', 'ranked flag and strand restored');
assert(isoContext.usedQuestionsMap.has('keep-me') && isoContext.usedQuestionsMap.size === 1, 'single-player used-question set restored');
assert(isoContext.usedWordQuestionIds.has('keep-w') && isoContext.usedWordQuestionIds.size === 1, 'word-bank used set restored');
assert(isoContext.lastQuestionTypeIndex === 3, 'question type cursor restored');
const second = isoContext.generatePvpQuestion();
assert(second && second.question === 'pvp-stem-2', 'second question');
assert(calls.length === 2 && calls[0].hasPvp === false && calls[1].hasPvp === true, 'later rounds remember PvP stems only');
assert(calls[0].ranked === true && calls[0].strand === null && calls[0].hasOld === true, 'generator sees ranked variety plus the saved single-player set');
isoContext.battleOpen = true;
assert(isoContext.generatePvpQuestion() === null && calls.length === 2, 'open single-player battle is not touched');
isoContext.battleOpen = false;
isoContext.resetPvpQuestionMemory();
isoContext.generatePvpQuestion();
assert(calls[2].hasPvp === false, 'reset drops the PvP memory');

const rosterCalls = [];
const rosterContext = {
    console,
    Math,
    Number,
    String,
    Array,
    currentUser: {
        ownedMonsters: [
            { id: 'fire_base', level: 3 },
            { id: 'water_base', level: 1 },
            { id: 'nope', level: 9 },
            { id: 'fire_base', level: 3 }
        ]
    },
    selectedBattleTeam: ['water_base'],
    BEAST_IMAGES: {
        fire_baby: 'assets/monsters/classic/火寶寶.png',
        water_turtle: 'assets/monsters/classic/水滴龜.png',
        evil: 'https://evil.example/a.png',
        sneak: 'assets/monsters/../../secret.png',
        st_elden: 'assets/monsters/star-trail/ui-star-card-elden.png?v=629c9688',
        badq: 'assets/monsters/star-trail/ui-star-card-elden.png?v=629c9688&x=1'
    },
    getElementZh: function (el) { return el === 'fire' ? '火' : '水'; },
    getMonsterRuntimeData: function (id, level, rankedBoss) {
        rosterCalls.push({ id: id, level: level, rankedBoss: rankedBoss });
        if (id === 'nope') {
            return { id: id, name: '冒險怪獸', imgKey: 'fire_baby', element: 'fire', hp: 99999, atk: 99999, def: 1 };
        }
        if (id === 'fire_base') {
            return { id: id, name: '火寶寶', imgKey: 'fire_baby', element: 'fire', hp: 60 + level, atk: 35, def: 20 };
        }
        if (id === 'water_base') {
            return { id: id, name: '水滴龜', imgKey: 'water_turtle', element: 'water', hp: 70, atk: 25, def: 35 };
        }
        return null;
    }
};
rosterContext.window = rosterContext;
vm.createContext(rosterContext);
vm.runInContext(sliceBetween(html, '/* PVP_ROSTER_START', '/* PVP_ROSTER_END */'), rosterContext);
assert(rosterContext.resolvePvpBeast('nope', 40) === null, 'unknown id is not a free 99999 ATK beast');
const fire = rosterContext.resolvePvpBeast('fire_base', 3);
assert(fire && fire.maxHp === 63 && fire.atk === 35 && fire.name === '火寶寶', 'stats come from the catalog, got ' + JSON.stringify(fire));
assert(rosterCalls.some(function (c) { return c.rankedBoss === false; }), 'PvP resolve does not apply ranked-boss buffs');
assert(rosterContext.resolvePvpBeast('fire_base', 99) === null, 'level above 40 is rejected');
const owned = rosterContext.listOwnedBeastsForPvp();
assert(owned.length === 2 && owned[0].id === 'water_base' && owned[0].party === 1, 'party beast is listed first, dupes dropped');
assert(owned[1].id === 'fire_base' && !owned[1].party, 'other owned beast follows');
assert(rosterContext.pvpBeastImageSrc('fire_baby') === 'assets/monsters/classic/火寶寶.png', 'chinese monster art path allowed');
assert(rosterContext.pvpBeastImageSrc('evil') === '', 'external image rejected');
assert(rosterContext.pvpBeastImageSrc('sneak') === '', 'path traversal rejected');
assert(rosterContext.pvpBeastImageSrc('st_elden') === 'assets/monsters/star-trail/ui-star-card-elden.png?v=629c9688', 'cache-bust query is allowed');
assert(rosterContext.pvpBeastImageSrc('badq') === '', 'extra query parameters are rejected');
assert(rosterContext.pvpElementLabel('fire') === '火', 'element label reused');

assert(html.indexOf('id="pvp-step-pick"') !== -1 && html.indexOf('id="pvp-step-fight"') !== -1, 'pick and fight steps exist');

const cloudBtn = html.match(/<button[^>]*island-hotspot--cloudrealm[\s\S]*?<\/button>/);
assert(cloudBtn, 'cloudrealm hotspot exists');
if (cloudBtn) {
    assert(!cloudBtn[0].includes('island-hotspot--locked'), 'cloudrealm hotspot is unlocked');
    assert(!cloudBtn[0].includes('data-locked-tip'), 'cloudrealm hotspot has no locked tip');
    assert(!cloudBtn[0].includes('showIslandLockedTip'), 'cloudrealm hotspot does not use the pending tip');
    assert(cloudBtn[0].includes("switchView('pvp')"), 'cloudrealm hotspot opens the PvP view');
    assert(cloudBtn[0].includes('aria-label="雲霄決鬥場，1v1 怪獸對戰"'), 'cloudrealm aria uses the duel-arena name');
    assert(cloudBtn[0].includes('>雲霄決鬥場<'), 'cloudrealm plate shows 雲霄決鬥場');
    assert(!cloudBtn[0].includes('雲端秘境'), 'cloudrealm control does not say 雲端秘境');
}
const playerCopy = html.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
assert(!playerCopy.includes('雲端秘境'), 'player-facing copy no longer says 雲端秘境');
assert(/<h2 class="pvp-title">雲霄決鬥場<\/h2>/.test(html), 'PvP title is 雲霄決鬥場');
assert(html.includes('<p class="pvp-subtitle">1v1 怪獸對戰</p>'), 'PvP subtitle keeps the 1v1 mode');
assert(html.includes('<p class="pvp-kicker">雲霄決鬥場</p>'), 'PvP kicker uses the duel-arena name');
const openBtn = html.match(/<button[^>]*id="pvp-open-btn"[\s\S]*?<\/button>/);
assert(openBtn && openBtn[0].includes("switchView('pvp')") && openBtn[0].includes('>雲霄決鬥場<'), 'header/bottom PvP button still opens the same view');
const artNote = fs.readFileSync(path.join(root, 'assets/README.md'), 'utf8');
assert(artNote.includes('@怪獸美術') && artNote.includes('ui-label-cloudrealm') && /568\s*\/\s*120/.test(artNote), 'art note asks for a 568/120 雲霄決鬥場 plate');
assert(html.indexOf('const STAR_TRAIL_BEASTS = []') === -1, 'star-trail roster is populated');
assert(html.indexOf("'star-trail': { series: 'star-trail', open: true }") !== -1, 'star-trail pool is open');
assert(peerSrc.indexOf('floor(自己 ATK × 1.8)') !== -1, 'damage formula stays documented in pvp-peer.js');

if (process.exitCode) {
    console.error('pvp battle tests failed');
    process.exit(process.exitCode);
}
console.log('pvp battle tests passed');
