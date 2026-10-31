/**
 * 數理怪獸橋接：進度上報 + 跨裝置帳戶同步 + 老師待發放（加金幣／加EXP包）
 * Spreadsheet: 數理怪獸｜老師跟進示範
 *
 * 帳戶欄：A帳戶鍵 B密碼雜湊 C顯示名 D存檔JSON E最後更新 F加金幣 G加EXP包 H班別 I班號 J加怪獸 K已結算賽季
 * 老師喺 F／G 填正整數；學生下次 login 或 save 會自動加到 profile 並清空 F／G。
 * J 只存怪獸 id（例如 season_kirin），唔好貼 dataURL／圖片。已擁有則轉 EXP 包（同抽卡重複 +5）。
 * K 記錄已入帳嘅賽季編號（逗號分隔），用來令結算可以重跑而不重複發獎。
 * 學生總覽／戰鬥紀錄：班號同暱稱分欄（D=班號 E=暱稱）。
 *
 * 部署：網頁應用程式／執行身分：我／對象：任何人
 * 每次改 Code 後要「管理部署 → 編輯 → 新版本」
 * 賽季：專案時區 Asia/Hong_Kong，然後喺編輯器執行一次 installSeasonSettlementTrigger。
 * 結算會先寫「賽季結算」快照，再把獎勵加落 F／G／J，最後先將 rankScore 歸零並提高 leaderboardEpoch。
 *
 * 存檔 JSON 可含大廳頭像：
 * - avatarId：預設獸短 id（英數底線，最長 40）
 * - avatarData：data:image/(jpeg|jpg|png|webp);base64,... 最長 70000 字；唔符合就清成空字串
 * 唔接受外鏈。試算表儲存格約 5 萬字，客戶端會再壓細，唔好存未壓縮原圖。
 * 年級排行榜會公開回傳已清洗嘅 avatarId／avatarData（冇就空字串），方便榜上顯示頭像。唔回傳密碼。
 */
var SPREADSHEET_ID = '1O5b2ogfhia5Yso-5QY9c4eYtvDwu3WpYgUrxBoMjJY8';
var OVERVIEW = '學生總覽';
var LOG = '戰鬥紀錄';
var ACCOUNTS = '帳戶';
var SEASON_LOG = '賽季結算';
var SEASON_STATE = '賽季狀態';

// 與 index.html 賽季常數保持同步。
// 2026-10-26 00:00 Asia/Hong_Kong（無夏令）= 2026-10-25 16:00 UTC。
// epoch = 1 + floor((now - start) / 21 days)。開始當下係第 1 賽季。
var SEASON_LENGTH_DAYS = 21;
var SEASON_START_UTC_MS = Date.UTC(2026, 9, 25, 16, 0, 0, 0);
var SEASON_MS = SEASON_LENGTH_DAYS * 24 * 60 * 60 * 1000;
// 對照而家排位：勝一場 +300 金幣、+2 EXP 包，積分 +100／300／600／1200。
// 21 日先派一次，頭名大約等於 10 場排位金幣 + 20 場 EXP，再加一隻限定怪獸。
var SEASON_REWARD_GOLD = [0, 3000, 1800, 1800, 800, 800, 800, 800, 800, 800, 800];
var SEASON_REWARD_EXP = [0, 40, 20, 20, 0, 0, 0, 0, 0, 0, 0];
var SEASON_REWARD_MONSTER_ID = 'season_kirin';
var DUPLICATE_MONSTER_EXP = 5;
var SEASON_GRADES = ['G1', 'G2', 'G3', 'G4', 'G5', 'G6'];
var COL_MONSTER = 10;
var COL_PAID_EPOCHS = 11;

function doGet() {
  return jsonOut({
    ok: true,
    service: 'math-monster-bridge',
    features: ['report', 'account-sync', 'pending-grants', 'leaderboard', 'playerStats', 'season', 'lobby-avatar', 'leaderboard-avatar'],
    season: seasonPublicInfo_(new Date())
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
    if (action === 'settleSeason') return settleSeasonAdmin(data);
    if (action === 'seasonPreview') return seasonPreviewAdmin(data);
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

/** Ensure A–I headers exist (idempotent; extends past G without wiping data). */
function ensureAccountHeaders(sheet) {
  if (!sheet) return;
  var headers = ['帳戶鍵', '密碼雜湊', '顯示名', '存檔JSON', '最後更新', '加金幣', '加EXP包', '班別', '班號', '加怪獸', '已結算賽季'];
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

/** Write profile.className / classNo into columns H / I. */
function writeClassColumns(sheet, row, profile) {
  if (!sheet || row < 1) return;
  var p = profile && typeof profile === 'object' ? profile : {};
  var klass = p.className != null ? p.className : (p.class != null ? p.class : '');
  var classNo = p.classNo != null ? p.classNo : '';
  sheet.getRange(row, 8).setValue(klass);
  sheet.getRange(row, 9).setValue(classNo);
}

function findAccountRow(sheet, key) {
  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(key)) return i + 1;
  }
  return -1;
}

/**
 * 大廳自訂頭像。只收 data:image/(jpeg|jpg|png|webp);base64, ；過長或唔係字串就清走。
 * 外鏈、script、其他 mime 一律變空字串（明確清除，唔留壞資料）。
 */
function sanitizeAvatarDataValue(value) {
  if (typeof value !== 'string' || !value) return '';
  if (value.length > 70000 || value.length < 32) return '';
  if (!/^data:image\/(jpeg|jpg|png|webp);base64,/.test(value)) return '';
  var comma = value.indexOf(',');
  var payload = value.slice(comma + 1);
  if (!payload || !/^[A-Za-z0-9+/]+={0,2}$/.test(payload)) return '';
  var padAt = payload.indexOf('=');
  if (padAt >= 0 && !/=+$/.test(payload.slice(padAt))) return '';
  return value;
}

/** 預設獸短 id。空字串＝冇預設；其他怪字元就清走。 */
function sanitizeAvatarIdValue(id) {
  if (typeof id !== 'string') return '';
  if (!id) return '';
  if (!/^[A-Za-z0-9_]{1,40}$/.test(id)) return '';
  return id;
}

/** 有 avatarData／avatarId 先正規化，避免舊存檔被加空欄。 */
function sanitizeProfileAvatarFields(profile) {
  if (!profile || typeof profile !== 'object') return profile;
  if (Object.prototype.hasOwnProperty.call(profile, 'avatarData')) {
    profile.avatarData = sanitizeAvatarDataValue(profile.avatarData);
  }
  if (Object.prototype.hasOwnProperty.call(profile, 'avatarId')) {
    profile.avatarId = sanitizeAvatarIdValue(profile.avatarId);
  }
  return profile;
}

function parseNonNegInt(v) {
  if (v === null || v === undefined || v === '') return 0;
  var n = Number(v);
  if (!isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

/**
 * Read F/G/J pending grants, add into profile.
 * J 係怪獸 id（可逗號多於一隻）。已擁有 → 用抽卡同一個重複獎勵（+DUPLICATE_MONSTER_EXP），唔再加一隻。
 * options.writeAlways: true → always write D+E (accountSave)；
 * false → 只喺有發放時先寫入同清待發放欄（accountLogin 零發放唔好改 updatedAt／重寫列）。
 * Returns { profile, grantedGold, grantedExp, grantedMonsters, convertedMonsters }.
 * grantedExp 包含「重複怪獸轉成嘅 EXP 包」，方便客戶端喺跟本機經濟時補加。
 */
function applyPendingGrants(sheet, row, profile, options) {
  options = options || {};
  var writeAlways = !!options.writeAlways;
  var p = profile && typeof profile === 'object' ? profile : {};
  sanitizeProfileAvatarFields(p);
  var addGold = parseNonNegInt(sheet.getRange(row, 6).getValue());
  var addExp = parseNonNegInt(sheet.getRange(row, 7).getValue());
  var monsterRaw = String(sheet.getRange(row, COL_MONSTER).getValue() || '');
  var monsterIds = parseMonsterIdList_(monsterRaw);
  var hasMonster = monsterIds.length > 0;
  // 拒收 dataURL／超長字串，避免有人把圖片貼入待發放欄。
  var dropBadMonster = !hasMonster && (monsterRaw.indexOf('data:') >= 0 || monsterRaw.length > 80);
  var hasEconomy = addGold > 0 || addExp > 0;
  var hasGrants = hasEconomy || hasMonster || dropBadMonster;

  // allow zero base (new users); treat missing as 0
  var gold;
  var packs;
  if (p.gold == null || p.gold === '') gold = 0;
  else gold = Math.max(0, Math.floor(Number(p.gold) || 0));
  if (p.expPacks == null || p.expPacks === '') packs = 0;
  else packs = Math.max(0, Math.floor(Number(p.expPacks) || 0));

  if (addGold > 0) gold += addGold;
  if (addExp > 0) packs += addExp;

  if (!Array.isArray(p.ownedMonsters)) p.ownedMonsters = [];
  var grantedMonsters = [];
  var convertedMonsters = [];
  monsterIds.forEach(function (id) {
    if (profileOwnsMonster_(p, id)) {
      packs += DUPLICATE_MONSTER_EXP;
      convertedMonsters.push(id);
    } else {
      p.ownedMonsters.push({ id: id, level: 1, exp: 0 });
      grantedMonsters.push(id);
    }
  });

  p.gold = gold;
  p.expPacks = packs;

  // 只喺真正發放時先 bump updatedAt；零發放 login 唔好令舊金幣看起來「較新」
  if (hasGrants) {
    p.updatedAt = new Date().toISOString();
  }

  if (writeAlways || hasGrants) {
    sheet.getRange(row, 4).setValue(JSON.stringify(p));
    sheet.getRange(row, 5).setValue(nowHK());
    writeClassColumns(sheet, row, p);
    if (hasEconomy) {
      sheet.getRange(row, 6).setValue('');
      sheet.getRange(row, 7).setValue('');
    }
    if (hasMonster || dropBadMonster) sheet.getRange(row, COL_MONSTER).setValue('');
  }

  return {
    profile: p,
    grantedGold: addGold,
    grantedExp: addExp + convertedMonsters.length * DUPLICATE_MONSTER_EXP,
    grantedMonsters: grantedMonsters,
    convertedMonsters: convertedMonsters
  };
}

function accountRegister(data) {
  return accountRegisterUnlocked_(data);
}

function accountRegisterUnlocked_(data) {
  var key = String(data.key || '').trim();
  var password = String(data.password || '');
  var profile = data.profile || {};
  if (!key || !password) return jsonOut({ ok: false, error: 'missing_key_or_password' });
  if (!profile || typeof profile !== 'object') profile = {};
  sanitizeProfileAvatarFields(profile);

  // 新戶若客戶端仲寫住舊賽季編號、又未有積分，直接加入而家進行中嘅賽季。
  var currentEp = seasonEpochAt_(new Date());
  if (currentEp < 1) currentEp = 1;
  var incomingEp = Math.floor(Number(profile.leaderboardEpoch) || 0);
  var incomingRank = Math.max(0, Math.floor(Number(profile.rankScore) || 0));
  if (incomingRank <= 0 && incomingEp < currentEp) profile.leaderboardEpoch = currentEp;

  var sheet = accountsSheet();
  if (findAccountRow(sheet, key) > 0) return jsonOut({ ok: false, error: 'exists' });

  var hash = sha256(password);
  var json = JSON.stringify(profile);
  // A–K：新戶 F/G/J/K 留空；H/I 寫班別／班號
  sheet.appendRow([
    key,
    hash,
    profile.displayName || profile.alias || key,
    json,
    nowHK(),
    '',
    '',
    profile.className != null ? profile.className : (profile.class || ''),
    profile.classNo != null ? profile.classNo : '',
    '',
    ''
  ]);
  return jsonOut({ ok: true, action: 'register', profile: profile });
}

function accountLogin(data) {
  return accountLoginUnlocked_(data);
}

function accountLoginUnlocked_(data) {
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

  // 零發放唔重寫列／唔 bump updatedAt（避免蓋掉學生勝利金幣）
  var applied = applyPendingGrants(sheet, row, profile, { writeAlways: false });
  return jsonOut({
    ok: true,
    action: 'login',
    profile: applied.profile,
    grantedGold: applied.grantedGold,
    grantedExp: applied.grantedExp,
    grantedMonsters: applied.grantedMonsters || [],
    convertedMonsters: applied.convertedMonsters || []
  });
}

function accountSave(data) {
  return accountSaveUnlocked_(data);
}

function accountSaveUnlocked_(data) {
  var key = String(data.key || '').trim();
  var password = String(data.password || '');
  var profile = data.profile || {};
  if (!key || !password) return jsonOut({ ok: false, error: 'missing_key_or_password' });
  sanitizeProfileAvatarFields(profile);

  var sheet = accountsSheet();
  var row = findAccountRow(sheet, key);
  if (row < 0) return jsonOut({ ok: false, error: 'not_found' });

  var hash = String(sheet.getRange(row, 2).getValue());
  if (hash !== sha256(password)) return jsonOut({ ok: false, error: 'bad_password' });

  var storedJson = String(sheet.getRange(row, 4).getValue() || '{}');
  var stored = {};
  try { stored = JSON.parse(storedJson); } catch (e2) { stored = {}; }
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) stored = {};
  // 雲端賽季編號較高＝已結算歸零，唔好被舊客戶端積分蓋返。
  // 同賽季積分只升唔跌。已發放嘅怪獸若客戶端存檔未有，保留雲端嗰隻。
  profile = reconcileSavedProfile_(stored, profile);

  sheet.getRange(row, 3).setValue(profile.displayName || profile.alias || profile.nickname || key);

  // 確保有 updatedAt（客戶端合併用）
  if (!profile.updatedAt) profile.updatedAt = new Date().toISOString();

  // 套用老師待發放後一律寫入學生送來嘅存檔（writeAlways）；H/I 亦由 applyPendingGrants 寫
  var applied = applyPendingGrants(sheet, row, profile, { writeAlways: true });
  // 再保險：即使 grants 路徑未觸發，亦寫入班別／班號
  writeClassColumns(sheet, row, applied.profile);
  return jsonOut({
    ok: true,
    action: 'save',
    profile: applied.profile,
    grantedGold: applied.grantedGold,
    grantedExp: applied.grantedExp,
    grantedMonsters: applied.grantedMonsters || [],
    convertedMonsters: applied.convertedMonsters || []
  });
}

function progressReport(data) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var now = nowHK();
  var school = data.school || '';
  var klass = data.className || data.class || '';
  var classNo = data.classNo != null ? data.classNo : '';
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

  // 戰鬥紀錄：時間,學校,班別,班號,暱稱,模式,年級,單元,結果,答對,金幣變化
  ss.getSheetByName(LOG).appendRow([
    now, school, klass, classNo, name, mode, grade, unit, result, correct, goldDelta
  ]);

  var ov = ss.getSheetByName(OVERVIEW);
  var values = ov.getDataRange().getValues();
  // 匹配：學校+班別+暱稱（B,C,E；舊列 D 班號可能空）
  var key = [school, klass, name].join('|');
  var found = -1;
  for (var i = 1; i < values.length; i++) {
    var nickCol = values[i][4]; // E 暱稱（欄位移後）
    // 若 E 空而 D 有字，可能係未移位嘅舊列（D=暱稱）
    if (nickCol === '' || nickCol == null) nickCol = values[i][3];
    var rowKey = [values[i][1], values[i][2], nickCol].join('|');
    if (rowKey === key) { found = i + 1; break; }
  }
  // 學生總覽：最後更新,學校,班別,班號,暱稱,金幣,積分,EXP包,怪獸數,最近單元,最近結果,答對題數,累計答題
  var row = [now, school, klass, classNo, name, gold, score, expPacks, monsters, unit, result, correct, totalQ];
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

/**
 * 由帳戶 D 欄 JSON 抽出公開榜資料（唔回傳密碼雜湊）。
 * avatarId／avatarData 經同一套清洗：外鏈、壞 data URL、非法 id 變空字串。
 */
function publicEntryFromProfile(displayName, profileJson, updatedAtCell) {
  var p = {};
  try { p = JSON.parse(String(profileJson || '{}')); } catch (e) { p = {}; }
  if (!p || typeof p !== 'object' || Array.isArray(p)) p = {};
  var nickname = String(p.nickname || p.displayName || p.alias || displayName || '').trim();
  if (!nickname) nickname = String(displayName || '冒險者').trim() || '冒險者';
  var avatarId = '';
  var avatarData = '';
  if (Object.prototype.hasOwnProperty.call(p, 'avatarId')) {
    avatarId = sanitizeAvatarIdValue(p.avatarId);
  }
  if (Object.prototype.hasOwnProperty.call(p, 'avatarData')) {
    avatarData = sanitizeAvatarDataValue(p.avatarData);
  }
  return {
    nickname: nickname,
    school: String(p.school || ''),
    className: String(p.className || p.class || ''),
    classNo: p.classNo != null ? p.classNo : '',
    rankScore: Math.max(0, Math.floor(Number(p.rankScore) || 0)),
    updatedAt: String(p.updatedAt || updatedAtCell || ''),
    grade: parseGradeFromClass(p.className || p.class || ''),
    avatarId: avatarId,
    avatarData: avatarData
  };
}

/**
 * 全服／年級排行榜（公開讀：暱稱／班／積分／已清洗大廳頭像）
 * POST { action:'leaderboard', grade:'G6' }  // grade 可選；空＝全部
 * 排序仍然只睇積分，同分先用暱稱。頭像唔參與排名。
 */
function leaderboardList(data) {
  var gradeFilter = String((data && data.grade) || '').trim().toUpperCase();
  var sheet = accountsSheet();
  var values = sheet.getDataRange().getValues();
  var list = [];
  for (var i = 1; i < values.length; i++) {
    var key = String(values[i][0] || '').trim();
    if (!key) continue;
    var profileObj = {};
    try { profileObj = JSON.parse(String(values[i][3] || '{}')); } catch (e) { profileObj = {}; }
    // 老師／管理員帳唔上學生排位榜（例：mr to、yin）
    if (isAdminProfile(profileObj, key)) continue;
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
    entries: list,
    season: seasonPublicInfo_(new Date())
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
    withRankScore: withRankScore,
    season: seasonPublicInfo_(new Date())
  });
}

function seasonEpochAt_(now) {
  var t = now instanceof Date ? now.getTime() : Number(now);
  if (!isFinite(t)) t = Date.now();
  return 1 + Math.floor((t - SEASON_START_UTC_MS) / SEASON_MS);
}

function seasonBoundsForEpoch_(epoch) {
  var ep = Math.floor(Number(epoch) || 1);
  var start = SEASON_START_UTC_MS + (ep - 1) * SEASON_MS;
  return { epoch: ep, startMs: start, endMs: start + SEASON_MS };
}

function seasonPublicInfo_(now) {
  var n = now instanceof Date ? now : new Date();
  var epoch = seasonEpochAt_(n);
  var shown = epoch < 1 ? 1 : epoch;
  var bounds = seasonBoundsForEpoch_(shown);
  return {
    epoch: epoch,
    displayEpoch: shown,
    lengthDays: SEASON_LENGTH_DAYS,
    startMs: bounds.startMs,
    endMs: bounds.endMs,
    serverNowMs: n.getTime(),
    monsterId: SEASON_REWARD_MONSTER_ID,
    duplicateExp: DUPLICATE_MONSTER_EXP,
    goldByRank: SEASON_REWARD_GOLD.slice(1),
    expByRank: SEASON_REWARD_EXP.slice(1)
  };
}

function rewardForRank_(rank) {
  var r = Math.floor(Number(rank) || 0);
  if (r < 1 || r > 10) return { gold: 0, exp: 0, monsterId: '' };
  return {
    gold: SEASON_REWARD_GOLD[r] || 0,
    exp: SEASON_REWARD_EXP[r] || 0,
    // 頭 10 名均獲賽季限定怪獸（已擁有由客戶端／發放邏輯轉 EXP 包）
    monsterId: SEASON_REWARD_MONSTER_ID
  };
}

/** 舊存檔 leaderboardEpoch 0／空＝第 1 賽季（2026-10-26 起）。 */
function effectiveScoreEpoch_(profile) {
  var ep = Math.floor(Number(profile && profile.leaderboardEpoch) || 0);
  if (ep < 1) return 1;
  return ep;
}

function isSafeMonsterId_(id) {
  var s = String(id || '').trim();
  if (!s || s.length > 40) return false;
  if (s.indexOf('data:') === 0) return false;
  return /^[A-Za-z][A-Za-z0-9_\-]*$/.test(s);
}

function parseMonsterIdList_(raw) {
  var text = String(raw == null ? '' : raw);
  if (text.indexOf('data:') >= 0) return [];
  var parts = text.split(/[,，\s]+/);
  var out = [];
  var seen = {};
  parts.forEach(function (part) {
    var id = String(part || '').trim();
    if (!isSafeMonsterId_(id) || seen[id]) return;
    seen[id] = true;
    out.push(id);
  });
  return out;
}

function appendMonsterId_(current, id) {
  var cur = String(current == null ? '' : current);
  if (!isSafeMonsterId_(id)) return cur;
  var parts = parseMonsterIdList_(cur);
  if (parts.indexOf(id) === -1) parts.push(id);
  return parts.join(',');
}

function parseEpochList_(raw) {
  var out = {};
  String(raw == null ? '' : raw).split(/[,，\s]+/).forEach(function (part) {
    var n = Math.floor(Number(part));
    if (isFinite(n) && n > 0) out[n] = true;
  });
  return out;
}

function formatEpochList_(map) {
  return Object.keys(map || {}).map(function (k) { return Number(k); }).filter(function (n) {
    return isFinite(n) && n > 0;
  }).sort(function (a, b) { return a - b; }).join(',');
}

function profileOwnsMonster_(profile, id) {
  var list = profile && Array.isArray(profile.ownedMonsters) ? profile.ownedMonsters : [];
  for (var i = 0; i < list.length; i++) {
    if (list[i] && String(list[i].id) === String(id)) return true;
  }
  return false;
}

function mergeOwnedMonsterLists_(listA, listB) {
  var map = {};
  function take(list) {
    (Array.isArray(list) ? list : []).forEach(function (m) {
      if (!m || m.id == null) return;
      var id = String(m.id);
      if (!isSafeMonsterId_(id)) return;
      var level = Math.max(1, Math.floor(Number(m.level) || 1));
      var exp = Math.max(0, Math.floor(Number(m.exp) || 0));
      var prev = map[id];
      if (!prev) {
        map[id] = { id: id, level: level, exp: exp };
        return;
      }
      var pl = Math.max(1, Math.floor(Number(prev.level) || 1));
      var pe = Math.max(0, Math.floor(Number(prev.exp) || 0));
      if (level > pl || (level === pl && exp > pe)) {
        map[id] = { id: id, level: level, exp: exp };
      }
    });
  }
  take(listA);
  take(listB);
  return Object.keys(map).map(function (k) { return map[k]; });
}

/**
 * 儲存時保護賽季重置：雲端 epoch 較高就跟雲端積分。
 * 同一個 epoch 積分取較大（只升唔跌）。怪獸聯集，避免舊客戶端蓋走已發放嘅限定怪。
 */
function reconcileSavedProfile_(stored, incoming) {
  var next = incoming && typeof incoming === 'object' && !Array.isArray(incoming) ? incoming : {};
  var base = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
  var sEp = Math.max(0, Math.floor(Number(base.leaderboardEpoch) || 0));
  var iEp = Math.max(0, Math.floor(Number(next.leaderboardEpoch) || 0));
  var sRank = Math.max(0, Math.floor(Number(base.rankScore) || 0));
  var iRank = Math.max(0, Math.floor(Number(next.rankScore) || 0));
  if (sEp > iEp) {
    next.rankScore = sRank;
    next.leaderboardEpoch = sEp;
  } else if (iEp === sEp) {
    next.rankScore = Math.max(sRank, iRank);
    next.leaderboardEpoch = sEp;
  }
  next.ownedMonsters = mergeOwnedMonsterLists_(base.ownedMonsters, next.ownedMonsters);
  return next;
}

/**
 * 把賽季獎勵加到待發放欄。K 已有呢個賽季就唔再加（重跑安全）。
 * 金幣／EXP 係加落現有 F／G，唔會清走老師未發放嘅數。
 */
function applySeasonRewardToCells_(goldCell, expCell, monsterCell, paidCell, reward, epoch) {
  var paid = parseEpochList_(paidCell);
  var ep = Math.floor(Number(epoch) || 0);
  var prize = reward || {};
  if (ep > 0 && paid[ep]) {
    return {
      applied: false,
      gold: goldCell,
      exp: expCell,
      monster: String(monsterCell == null ? '' : monsterCell),
      paid: formatEpochList_(paid)
    };
  }
  var gold = parseNonNegInt(goldCell) + Math.max(0, Math.floor(Number(prize.gold) || 0));
  var exp = parseNonNegInt(expCell) + Math.max(0, Math.floor(Number(prize.exp) || 0));
  if (ep > 0) paid[ep] = true;
  return {
    applied: true,
    gold: gold > 0 ? gold : '',
    exp: exp > 0 ? exp : '',
    monster: appendMonsterId_(monsterCell, prize.monsterId),
    paid: formatEpochList_(paid)
  };
}

function compareNickname_(a, b) {
  var as = String(a || '');
  var bs = String(b || '');
  try {
    return as.localeCompare(bs, 'zh');
  } catch (e) {
    if (as < bs) return -1;
    if (as > bs) return 1;
    return 0;
  }
}

/** 各年級積分 > 0 嘅頭 10。同分用暱稱升序（同排行榜）。 */
function rankGradeTop10_(players) {
  var byGrade = {};
  SEASON_GRADES.forEach(function (g) { byGrade[g] = []; });
  (Array.isArray(players) ? players : []).forEach(function (p) {
    if (!p || !(p.rankScore > 0)) return;
    var g = byGrade[p.grade] ? p.grade : 'G6';
    byGrade[g].push(p);
  });
  var winners = [];
  SEASON_GRADES.forEach(function (g) {
    var list = byGrade[g].slice().sort(function (a, b) {
      if (b.rankScore !== a.rankScore) return b.rankScore - a.rankScore;
      return compareNickname_(a.nickname, b.nickname);
    });
    if (list.length > 10) list = list.slice(0, 10);
    list.forEach(function (p, idx) {
      var rank = idx + 1;
      winners.push({
        key: p.key,
        grade: g,
        rank: rank,
        nickname: p.nickname,
        school: p.school || '',
        className: p.className || '',
        classNo: p.classNo != null ? p.classNo : '',
        rankScore: p.rankScore,
        reward: rewardForRank_(rank)
      });
    });
  });
  return winners;
}

function ensureSheet_(name, headers) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  var range = sh.getRange(1, 1, 1, headers.length);
  var current = range.getValues()[0];
  var need = false;
  for (var i = 0; i < headers.length; i++) {
    if (String(current[i] || '') !== headers[i]) {
      need = true;
      break;
    }
  }
  if (need) range.setValues([headers]);
  try {
    if (sh.getFrozenRows() < 1) sh.setFrozenRows(1);
  } catch (e) { /* ignore */ }
  return sh;
}

function seasonLogHeaders_() {
  return ['結算時間', '賽季', '年級', '名次', '帳戶鍵', '暱稱', '學校', '班別', '班號', '積分', '金幣獎勵', 'EXP獎勵', '怪獸id', '發放狀態'];
}

function seasonStateHeaders_() {
  return ['賽季', '結算時間', '結算後所屬賽季', '新發獎人數', '重置帳戶數', '上榜人數', '備註'];
}

function loadSettledEpochMap_() {
  var sh = ensureSheet_(SEASON_STATE, seasonStateHeaders_());
  var values = sh.getDataRange().getValues();
  var map = {};
  for (var i = 1; i < values.length; i++) {
    var ep = Math.floor(Number(values[i][0]) || 0);
    if (ep > 0) map[ep] = true;
  }
  return { sheet: sh, map: map };
}

function readEpochSnapshot_(epoch) {
  var sh = ensureSheet_(SEASON_LOG, seasonLogHeaders_());
  var values = sh.getDataRange().getValues();
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    if (Math.floor(Number(values[i][1]) || 0) !== epoch) continue;
    var key = String(values[i][4] || '').trim();
    if (!key) continue;
    rows.push({
      sheetRow: i + 1,
      key: key,
      grade: String(values[i][2] || ''),
      rank: Math.floor(Number(values[i][3]) || 0),
      nickname: String(values[i][5] || ''),
      school: String(values[i][6] || ''),
      className: String(values[i][7] || ''),
      classNo: values[i][8],
      rankScore: Math.max(0, Math.floor(Number(values[i][9]) || 0)),
      gold: parseNonNegInt(values[i][10]),
      exp: parseNonNegInt(values[i][11]),
      monsterId: String(values[i][12] || '').trim(),
      status: String(values[i][13] || '')
    });
  }
  return { sheet: sh, values: values, rows: rows };
}

function readAccountTable_() {
  var sheet = accountsSheet();
  var values = sheet.getDataRange().getValues();
  var list = [];
  for (var i = 1; i < values.length; i++) {
    var key = String(values[i][0] || '').trim();
    if (!key) continue;
    while (values[i].length < 11) values[i].push('');
    var profile = {};
    try { profile = JSON.parse(String(values[i][3] || '{}')); } catch (e) { profile = {}; }
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) profile = {};
    var entry = publicEntryFromProfile(values[i][2], JSON.stringify(profile), values[i][4]);
    list.push({
      rowIndex: i,
      row: i + 1,
      key: key,
      nickname: entry.nickname,
      school: entry.school,
      className: entry.className,
      classNo: entry.classNo,
      rankScore: entry.rankScore,
      grade: entry.grade,
      profile: profile
    });
  }
  return { sheet: sheet, values: values, list: list };
}

/**
 * 寫入前再讀該列，只改積分／賽季編號同待發放欄，避免結算用舊快照蓋走剛剛儲存嘅金幣或怪獸。
 */
function patchAccountForSettlement_(sheet, rowNumber, epoch, rewardOrNull) {
  var row = sheet.getRange(rowNumber, 1, 1, COL_PAID_EPOCHS).getValues()[0];
  var profile = {};
  try { profile = JSON.parse(String(row[3] || '{}')); } catch (e) { profile = {}; }
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) profile = {};

  var granted = false;
  if (rewardOrNull) {
    var applied = applySeasonRewardToCells_(row[5], row[6], row[9], row[10], rewardOrNull, epoch);
    if (applied.applied) {
      row[5] = applied.gold;
      row[6] = applied.exp;
      row[9] = applied.monster;
      row[10] = applied.paid;
      granted = true;
    }
  }

  var reset = false;
  if (effectiveScoreEpoch_(profile) <= epoch) {
    profile.rankScore = 0;
    profile.leaderboardEpoch = epoch + 1;
    row[3] = JSON.stringify(profile);
    reset = true;
  }

  if (granted) {
    sheet.getRange(rowNumber, 6, 1, 2).setValues([[row[5], row[6]]]);
    sheet.getRange(rowNumber, COL_MONSTER, 1, 2).setValues([[row[9], row[10]]]);
  }
  if (reset) sheet.getRange(rowNumber, 4).setValue(row[3]);
  return { granted: granted, reset: reset };
}

function winnersFromSnapshot_(rows) {
  return (rows || []).map(function (r) {
    var monsterId = isSafeMonsterId_(r.monsterId) ? r.monsterId : '';
    return {
      key: r.key,
      grade: r.grade,
      rank: r.rank,
      nickname: r.nickname,
      school: r.school,
      className: r.className,
      classNo: r.classNo,
      rankScore: r.rankScore,
      reward: { gold: r.gold, exp: r.exp, monsterId: monsterId }
    };
  });
}

/**
 * 結算一個已完結賽季。呼叫方要持有 script lock。
 * 1) 若未有快照：按各年級頭 10 寫入「賽季結算」（之後重跑跟呢份快照，唔會因歸零而換人）
 * 2) 獎勵加落 F／G／J，並喺 K 記低賽季（已記過就跳過）
 * 3) 仍屬於呢個賽季（或更早）嘅帳戶：rankScore=0、leaderboardEpoch=epoch+1
 * 4) 最後先喺「賽季狀態」標記完成
 */
function settleOneEpochUnlocked_(epoch, now) {
  var ep = Math.floor(Number(epoch) || 0);
  var stamp = nowHK();
  var table = readAccountTable_();
  var snap = readEpochSnapshot_(ep);
  var winners;
  if (snap.rows.length) {
    winners = winnersFromSnapshot_(snap.rows);
  } else {
    var eligibleForRank = table.list.filter(function (p) {
      if (isAdminProfile(p.profile, p.key)) return false;
      return effectiveScoreEpoch_(p.profile) <= ep;
    });
    var computed = rankGradeTop10_(eligibleForRank);
    if (computed.length) {
      var logRows = computed.map(function (w) {
        return [
          stamp,
          ep,
          w.grade,
          w.rank,
          w.key,
          w.nickname,
          w.school,
          w.className,
          w.classNo,
          w.rankScore,
          w.reward.gold,
          w.reward.exp,
          w.reward.monsterId || '',
          '已快照'
        ];
      });
      var start = snap.sheet.getLastRow() + 1;
      snap.sheet.getRange(start, 1, logRows.length, logRows[0].length).setValues(logRows);
    }
    winners = computed;
  }

  var granted = 0;
  var resetCount = 0;
  var byGrade = {};
  SEASON_GRADES.forEach(function (g) { byGrade[g] = 0; });
  var winnerByKey = {};
  winners.forEach(function (w) {
    if (byGrade[w.grade] != null) byGrade[w.grade] += 1;
    else byGrade[w.grade] = 1;
    winnerByKey[w.key] = w;
  });

  table.list.forEach(function (p) {
    var w = winnerByKey[p.key] || null;
    var needsReset = effectiveScoreEpoch_(p.profile) <= ep;
    if (!w && !needsReset) return;
    var patched = patchAccountForSettlement_(table.sheet, p.row, ep, w ? w.reward : null);
    if (patched.granted) granted++;
    if (patched.reset) resetCount++;
  });

  if (snap.rows.length || winners.length) {
    var fresh = readEpochSnapshot_(ep);
    if (fresh.values.length > 1) {
      var statusCol = [];
      for (var s = 1; s < fresh.values.length; s++) {
        var status = fresh.values[s][13];
        if (Math.floor(Number(fresh.values[s][1]) || 0) === ep) status = '已入帳';
        statusCol.push([status]);
      }
      if (statusCol.length) fresh.sheet.getRange(2, 14, statusCol.length, 1).setValues(statusCol);
    }
  }

  var state = loadSettledEpochMap_();
  if (!state.map[ep]) {
    state.sheet.appendRow([ep, stamp, ep + 1, granted, resetCount, winners.length, 'ok']);
  }

  return {
    epoch: ep,
    granted: granted,
    resetAccounts: resetCount,
    winnerCount: winners.length,
    byGrade: byGrade
  };
}

function settleDueSeasonsUnlocked_(now) {
  var n = now instanceof Date ? now : new Date();
  var current = seasonEpochAt_(n);
  var info = seasonPublicInfo_(n);
  if (current <= 1) {
    return {
      ok: true,
      action: 'settleSeason',
      settled: false,
      reason: 'season_in_progress',
      currentEpoch: current,
      season: info,
      results: []
    };
  }

  var state = loadSettledEpochMap_();
  var results = [];
  for (var guard = 0; guard < 24; guard++) {
    var next = null;
    for (var e = 1; e < current; e++) {
      if (!state.map[e]) {
        next = e;
        break;
      }
    }
    if (next === null) break;
    var one = settleOneEpochUnlocked_(next, n);
    state.map[next] = true;
    results.push(one);
  }

  return {
    ok: true,
    action: 'settleSeason',
    settled: results.length > 0,
    reason: results.length ? 'settled' : 'already_settled',
    currentEpoch: current,
    season: info,
    results: results
  };
}

function settleSeasonAdmin(data) {
  var auth = authenticateAccount(data && data.key, data && data.password);
  if (!auth) return jsonOut({ ok: false, error: 'auth_failed' });
  if (!isAdminProfile(auth.profile, data.key)) return jsonOut({ ok: false, error: 'forbidden' });
  var lock = LockService.getScriptLock();
  var got = false;
  try { got = lock.tryLock(30000); } catch (err) { got = false; }
  if (!got) return jsonOut({ ok: false, error: 'busy' });
  try {
    return jsonOut(settleDueSeasonsUnlocked_(new Date()));
  } finally {
    lock.releaseLock();
  }
}

function seasonPreviewAdmin(data) {
  var auth = authenticateAccount(data && data.key, data && data.password);
  if (!auth) return jsonOut({ ok: false, error: 'auth_failed' });
  if (!isAdminProfile(auth.profile, data.key)) return jsonOut({ ok: false, error: 'forbidden' });
  return seasonPreviewUnlocked_(data);
}

function seasonPreviewUnlocked_(data) {
    var now = new Date();
    var current = seasonEpochAt_(now);
    var previewEpoch = current < 1 ? 1 : current;
    var table = readAccountTable_();
    var pool = table.list.filter(function (p) {
      return effectiveScoreEpoch_(p.profile) <= previewEpoch;
    });
    var winners = rankGradeTop10_(pool);
    var grades = {};
    SEASON_GRADES.forEach(function (g) { grades[g] = []; });
    winners.forEach(function (w) {
      if (!grades[w.grade]) grades[w.grade] = [];
      grades[w.grade].push({
        rank: w.rank,
        nickname: w.nickname,
        school: w.school,
        className: w.className,
        classNo: w.classNo,
        rankScore: w.rankScore,
        gold: w.reward.gold,
        exp: w.reward.exp,
        monsterId: w.reward.monsterId || ''
      });
    });
  return jsonOut({
    ok: true,
    action: 'seasonPreview',
    currentEpoch: current,
    previewEpoch: previewEpoch,
    season: seasonPublicInfo_(now),
    grades: grades
  });
}

/** 編輯器手動執行一次：每小時檢查，過咗季先結算。專案時區請設 Asia/Hong_Kong。 */
function installSeasonSettlementTrigger() {
  removeSeasonSettlementTrigger();
  ScriptApp.newTrigger('settleSeasonTrigger').timeBased().everyHours(1).create();
}

function removeSeasonSettlementTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'settleSeasonTrigger') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
}

function settleSeasonTrigger() {
  var lock = LockService.getScriptLock();
  var got = false;
  try {
    got = lock.tryLock(30000);
  } catch (err) {
    got = false;
  }
  if (!got) return;
  try {
    settleDueSeasonsUnlocked_(new Date());
  } finally {
    lock.releaseLock();
  }
}
