/**
 * 賽季 epoch／獎勵／冪等。直接載入 sheets-bridge-Code.gs 嘅純函數。
 * node scripts/season-epoch-test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const gs = fs.readFileSync(path.join(root, 'sheets-bridge-Code.gs'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const context = {
  console,
  Date,
  Math,
  JSON,
  Number,
  String,
  Object,
  Array,
  isFinite,
  RegExp
};
vm.createContext(context);
vm.runInContext(gs, context);

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exitCode = 1;
  }
}

const start = context.SEASON_START_UTC_MS;
assert(context.seasonEpochAt_(start) === 1, 'epoch at start is 1, got ' + context.seasonEpochAt_(start));
assert(context.seasonEpochAt_(start - 1) === 0, 'epoch 1ms before start is 0');
assert(context.seasonEpochAt_(start + 21 * 86400000) === 2, 'epoch at +21d is 2');
assert(context.seasonEpochAt_(start + 21 * 86400000 - 1) === 1, 'epoch 1ms before +21d is still 1');
assert(context.seasonEpochAt_(start + 42 * 86400000) === 3, 'epoch at +42d is 3');

// 2026-10-29 12:00 HKT = 2026-10-29 04:00 UTC，仍係第 1 賽季
const oct29 = Date.UTC(2026, 9, 29, 4, 0, 0, 0);
assert(context.seasonEpochAt_(oct29) === 1, '2026-10-29 HKT noon is season 1');

const r1 = context.rewardForRank_(1);
assert(r1.gold === 3000 && r1.exp === 40 && r1.monsterId === 'season_kirin', 'rank 1 reward');
const r2 = context.rewardForRank_(2);
const r3 = context.rewardForRank_(3);
assert(r2.gold === 1800 && r2.exp === 20 && r2.monsterId === '', 'rank 2 reward');
assert(r3.gold === 1800 && r3.exp === 20 && r3.monsterId === '', 'rank 3 reward');
const r4 = context.rewardForRank_(4);
const r10 = context.rewardForRank_(10);
assert(r4.gold === 800 && r4.exp === 0 && !r4.monsterId, 'rank 4 reward');
assert(r10.gold === 800 && r10.exp === 0, 'rank 10 reward');
assert(context.rewardForRank_(11).gold === 0, 'rank 11 none');

assert(context.isSafeMonsterId_('season_kirin'), 'monster id ok');
assert(!context.isSafeMonsterId_('data:image/png;base64,aaaa'), 'reject dataURL');
assert(context.parseMonsterIdList_('season_kirin, season_kirin').join() === 'season_kirin', 'dedupe ids');
assert(context.parseMonsterIdList_('data:image/png;base64,iVBORw0KGgo').length === 0, 'dataURL cell yields no ids');

const first = context.applySeasonRewardToCells_('', 12, '', '', r1, 1);
assert(first.applied === true, 'first grant applies');
assert(first.gold === 3000, 'gold queued');
assert(first.exp === 52, 'exp adds onto existing teacher pending');
assert(first.monster === 'season_kirin', 'monster id queued');
assert(first.paid === '1', 'epoch marked paid');
const second = context.applySeasonRewardToCells_(first.gold, first.exp, first.monster, first.paid, r1, 1);
assert(second.applied === false, 're-run does not grant again');
assert(second.gold === 3000 && second.exp === 52 && second.monster === 'season_kirin', 'cells unchanged on re-run');

const keepTeacher = context.applySeasonRewardToCells_(100, 0, 'other_pet', '', context.rewardForRank_(4), 2);
assert(keepTeacher.gold === 900 && keepTeacher.monster === 'other_pet' && keepTeacher.paid === '2', 'rank 4 adds gold and keeps existing monster cell');

const players = [];
for (let i = 0; i < 12; i++) {
  players.push({
    key: 'g1-' + i,
    grade: 'G1',
    nickname: '生' + String.fromCharCode(65 + i),
    rankScore: 1000 - i,
    school: 'S',
    className: '1A',
    classNo: i
  });
}
players.push({ key: 'g2', grade: 'G2', nickname: '小二冠軍', rankScore: 5, school: 'S', className: '2A', classNo: 1 });
players.push({ key: 'zero', grade: 'G1', nickname: '零分', rankScore: 0, school: 'S', className: '1A', classNo: 99 });
const top = context.rankGradeTop10_(players);
const g1 = top.filter((w) => w.grade === 'G1');
const g2 = top.filter((w) => w.grade === 'G2');
assert(g1.length === 10, 'G1 top 10 only, got ' + g1.length);
assert(g1[0].rankScore === 1000 && g1[0].reward.monsterId === 'season_kirin', 'G1 first gets monster');
assert(g1[9].reward.gold === 800 && !g1[9].reward.monsterId, 'G1 10th gold only');
assert(!g1.some((w) => w.key === 'zero'), 'zero score excluded');
assert(g2.length === 1 && g2[0].reward.monsterId === 'season_kirin', 'G2 sole player is rank 1');
assert(!top.some((w) => w.key === 'g1-10' || w.key === 'g1-11'), '11th and 12th excluded');

const tied = context.rankGradeTop10_([
  { key: 'b', grade: 'G3', nickname: '乙', rankScore: 50, school: '', className: '3A', classNo: 1 },
  { key: 'a', grade: 'G3', nickname: '甲', rankScore: 50, school: '', className: '3A', classNo: 2 }
]);
assert(tied.length === 2, 'tie both in top 10');
assert(tied[0].nickname === '甲' && tied[1].nickname === '乙', 'tie breaks by nickname ascending, got ' + tied.map((t) => t.nickname).join(','));

const kept = context.reconcileSavedProfile_(
  { rankScore: 0, leaderboardEpoch: 2, ownedMonsters: [{ id: 'season_kirin', level: 1, exp: 0 }], gold: 10 },
  { rankScore: 5000, leaderboardEpoch: 1, ownedMonsters: [{ id: 'fire_base', level: 3, exp: 0 }], gold: 99 }
);
assert(kept.rankScore === 0 && kept.leaderboardEpoch === 2, 'higher cloud epoch keeps reset score');
assert(kept.ownedMonsters.some((m) => m.id === 'season_kirin'), 'granted monster kept');
assert(kept.ownedMonsters.some((m) => m.id === 'fire_base' && m.level === 3), 'client monster kept');

const sameEp = context.reconcileSavedProfile_(
  { rankScore: 100, leaderboardEpoch: 2, ownedMonsters: [] },
  { rankScore: 40, leaderboardEpoch: 2, ownedMonsters: [] }
);
assert(sameEp.rankScore === 100, 'same epoch rank does not fall');

assert(context.effectiveScoreEpoch_({ leaderboardEpoch: 0 }) === 1, 'legacy epoch 0 counts as season 1');
assert(context.effectiveScoreEpoch_({}) === 1, 'missing epoch counts as season 1');

function grabConst(name) {
  const re = new RegExp('const ' + name + ' = ([^;]+);');
  const m = html.match(re);
  if (!m) throw new Error('missing ' + name + ' in index.html');
  return Function('Date', 'return (' + m[1] + ');')(Date);
}

assert(grabConst('SEASON_LENGTH_DAYS') === context.SEASON_LENGTH_DAYS, 'length days synced');
assert(grabConst('SEASON_START_UTC_MS') === context.SEASON_START_UTC_MS, 'start ms synced');
assert(grabConst('SEASON_REWARD_MONSTER_ID') === context.SEASON_REWARD_MONSTER_ID, 'monster id synced');
assert(grabConst('DUPLICATE_MONSTER_EXP') === context.DUPLICATE_MONSTER_EXP, 'duplicate exp synced');
const gold = grabConst('SEASON_REWARD_GOLD');
const exp = grabConst('SEASON_REWARD_EXP');
assert(JSON.stringify(gold) === JSON.stringify(context.SEASON_REWARD_GOLD), 'gold table synced');
assert(JSON.stringify(exp) === JSON.stringify(context.SEASON_REWARD_EXP), 'exp table synced');
assert(html.includes('assets/monsters/classic/青龍.jpg'), 'season art is a file path');
assert(!html.includes("season_kirin: 'data:"), 'season art is not a dataURL');
assert(html.includes('login-nickname'), 'nickname login remains');

if (!process.exitCode) console.log('season-epoch-test: ok');
