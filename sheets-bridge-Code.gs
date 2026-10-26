/**
 * 數理怪獸橋接：進度上報 + 跨裝置帳戶同步 + 老師待發放（加金幣／加EXP包）
 * Spreadsheet: 數理怪獸｜老師跟進示範
 *
 * 帳戶欄：A帳戶鍵 B密碼雜湊 C顯示名 D存檔JSON E最後更新 F加金幣 G加EXP包
 * 老師喺 F／G 填正整數；學生下次 login 或 save 會自動加到 profile 並清空 F／G。
 *
 * 部署：網頁應用程式／執行身分：我／對象：任何人
 * 每次改 Code 後要「管理部署 → 編輯 → 新版本」
 */
var SPREADSHEET_ID = '1O5b2ogfhia5Yso-5QY9c4eYtvDwu3WpYgUrxBoMjJY8';
var OVERVIEW = '學生總覽';
var LOG = '戰鬥紀錄';
var ACCOUNTS = '帳戶';

function doGet() {
  return jsonOut({
    ok: true,
    service: 'math-monster-bridge',
    features: ['report', 'account-sync', 'pending-grants', 'leaderboard', 'playerStats']
  });
}

function doPost(e) {
  try {
    var raw = (e && e.postData && e.postData.contents) ? e.postData.contents : '{}';
    var data = JSON.parse(raw);
    var action = data.action || 'report';

    if (action === 'register') return accountRegister(data);
    if (action === 'login') return accountLogin(data);
    if (action === 'save') return accountSave(data);
    if (action === 'leaderboard') return leaderboardList(data);
    if (action === 'playerStats') return playerStats(data);
    if (action === 'report' || !data.action) return progressReport(data);

    return jsonOut({ ok: false, error: 'unknown_action' });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function nowHK() {
  return Utilities.formatDate(new Date(), 'Asia/Hong_Kong', 'yyyy-MM-dd HH:mm');
}

function sha256(text) {
  var raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(text || ''), Utilities.Charset.UTF_8);
  return raw.map(function (b) {
    var v = (b < 0) ? b + 256 : b;
    return ('0' + v.toString(16)).slice(-2);
  }).join('');
}

function accountsSheet() {
  var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(ACCOUNTS);
  ensureAccountHeaders(sheet);
  return sheet;
}

/** Ensure A–G headers exist (idempotent). */
function ensureAccountHeaders(sheet) {
  if (!sheet) return;
  var headers = ['帳戶鍵', '密碼雜湊', '顯示名', '存檔JSON', '最後更新', '加金幣', '加EXP包'];
  var range = sheet.getRange(1, 1, 1, headers.length);
  var current = range.getValues()[0];
  var needWrite = false;
  for (var i = 0; i < headers.length; i++) {
    if (String(current[i] || '') !== headers[i]) {
      needWrite = true;
      break;
    }
  }
  if (needWrite) range.setValues([headers]);
}

function findAccountRow(sheet, key) {
  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(key)) return i + 1;
  }
  return -1;
}

function parseNonNegInt(v) {
  if (v === null || v === undefined || v === '') return 0;
  var n = Number(v);
  if (!isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

/**
 * Read F/G pending grants, add into profile, clear F/G, write D+E.
 * Returns { profile, grantedGold, grantedExp }.
 */
function applyPendingGrants(sheet, row, profile) {
  var p = profile && typeof profile === 'object' ? profile : {};
  var addGold = parseNonNegInt(sheet.getRange(row, 6).getValue());
  var addExp = parseNonNegInt(sheet.getRange(row, 7).getValue());

  var gold = parseNonNegInt(p.gold);
  var packs = parseNonNegInt(p.expPacks);
  // allow zero base (new users); treat missing as 0
  if (p.gold == null || p.gold === '') gold = 0;
  else gold = Math.max(0, Math.floor(Number(p.gold) || 0));
  if (p.expPacks == null || p.expPacks === '') packs = 0;
  else packs = Math.max(0, Math.floor(Number(p.expPacks) || 0));

  if (addGold > 0) gold += addGold;
  if (addExp > 0) packs += addExp;

  p.gold = gold;
  p.expPacks = packs;
  // 發放後打時間戳，客戶端合併先以較新為準
  p.updatedAt = new Date().toISOString();

  sheet.getRange(row, 4).setValue(JSON.stringify(p));
  sheet.getRange(row, 5).setValue(nowHK());
  if (addGold > 0 || addExp > 0) {
    sheet.getRange(row, 6).setValue('');
    sheet.getRange(row, 7).setValue('');
  }

  return { profile: p, grantedGold: addGold, grantedExp: addExp };
}

function accountRegister(data) {
  var key = String(data.key || '').trim();
  var password = String(data.password || '');
  var profile = data.profile || {};
  if (!key || !password) return jsonOut({ ok: false, error: 'missing_key_or_password' });

  var sheet = accountsSheet();
  if (findAccountRow(sheet, key) > 0) return jsonOut({ ok: false, error: 'exists' });

  var hash = sha256(password);
  var json = JSON.stringify(profile);
  // A–G：新戶 F/G 留空
  sheet.appendRow([key, hash, profile.displayName || profile.alias || key, json, nowHK(), '', '']);
  return jsonOut({ ok: true, action: 'register', profile: profile });
}

function accountLogin(data) {
  var key = String(data.key || '').trim();
  var password = String(data.password || '');
  if (!key || !password) return jsonOut({ ok: false, error: 'missing_key_or_password' });

  var sheet = accountsSheet();
  var row = findAccountRow(sheet, key);
  if (row < 0) return jsonOut({ ok: false, error: 'not_found' });

  var hash = String(sheet.getRange(row, 2).getValue());
  if (hash !== sha256(password)) return jsonOut({ ok: false, error: 'bad_password' });

  var json = String(sheet.getRange(row, 4).getValue() || '{}');
  var profile = {};
  try { profile = JSON.parse(json); } catch (e) { profile = {}; }

  var applied = applyPendingGrants(sheet, row, profile);
  return jsonOut({
    ok: true,
    action: 'login',
    profile: applied.profile,
    grantedGold: applied.grantedGold,
    grantedExp: applied.grantedExp
  });
}

function accountSave(data) {
  var key = String(data.key || '').trim();
  var password = String(data.password || '');
  var profile = data.profile || {};
  if (!key || !password) return jsonOut({ ok: false, error: 'missing_key_or_password' });

  var sheet = accountsSheet();
  var row = findAccountRow(sheet, key);
  if (row < 0) return jsonOut({ ok: false, error: 'not_found' });

  var hash = String(sheet.getRange(row, 2).getValue());
  if (hash !== sha256(password)) return jsonOut({ ok: false, error: 'bad_password' });

  sheet.getRange(row, 3).setValue(profile.displayName || profile.alias || profile.nickname || key);

  // 確保有 updatedAt（客戶端合併用）
  if (!profile.updatedAt) profile.updatedAt = new Date().toISOString();

  // 先寫入學生送來嘅存檔，再套用老師待發放（避免覆蓋發放）
  var applied = applyPendingGrants(sheet, row, profile);
  return jsonOut({
    ok: true,
    action: 'save',
    profile: applied.profile,
    grantedGold: applied.grantedGold,
    grantedExp: applied.grantedExp
  });
}

function progressReport(data) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var now = nowHK();
  var school = data.school || '';
  var klass = data.className || data.class || '';
  var name = data.name || data.alias || '';
  var gold = data.gold != null ? data.gold : '';
  var score = data.score != null ? data.score : '';
  var expPacks = data.expPacks != null ? data.expPacks : '';
  var monsters = data.monsters != null ? data.monsters : '';
  var unit = data.unit || '';
  var result = data.result || '';
  var correct = data.correct != null ? data.correct : '';
  var totalQ = data.totalQuestions != null ? data.totalQuestions : '';
  var mode = data.mode || '冒險';
  var grade = data.grade || '';
  var goldDelta = data.goldDelta != null ? data.goldDelta : '';

  ss.getSheetByName(LOG).appendRow([
    now, school, klass, name, mode, grade, unit, result, correct, goldDelta
  ]);

  var ov = ss.getSheetByName(OVERVIEW);
  var values = ov.getDataRange().getValues();
  var key = [school, klass, name].join('|');
  var found = -1;
  for (var i = 1; i < values.length; i++) {
    var rowKey = [values[i][1], values[i][2], values[i][3]].join('|');
    if (rowKey === key) { found = i + 1; break; }
  }
  var row = [now, school, klass, name, gold, score, expPacks, monsters, unit, result, correct, totalQ];
  if (found > 0) ov.getRange(found, 1, 1, row.length).setValues([row]);
  else ov.appendRow(row);

  return jsonOut({ ok: true, action: 'report' });
}


/** 正規化班別：去空白、大寫 → 1A–6D */
function normalizeClassName(className) {
  var s = String(className || '').toUpperCase().replace(/\s+/g, '');
  s = s.replace(/[Ａ-Ｚ]/g, function (ch) { return String.fromCharCode(ch.charCodeAt(0) - 65248); });
  s = s.replace(/[０-９]/g, function (ch) { return String.fromCharCode(ch.charCodeAt(0) - 65248); });
  var m = s.match(/([1-6])([A-D])/);
  return m ? (m[1] + m[2]) : String(className || '').trim();
}

/** 班別 → 年級（與前端 parseGradeFromClass 一致） */
function parseGradeFromClass(className) {
  var s = String(className || '');
  if (!s) return 'G6';
  if (s.indexOf('1') >= 0 || s.indexOf('一') >= 0) return 'G1';
  if (s.indexOf('2') >= 0 || s.indexOf('二') >= 0) return 'G2';
  if (s.indexOf('3') >= 0 || s.indexOf('三') >= 0) return 'G3';
  if (s.indexOf('4') >= 0 || s.indexOf('四') >= 0) return 'G4';
  if (s.indexOf('5') >= 0 || s.indexOf('五') >= 0) return 'G5';
  return 'G6';
}

/** 由帳戶 D 欄 JSON 抽出公開榜資料（唔回傳密碼雜湊） */
function publicEntryFromProfile(displayName, profileJson, updatedAtCell) {
  var p = {};
  try { p = JSON.parse(String(profileJson || '{}')); } catch (e) { p = {}; }
  if (!p || typeof p !== 'object') p = {};
  var nickname = String(p.nickname || p.displayName || p.alias || displayName || '').trim();
  if (!nickname) nickname = String(displayName || '冒險者').trim() || '冒險者';
  return {
    nickname: nickname,
    school: String(p.school || ''),
    className: String(p.className || p.class || ''),
    classNo: p.classNo != null ? p.classNo : '',
    rankScore: Math.max(0, Math.floor(Number(p.rankScore) || 0)),
    updatedAt: String(p.updatedAt || updatedAtCell || ''),
    grade: parseGradeFromClass(p.className || p.class || '')
  };
}

/**
 * 全服／年級排行榜（公開讀，只回暱稱／班／積分）
 * POST { action:'leaderboard', grade:'G6' }  // grade 可選；空＝全部
 */
function leaderboardList(data) {
  var gradeFilter = String((data && data.grade) || '').trim().toUpperCase();
  var sheet = accountsSheet();
  var values = sheet.getDataRange().getValues();
  var list = [];
  for (var i = 1; i < values.length; i++) {
    var key = String(values[i][0] || '').trim();
    if (!key) continue;
    var entry = publicEntryFromProfile(values[i][2], values[i][3], values[i][4]);
    if (gradeFilter && entry.grade !== gradeFilter) continue;
    list.push(entry);
  }
  list.sort(function (a, b) {
    if (b.rankScore !== a.rankScore) return b.rankScore - a.rankScore;
    return String(a.nickname).localeCompare(String(b.nickname), 'zh');
  });
  // 上限 200，避免回傳過大
  if (list.length > 200) list = list.slice(0, 200);
  return jsonOut({
    ok: true,
    action: 'leaderboard',
    grade: gradeFilter || 'ALL',
    count: list.length,
    entries: list
  });
}

/** 驗證帳戶密碼；成功回傳 { row, profile }，失敗回 null */
function authenticateAccount(key, password) {
  key = String(key || '').trim();
  password = String(password || '');
  if (!key || !password) return null;
  var sheet = accountsSheet();
  var row = findAccountRow(sheet, key);
  if (row < 0) return null;
  var hash = String(sheet.getRange(row, 2).getValue());
  if (hash !== sha256(password)) return null;
  var json = String(sheet.getRange(row, 4).getValue() || '{}');
  var profile = {};
  try { profile = JSON.parse(json); } catch (e) { profile = {}; }
  return { sheet: sheet, row: row, profile: profile || {} };
}

function isAdminProfile(profile, key) {
  if (profile && profile.isAdmin === true) return true;
  var nick = String((profile && (profile.nickname || profile.displayName || profile.alias)) || '').trim().toLowerCase();
  if (nick === 'mr to' || nick === 'yin') return true;
  var k = String(key || '').trim().toLowerCase();
  if (k === 'user_mr to' || k === 'user_mrto' || k === 'user_yin') return true;
  return false;
}

/**
 * 管理員：參加人數統計（要帳戶 key+password，且 isAdmin）
 * POST { action:'playerStats', key, password }
 * 只回聚合數，唔回個人敏感欄。
 */
function playerStats(data) {
  var auth = authenticateAccount(data && data.key, data && data.password);
  if (!auth) return jsonOut({ ok: false, error: 'auth_failed' });
  if (!isAdminProfile(auth.profile, data.key)) {
    return jsonOut({ ok: false, error: 'forbidden' });
  }

  var sheet = auth.sheet;
  var values = sheet.getDataRange().getValues();
  var totalAccounts = 0;
  var byClass = {};
  var byGrade = {};
  var withRankScore = 0;

  for (var i = 1; i < values.length; i++) {
    var key = String(values[i][0] || '').trim();
    if (!key) continue;
    totalAccounts++;
    var entry = publicEntryFromProfile(values[i][2], values[i][3], values[i][4]);
    var klass = normalizeClassName(entry.className) || entry.className || '未填班別';
    if (!klass) klass = '未填班別';
    var grade = entry.grade || 'G6';
    byClass[klass] = (byClass[klass] || 0) + 1;
    byGrade[grade] = (byGrade[grade] || 0) + 1;
    if (entry.rankScore > 0) withRankScore++;
  }

  return jsonOut({
    ok: true,
    action: 'playerStats',
    totalAccounts: totalAccounts,
    byClass: byClass,
    byGrade: byGrade,
    withRankScore: withRankScore
  });
}
