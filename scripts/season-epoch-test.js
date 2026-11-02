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
assert(r1.gold === 4000 && r1.exp === 300 && r1.monsterId === 'season_kirin', 'rank 1 reward');
const r2 = context.rewardForRank_(2);
const r3 = context.rewardForRank_(3);
assert(r2.gold === 3300 && r2.exp === 230 && r2.monsterId === 'season_kirin', 'rank 2 reward');
assert(r3.gold === 3000 && r3.exp === 230 && r3.monsterId === 'season_kirin', 'rank 3 reward');
const r4 = context.rewardForRank_(4);
const r10 = context.rewardForRank_(10);
assert(r4.gold === 2000 && r4.exp === 100 && r4.monsterId === 'season_kirin', 'rank 4 reward');
assert(r10.gold === 2000 && r10.exp === 100 && r10.monsterId === 'season_kirin', 'rank 10 reward');
const r11 = context.rewardForRank_(11);
assert(r11.gold === 0 && r11.exp === 0 && r11.monsterId === '', 'rank 11 none');
assert(context.SEASON_KIRIN_MAX_RANK === 10, 'kirin cutoff is top 10');

function kirinCount(profile) {
  return (profile.ownedMonsters || []).filter((m) => m && m.id === 'season_kirin').length;
}

for (let rank = 1; rank <= 10; rank++) {
  const reward = context.rewardForRank_(rank);
  const profile = {
    gold: 20,
    expPacks: 1,
    ownedMonsters: [{ id: 'fire_base', level: 3, exp: 4 }]
  };
  const firstGrant = context.applyMonsterIdsToProfile_(profile, [reward.monsterId]);
  assert(firstGrant.grantedMonsters.join() === 'season_kirin', 'rank ' + rank + ' grants kirin');
  assert(kirinCount(profile) === 1, 'rank ' + rank + ' owns one kirin');
  assert(profile.ownedMonsters.some((m) => m.id === 'fire_base' && m.level === 3), 'rank ' + rank + ' keeps other monsters');
  const secondGrant = context.applyMonsterIdsToProfile_(profile, [reward.monsterId]);
  assert(secondGrant.grantedMonsters.length === 0 && secondGrant.convertedMonsters.join() === 'season_kirin', 'rank ' + rank + ' duplicate converts');
  assert(kirinCount(profile) === 1, 'rank ' + rank + ' still one kirin');
  assert(profile.expPacks === 1 + context.DUPLICATE_MONSTER_EXP, 'rank ' + rank + ' duplicate is exp only');
  assert(profile.gold === 20, 'monster grant does not touch gold');
}

const outsider = { expPacks: 3, ownedMonsters: [{ id: 'fire_base', level: 2, exp: 4 }] };
const noGrant = context.applyMonsterIdsToProfile_(outsider, [r11.monsterId]);
assert(noGrant.grantedMonsters.length === 0 && noGrant.convertedMonsters.length === 0, 'rank 11 grant is empty');
assert(kirinCount(outsider) === 0, 'rank 11 does not own kirin');
assert(outsider.expPacks === 3 && outsider.ownedMonsters[0].level === 2, 'rank 11 leaves the account alone');

assert(context.isSafeMonsterId_('season_kirin'), 'monster id ok');
assert(!context.isSafeMonsterId_('data:image/png;base64,aaaa'), 'reject dataURL');
assert(context.parseMonsterIdList_('season_kirin, season_kirin').join() === 'season_kirin', 'dedupe ids');
assert(context.parseMonsterIdList_('data:image/png;base64,iVBORw0KGgo').length === 0, 'dataURL cell yields no ids');

const first = context.applySeasonRewardToCells_('', 12, '', '', r1, 1);
assert(first.applied === true, 'first grant applies');
assert(first.gold === 4000, 'gold queued');
assert(first.exp === 312, 'exp adds onto existing teacher pending');
assert(first.monster === 'season_kirin', 'monster id queued');
assert(first.paid === '1', 'epoch marked paid');
const second = context.applySeasonRewardToCells_(first.gold, first.exp, first.monster, first.paid, r1, 1);
assert(second.applied === false, 're-run does not grant again');
assert(second.gold === 4000 && second.exp === 312 && second.monster === 'season_kirin', 'cells unchanged on re-run');

const keepTeacher = context.applySeasonRewardToCells_(100, 0, 'other_pet', '', context.rewardForRank_(4), 2);
assert(keepTeacher.gold === 2100 && keepTeacher.monster === 'other_pet,season_kirin' && keepTeacher.paid === '2', 'rank 4 adds gold and queues kirin beside existing monster id');
const rank10Queue = context.applySeasonRewardToCells_('', 0, '', '', context.rewardForRank_(10), 3);
assert(rank10Queue.applied === true && rank10Queue.monster === 'season_kirin' && rank10Queue.gold === 2000 && rank10Queue.exp === 100, 'rank 10 queues kirin');
const rank10Again = context.applySeasonRewardToCells_(rank10Queue.gold, rank10Queue.exp, rank10Queue.monster, rank10Queue.paid, context.rewardForRank_(10), 3);
assert(rank10Again.applied === false && rank10Again.monster === 'season_kirin', 'rank 10 re-run does not queue a second kirin');
const rank11Queue = context.applySeasonRewardToCells_('', 0, 'other_pet', '', r11, 4);
assert(rank11Queue.monster === 'other_pet' && rank11Queue.gold === '', 'rank 11 does not queue kirin');

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
assert(g1[1].reward.gold === 3300 && g1[1].reward.exp === 230 && g1[1].reward.monsterId === 'season_kirin', 'G1 2nd gets kirin');
assert(g1[9].reward.gold === 2000 && g1[9].reward.exp === 100 && g1[9].reward.monsterId === 'season_kirin', 'G1 10th gets kirin');
assert(g1.every((w) => w.reward.monsterId === 'season_kirin'), 'every G1 top-10 row gets kirin');
assert(!g1.some((w) => w.key === 'zero'), 'zero score excluded');
assert(g2.length === 1 && g2[0].reward.monsterId === 'season_kirin', 'G2 sole player is rank 1');
assert(!top.some((w) => w.key === 'g1-10' || w.key === 'g1-11'), '11th and 12th excluded');

const tied = context.rankGradeTop10_([
  { key: 'b', grade: 'G3', nickname: '乙', rankScore: 50, school: '', className: '3A', classNo: 1 },
  { key: 'a', grade: 'G3', nickname: '甲', rankScore: 50, school: '', className: '3A', classNo: 2 }
]);
assert(tied.length === 2, 'tie both in top 10');
assert(tied[0].nickname === '甲' && tied[1].nickname === '乙', 'tie breaks by nickname ascending, got ' + tied.map((t) => t.nickname).join(','));

const oldSnap = context.winnersFromSnapshot_([
  { key: 'a', grade: 'G6', rank: 1, nickname: '甲', rankScore: 100, gold: 3000, exp: 40, monsterId: 'season_kirin' },
  { key: 'b', grade: 'G6', rank: 10, nickname: '乙', rankScore: 10, gold: 800, exp: 0, monsterId: '' },
  { key: 'c', grade: 'G6', rank: 11, nickname: '丙', rankScore: 1, gold: 0, exp: 0, monsterId: '' }
]);
assert(oldSnap[0].reward.monsterId === 'season_kirin', 'snapshot rank 1 keeps kirin');
assert(oldSnap[1].reward.monsterId === 'season_kirin', 'old snapshot rank 10 backfills kirin');
assert(oldSnap[2].reward.monsterId === '', 'snapshot rank 11 is not backfilled');

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
assert(grabConst('SEASON_KIRIN_MAX_RANK') === context.SEASON_KIRIN_MAX_RANK, 'kirin rank cutoff synced');
assert(grabConst('DUPLICATE_MONSTER_EXP') === context.DUPLICATE_MONSTER_EXP, 'duplicate exp synced');
const gold = grabConst('SEASON_REWARD_GOLD');
const exp = grabConst('SEASON_REWARD_EXP');
assert(JSON.stringify(gold) === JSON.stringify(context.SEASON_REWARD_GOLD), 'gold table synced');
assert(JSON.stringify(exp) === JSON.stringify(context.SEASON_REWARD_EXP), 'exp table synced');
assert(html.includes('頭10名：聖光麒麟'), 'player copy says top 10 get 聖光麒麟');
assert(html.includes('function seasonKirinRewardLabel'), 'reward label is built in the client');
assert(html.includes('function seasonPreviewPrizeText'), 'preview prize is formatted on the client');
assert(!html.includes('row.monsterId ?'), 'preview does not show kirin only when the server sent an id');

function grabFunction(name) {
  const start = html.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('missing function ' + name);
  let i = html.indexOf('{', start);
  let depth = 0;
  for (; i < html.length; i++) {
    const ch = html[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return html.slice(start, i + 1);
    }
  }
  throw new Error('unclosed function ' + name);
}

const previewContext = {
  SEASON_REWARD_GOLD: gold,
  SEASON_REWARD_EXP: exp,
  SEASON_REWARD_MONSTER_ID: grabConst('SEASON_REWARD_MONSTER_ID'),
  SEASON_KIRIN_MAX_RANK: grabConst('SEASON_KIRIN_MAX_RANK'),
  SEASON_LIMITED_BEASTS: [{ id: 'season_kirin', name: '聖光麒麟' }]
};
vm.createContext(previewContext);
vm.runInContext(
  [
    grabFunction('seasonMonsterName'),
    grabFunction('rewardForSeasonRank'),
    grabFunction('seasonPreviewPrizeText')
  ].join('\n'),
  previewContext
);
const staleServerRow = { rank: 2, gold: 1800, exp: 20, monsterId: '' };
const staleRank10 = { rank: 10, gold: 800, exp: 0, monsterId: '' };
assert(previewContext.seasonPreviewPrizeText({ rank: 1 }) === '金幣 4000 · EXP 300 · 聖光麒麟', 'rank 1 preview text');
assert(previewContext.seasonPreviewPrizeText(staleServerRow) === '金幣 3300 · EXP 230 · 聖光麒麟', 'rank 2 preview shows kirin despite empty server id');
assert(previewContext.seasonPreviewPrizeText({ rank: 3, monsterId: '' }) === '金幣 3000 · EXP 230 · 聖光麒麟', 'rank 3 preview text');
assert(previewContext.seasonPreviewPrizeText(staleRank10) === '金幣 2000 · EXP 100 · 聖光麒麟', 'rank 10 preview shows kirin despite old server payload');
assert(previewContext.seasonPreviewPrizeText({ rank: 11, monsterId: 'season_kirin', gold: 800 }) === '', 'rank 11 preview shows nothing');
assert(html.includes('assets/monsters/classic/青龍.jpg'), 'season art is a file path');
assert(!html.includes("season_kirin: 'data:"), 'season art is not a dataURL');
assert(html.includes('login-nickname'), 'nickname login remains');
assert(html.includes('fillLeaderboardAvatar'), 'leaderboard rows paint an avatar');
assert(html.includes('會顯示喺大廳頂部同年級排行榜'), 'picker copy says the grade board shows the avatar');

const jpeg = 'data:image/jpeg;base64,abcdefghij0123456789ABCD';
const pub = context.publicEntryFromProfile('顯示', JSON.stringify({
  nickname: '新同學',
  school: '梨木樹天主教小學',
  className: '6B',
  classNo: 3,
  rankScore: 200,
  password: 'secret',
  _pwd: 'secret',
  avatarId: 'fire_baby',
  avatarData: jpeg
}), '');
assert(pub.nickname === '新同學' && pub.rankScore === 200 && pub.grade === 'G6', 'public entry keeps rank fields');
assert(pub.className === '6B' && pub.school === '梨木樹天主教小學', 'public entry keeps class');
assert(pub.avatarId === 'fire_baby', 'preset avatar id kept');
assert(pub.avatarData === jpeg, 'custom avatar data kept');
assert(pub.password === undefined && pub._pwd === undefined, 'password not on leaderboard entry');

const bad = context.publicEntryFromProfile('x', JSON.stringify({
  nickname: '壞',
  className: '6A',
  rankScore: 1,
  avatarId: 'https://evil',
  avatarData: 'https://evil.example/a.png'
}), '');
assert(bad.rankScore === 1, 'bad avatar does not change score');
assert(bad.avatarId === '' && bad.avatarData === '', 'reject remote avatar id and url');

const svg = 'data:image/svg+xml;base64,abcdefghij0123456789ABCD';
const svgEntry = context.publicEntryFromProfile('x', JSON.stringify({
  avatarId: 'not valid!',
  avatarData: svg
}), '');
assert(svgEntry.avatarId === '' && svgEntry.avatarData === '', 'reject svg and illegal id');

const missing = context.publicEntryFromProfile('無名', '{}', '');
assert(missing.avatarId === '' && missing.avatarData === '' && missing.nickname === '無名', 'missing avatar fields are empty');
assert(missing.rankScore === 0, 'missing score stays zero');

const cleared = context.publicEntryFromProfile('清', JSON.stringify({
  nickname: '清',
  className: '5A',
  rankScore: 40,
  avatarId: '',
  avatarData: ''
}), '');
assert(cleared.avatarId === '' && cleared.avatarData === '' && cleared.grade === 'G5' && cleared.rankScore === 40, 'explicit clear stays empty and rank is unchanged');

if (!process.exitCode) console.log('season-epoch-test: ok');
