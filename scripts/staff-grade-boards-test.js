/**
 * 管理員各年級排行榜：入口只俾內建管理員，六個年級都用現有 leaderboard。
 * 學生榜仍然只睇自己年級。參加人數統計同賽季結算留喺原位。
 *
 * node scripts/staff-grade-boards-test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const gs = fs.readFileSync(path.join(root, 'sheets-bridge-Code.gs'), 'utf8');

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exitCode = 1;
  } else {
    console.log('ok:', msg);
  }
}

function sliceBetween(src, startMark, endMark) {
  const start = src.indexOf(startMark);
  const end = src.indexOf(endMark, start + startMark.length);
  assert(start !== -1 && end !== -1, 'slice ' + startMark);
  return start === -1 ? '' : src.slice(start, end);
}

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

assert(fs.existsSync(path.join(root, '.nojekyll')), '.nojekyll stays');
assert(!html.includes('對六'), 'grade labels use 小六, not 對六');
assert(html.includes("{ id: 'sh13', name: '夔牛'"), 'sh13 display name is 夔牛');

const wrap = sliceBetween(html, 'class="island-admin-wrap"', 'id="admin-stats-panel"');
assert(wrap.includes('id="admin-stats-card"') && wrap.includes('>參加人數統計<'), 'stats entry stays beside the new control');
assert(wrap.includes('id="admin-grade-boards-card"') && wrap.includes('>各年級排行榜<'), 'admin entry says 各年級排行榜');
const boardsBtn = wrap.slice(wrap.indexOf('id="admin-grade-boards-card"') - 20, wrap.indexOf('各年級排行榜</span>') + 20);
assert(/\bhidden\b/.test(boardsBtn) && boardsBtn.includes('island-admin-btn'), 'grade-board entry is hidden until an admin logs in');
assert(boardsBtn.includes('openStaffGradeBoards()'), 'entry opens the staff review');
assert(wrap.indexOf('admin-stats-card') < wrap.indexOf('admin-grade-boards-card'), 'new entry sits next to the stats control');

const stats = sliceBetween(html, 'id="admin-stats-panel"', 'id="view-ranked"');
assert(stats.includes('排位賽季結算') && stats.includes('adminPreviewSeason()') && stats.includes('adminSettleSeason()'), 'stats panel and season settlement stay');
assert(stats.includes('id="admin-stats-by-grade"') && stats.includes('id="admin-stats-by-class"'), 'stats breakdowns stay');

const ranked = sliceBetween(html, 'id="view-ranked"', 'id="view-grade-boards"');
assert(ranked.includes('id="ranked-leaderboard-list"') && ranked.includes('id="leaderboard-grade-display"'), 'public ranked board markup stays');
assert(!ranked.includes('staff-grade-btn') && !ranked.includes('各年級排行榜'), 'public ranked page is not the staff review');
assert(ranked.includes("switchView('home')") && ranked.includes('返回主選單'), 'public ranked page still returns home');

const staff = sliceBetween(html, 'id="view-grade-boards"', 'id="view-gacha"');
assert(staff.includes('class="hidden staff-boards"'), 'staff view is hidden until opened');
assert(staff.includes("switchView('home')") && staff.includes('返回島嶼'), 'back returns to the island');
['小一', '小二', '小三', '小四', '小五', '小六'].forEach(function (label, i) {
  const grade = 'G' + (i + 1);
  assert(staff.includes('id="staff-grade-btn-' + grade + '"'), 'tab for ' + grade);
  assert(staff.includes('>' + label + '<span'), label + ' tab label');
  assert(staff.includes("selectStaffBoardGrade('" + grade + "')"), label + ' tab does not change the account grade');
});
assert(!staff.includes('selectGrade('), 'staff tabs do not call selectGrade');
assert(staff.includes('id="staff-board-list"') && staff.includes('class="staff-board-list"'), 'staff list reuses a ranked-row host');
assert(staff.includes('管理員檢視 · 小一至小六'), 'staff title says 小一至小六');

const views = html.match(/const views = \[([^\]]+)\]/);
assert(views && views[1].includes("'grade-boards'") && views[1].includes("'ranked'"), 'switchView knows the staff screen');

const sw = grabFunction('switchView');
assert(sw.includes("if (viewName === 'grade-boards' && !currentUser.isAdmin) viewName = 'home'"), 'non-admin navigation bounces home');
assert(sw.includes("if (viewName === 'ranked') renderLeaderboard()"), 'public ranked view still renders one board');
assert(sw.includes("if (viewName === 'grade-boards') renderStaffGradeBoards()"), 'staff view loads every grade');
assert(sw.includes("viewName === 'ranked' || viewName === 'grade-boards'"), 'staff review uses the ranked wood skin');

const openFn = grabFunction('openStaffGradeBoards');
assert(openFn.includes('!currentUser.isAdmin') && openFn.indexOf('isAdmin') < openFn.indexOf("switchView('grade-boards')"), 'only isAdmin can open the view');

const selectFn = grabFunction('selectStaffBoardGrade');
assert(selectFn.includes('!currentUser.isAdmin') && !selectFn.includes('selectGrade'), 'switching grades does not change the signed-in class');
assert(!selectFn.includes('currentUser.className'), 'staff grade switch does not write className');

const adminUi = grabFunction('updateAdminUiVisibility');
assert(adminUi.includes('admin-stats-card') && adminUi.includes('admin-grade-boards-card'), 'both admin entries follow isAdmin');
assert(adminUi.includes('closeStaffGradeBoards'), 'losing admin closes the review');

const pub = grabFunction('renderLeaderboard');
assert(pub.includes('parseGradeFromClass(currentUser.className)'), 'public board still uses the signed-in grade');
assert(pub.includes("callBridge({ action: 'leaderboard', grade: targetGrade })"), 'public board still uses the leaderboard action');
assert((pub.match(/callBridge\(/g) || []).length === 1, 'public board makes one leaderboard call');
assert(!pub.includes('STAFF_BOARD_GRADES'), 'public board does not request every grade');
assert(pub.includes('leaderboardEntryVisible'), 'public board keeps the admin filter');

const load = grabFunction('renderStaffGradeBoards');
assert(load.includes('!currentUser.isAdmin'), 'staff load refuses a non-admin');
assert(load.includes('STAFF_BOARD_GRADES.map'), 'staff load walks every grade');
assert(load.includes("callBridge({ action: 'leaderboard', grade: g })"), 'staff load reuses leaderboard, one grade at a time');
assert(load.includes('leaderboardEntryVisible'), 'staff rows use the same visibility filter');
assert(!load.includes('playerStats') && !load.includes('settleSeason') && !load.includes("action: 'gradeBoards'"), 'no new Apps Script action');
assert(html.includes("var STAFF_BOARD_GRADES = ['G1', 'G2', 'G3', 'G4', 'G5', 'G6']"), 'all six grades are listed');
assert(html.includes("var STAFF_GRADE_LABELS = { 'G1':'小一', 'G2':'小二', 'G3':'小三', 'G4':'小四', 'G5':'小五', 'G6':'小六' }"), 'labels are 小一 to 小六');

const builtIn = grabFunction('isBuiltInAdmin');
assert(builtIn.includes("nick === 'mr to'") && builtIn.includes("nick === 'yin'"), 'allowlist nicknames stay mr to and yin');
assert(builtIn.includes("key === 'user_mr to'") && builtIn.includes("key === 'user_mrto'") && builtIn.includes("key === 'user_yin'"), 'allowlist keys stay the three built-in keys');
assert((builtIn.match(/===/g) || []).length === 5, 'allowlist did not gain another comparison');

const bridgeAdmin = sliceBetween(gs, 'function isAdminProfile', 'function playerStats');
assert(bridgeAdmin.includes("nick === 'mr to'") && bridgeAdmin.includes("nick === 'yin'"), 'Apps Script admin nicknames unchanged');
assert(bridgeAdmin.includes("k === 'user_mr to'") && bridgeAdmin.includes("k === 'user_mrto'") && bridgeAdmin.includes("k === 'user_yin'"), 'Apps Script admin keys unchanged');
assert(gs.includes("if (action === 'leaderboard') return leaderboardList(data);"), 'leaderboard action stays the public grade list');
assert(!gs.includes('gradeBoards') && !gs.includes('staffLeaderboard'), 'bridge has no new staff action');

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(
  [grabFunction('isBuiltInAdmin'), grabFunction('leaderboardEntryVisible')].join('\n'),
  sandbox
);
assert(sandbox.leaderboardEntryVisible({ nickname: '小明', className: '1A', rankScore: 10 }) === true, 'student row stays');
assert(sandbox.leaderboardEntryVisible({ nickname: 'mr to', rankScore: 99 }) === false, 'mr to stays off the board');
assert(sandbox.leaderboardEntryVisible({ nickname: 'Yin', rankScore: 99 }) === false, 'yin stays off the board');
assert(sandbox.leaderboardEntryVisible({ nickname: '同學', key: 'user_mrto', rankScore: 99 }) === false, 'user_mrto key stays off the board');
assert(sandbox.leaderboardEntryVisible({ nickname: '同學', key: 'user_yin', rankScore: 1 }) === false, 'user_yin key stays off the board');
assert(sandbox.leaderboardEntryVisible({ nickname: '助教', isAdmin: true, rankScore: 80 }) === false, 'isAdmin rows stay off the board');
assert(sandbox.leaderboardEntryVisible(null) === false, 'empty rows stay off the board');
assert(sandbox.isBuiltInAdmin('alex', 'user_alex') === false, 'unnamed colleague is not added');

if (!process.exitCode) console.log('staff grade boards: all checks passed');
