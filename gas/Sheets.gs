// =============================================================================
// Sheets.gs — データベース基盤レイヤー
// スプレッドシートへのアクセス、キャッシュ、汎用ヘルパーなど
// 他の Sheets_*.gs から呼び出される共通関数・定数を定義する
// =============================================================================

// ── シート名定数 ─────────────────────────────────────────────
var SHEET_DEPARTMENTS  = 'departments';
var SHEET_USERS        = 'users';
var SHEET_REPORTS      = 'telework_reports';
var SHEET_APPROVALS    = 'approvals';
var SHEET_TASK_REPORTS = 'task_reports';

// ── スプレッドシートアクセス ──────────────────────────────────

// スプレッドシートオブジェクトを返す（Code.gs の SPREADSHEET_ID を使用）
function getSpreadsheet() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

// 指定シート名のシートオブジェクトを返す
function getSheet(name) {
  return getSpreadsheet().getSheetByName(name);
}

// ── 初期セットアップ ──────────────────────────────────────────

// 全シートを作成しシードデータを投入する（初回のみ実行）
function setupSheets() {
  var ss = getSpreadsheet();
  _createSheet(ss, SHEET_DEPARTMENTS,  ['id','name','parent_department','created_at']);
  _createSheet(ss, SHEET_USERS,        ['id','email','password_hash','name','role','department_id','is_active','created_at','updated_at','mattermost_username']);
  _createSheet(ss, SHEET_REPORTS,      ['id','employee_id','report_type','start_date','end_date','request_date','week_title','work_type','day_short','notes','redmine_tasks','status','created_at','updated_at']);
  _createSheet(ss, SHEET_APPROVALS,    ['id','report_id','approver_id','level','decision','comment','decided_at','created_at']);
  _createSheet(ss, SHEET_TASK_REPORTS, ['id','employee_id','report_date','day_short','important_issues','next_day_plan','redmine_tasks','status','created_at','updated_at']);
  _seedData(ss);
  Logger.log('セットアップ完了');
}

// シートが存在しない場合のみ作成し、ヘッダー行を設定する
function _createSheet(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length)
         .setValues([headers])
         .setFontWeight('bold');
    Logger.log('シート作成: ' + name);
  }
}

// ── 初期シードデータ ──────────────────────────────────────────

// 部署・管理者ユーザーのサンプルデータを投入する（初回のみ）
function _seedData(ss) {
  var dSheet = ss.getSheetByName(SHEET_DEPARTMENTS);
  if (dSheet.getLastRow() > 1) return; // 既にデータあり

  // 親部署を先に作成
  var parentDept1 = { id: _uuid(), name: 'エンジニアリング部門', parent_department: '', created_at: _now() };
  var parentDept2 = { id: _uuid(), name: '管理部門',             parent_department: '', created_at: _now() };

  var depts = [
    parentDept1,
    parentDept2,
    { id: _uuid(), name: 'エンジニアリング第1チーム', parent_department: parentDept1.id, created_at: _now() },
    { id: _uuid(), name: 'UI/UXデザイン',             parent_department: parentDept1.id, created_at: _now() },
    { id: _uuid(), name: 'システムエンジニア',         parent_department: parentDept1.id, created_at: _now() },
    { id: _uuid(), name: '人事部',                     parent_department: parentDept2.id, created_at: _now() },
  ];
  depts.forEach(function(d) { _appendRow(SHEET_DEPARTMENTS, d, DEPT_H); });

  // ⚠ 実際の管理者メールアドレスに変更してください
  _appendRow(SHEET_USERS, {
    id:            'mits-user-1',
    email:         'admin@yourdomain.com',
    password_hash: 'GWS_AUTH_ONLY',
    name:          '管理者',
    role:          'admin',
    department_id: '',
    is_active:     true,
    created_at:    _now(),
    updated_at:    _now(),
    mattermost_username: '',
  }, USER_H);
}

// ── 日付ヘルパー ──────────────────────────────────────────────

// Sheets が Date オブジェクトに変換した値を YYYY-MM-DD 文字列に戻す
var _DATE_COLS = ['start_date','end_date','request_date','decided_at','report_date'];

function _dateStr(val) {
  if (val instanceof Date) {
    return val.getFullYear() + '-' +
      String(val.getMonth() + 1).padStart(2, '0') + '-' +
      String(val.getDate()).padStart(2, '0');
  }
  return String(val);
}

// ── スプレッドシート CRUD ─────────────────────────────────────

// シートの全データをオブジェクト配列に変換する
function _sheetToObjects(sheet) {
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var headers = data[0];
  var result = [];
  for (var i = 1; i < data.length; i++) {
    var obj = {};
    headers.forEach(function(h, idx) {
      var val = data[i][idx];
      // 日付カラムを文字列に変換
      if (_DATE_COLS.indexOf(h) !== -1 && val instanceof Date) {
        val = _dateStr(val);
      }
      obj[h] = val;
    });
    result.push(obj);
  }
  return result;
}

// シートの末尾に新しい行を追加する
function _appendRow(sheetName, obj, headers) {
  var sheet = getSheet(sheetName);
  var row = headers.map(function(h) { return obj[h] !== undefined ? obj[h] : ''; });
  sheet.appendRow(row);
}

// id で行を検索して指定フィールドを更新する
function _updateRow(sheetName, id, updates, headers) {
  var sheet = getSheet(sheetName);
  var data  = sheet.getDataRange().getValues();
  var idCol = headers.indexOf('id');
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][idCol]) === String(id)) {
      for (var key in updates) {
        var col = headers.indexOf(key);
        if (col !== -1) {
          sheet.getRange(i + 1, col + 1).setValue(updates[key]);
        }
      }
      return true;
    }
  }
  return false;
}

// 複数行をまとめて更新する（バッチ処理）
function _updateRowsBatch(sheetName, idUpdatePairs, headers) {
  var sheet = getSheet(sheetName);
  var data  = sheet.getDataRange().getValues();
  var idCol = headers.indexOf('id');
  var updateMap = {};
  idUpdatePairs.forEach(function(pair) { updateMap[pair.id] = pair.updates; });

  for (var i = 1; i < data.length; i++) {
    var rowId = String(data[i][idCol]);
    if (updateMap[rowId]) {
      for (var key in updateMap[rowId]) {
        var col = headers.indexOf(key);
        if (col !== -1) {
          sheet.getRange(i + 1, col + 1).setValue(updateMap[rowId][key]);
        }
      }
    }
  }
}

// id で行を検索して削除する
function _deleteRowById(sheetName, id) {
  var sheet = getSheet(sheetName);
  var data  = sheet.getDataRange().getValues();
  if (data.length === 0) return false;
  var idCol = data[0].indexOf('id');
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][idCol]) === String(id)) {
      sheet.deleteRow(i + 1);
      return true;
    }
  }
  return false;
}

// UUID を生成する
function _uuid() {
  return Utilities.getUuid();
}

// ユーザーIDを生成する（mits-user-1, mits-user-2, ... の形式）
function _generateUserId() {
  var users = _sheetToObjects(getSheet(SHEET_USERS));
  
  // ユーザーが存在しない場合は mits-user-1 から開始
  if (users.length === 0) {
    return 'mits-user-1';
  }
  
  // 既存のユーザーIDから最大の番号を取得
  var maxNumber = 0;
  users.forEach(function(user) {
    if (user.id && typeof user.id === 'string' && user.id.startsWith('mits-user-')) {
      var numStr = user.id.replace('mits-user-', '');
      var num = parseInt(numStr, 10);
      if (!isNaN(num) && num > maxNumber) {
        maxNumber = num;
      }
    }
  });
  
  // 次の番号を生成
  return 'mits-user-' + (maxNumber + 1);
}

// 現在日時を ISO 8601 形式で返す
function _now() {
  return new Date().toISOString();
}

// 日付文字列から「第N週」形式の週タイトルを計算する（日曜始まり）
function _getWeekTitle(dateStr) {
  var date = new Date(dateStr);
  var startOfYear = new Date(date.getFullYear(), 0, 1);

  // 年初の最初の日曜日を求める
  var firstSunday = new Date(startOfYear);
  var dayOfWeek = startOfYear.getDay();
  if (dayOfWeek !== 0) {
    firstSunday.setDate(startOfYear.getDate() + (7 - dayOfWeek));
  }

  if (date < firstSunday) return '第1週';

  var daysSinceFirstSunday = Math.floor((date - firstSunday) / (24 * 60 * 60 * 1000));
  var weekNumber = Math.floor(daysSinceFirstSunday / 7) + 1;
  return '第' + weekNumber + '週';
}

// ── キャッシュレイヤー ────────────────────────────────────────
// スクリプトキャッシュで頻繁にアクセスするシートデータを保持し
// Sheets への API 呼び出しを削減する（TTL: 翌日0時まで）

// 次の0時（午前0時）までの秒数を計算する
function _getSecondsUntilMidnight() {
  var now = new Date();
  var tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  var diff = tomorrow.getTime() - now.getTime();
  var seconds = Math.floor(diff / 1000);
  // GAS CacheServiceの最大TTLは21600秒(6時間)なので、それを超える場合は制限
  return Math.min(seconds, 21600);
}

var CACHE_KEY_DEPARTMENTS  = 'sheet_departments';
var CACHE_KEY_USERS        = 'sheet_users';
var CACHE_KEY_REPORTS      = 'sheet_reports';
var CACHE_KEY_APPROVALS    = 'sheet_approvals';
var CACHE_KEY_TASK_REPORTS = 'sheet_task_reports';

// キャッシュからデータを取得する（未キャッシュなら loader() を呼んで格納）
function _getCachedData(cacheKey, loader) {
  var cache = CacheService.getScriptCache();
  var cached = cache.get(cacheKey);
  if (cached) {
    try {
      var parsed = JSON.parse(cached);
      Logger.log('キャッシュヒット: ' + cacheKey + ' (' + parsed.length + '件)');
      return parsed;
    } catch (e) {
      Logger.log('キャッシュ解析エラー: ' + e.toString());
    }
  }

  Logger.log('キャッシュミス: ' + cacheKey);
  var data = loader();

  try {
    var json = JSON.stringify(data);
    if (json.length < 100000) {
      var ttl = _getSecondsUntilMidnight();
      cache.put(cacheKey, json, ttl);
      Logger.log('キャッシュ保存: ' + cacheKey + ' (TTL: ' + ttl + '秒 / 翌日0時まで)');
    } else {
      Logger.log('データが大きすぎてキャッシュ不可: ' + json.length + ' bytes');
    }
  } catch (e) {
    Logger.log('キャッシュ保存エラー: ' + e.toString());
  }

  return data;
}

// 指定キーのキャッシュを無効化する
function _invalidateCache(cacheKey) {
  CacheService.getScriptCache().remove(cacheKey);
  Logger.log('キャッシュ削除: ' + cacheKey);
  _clearAllLookupMaps();
}

// メモリ上のルックアップマップをクリアする（キャッシュ破棄時に呼ぶ）
function _clearAllLookupMaps() {
  _userByIdMap    = null;
  _userByEmailMap = null;
  _deptByIdMap    = null;
  _approvalsByReportMap = null;
}

// 全キャッシュ・ルックアップマップを一括クリアする
function invalidateAllCaches() {
  var cache = CacheService.getScriptCache();
  cache.removeAll([
    CACHE_KEY_DEPARTMENTS,
    CACHE_KEY_USERS,
    CACHE_KEY_REPORTS,
    CACHE_KEY_APPROVALS,
    CACHE_KEY_TASK_REPORTS,
  ]);
  _clearAllLookupMaps();
  Logger.log('全キャッシュをクリアしました');
}

// ── O(1) ルックアップマップ ──────────────────────────────────
// ユーザー・部署をマップに展開し、ID/メールからの高速検索を実現する

var _userByIdMap    = null;
var _userByEmailMap = null;
var _deptByIdMap    = null;
var _approvalsByReportMap = null;

// ユーザーマップを構築する（キャッシュ済みなら再構築しない）
function _buildUserMaps() {
  if (_userByIdMap !== null) return;
  var users = getAllUsers();
  _userByIdMap    = {};
  _userByEmailMap = {};
  users.forEach(function(u) {
    _userByIdMap[u.id]             = u;
    _userByEmailMap[u.email.toLowerCase()] = u;
  });
  Logger.log('ユーザーマップ構築: ' + users.length + '件');
}

// 部署マップを構築する
function _buildDeptMap() {
  if (_deptByIdMap !== null) return;
  var depts = getAllDepartments();
  _deptByIdMap = {};
  depts.forEach(function(d) { _deptByIdMap[d.id] = d; });
  Logger.log('部署マップ構築: ' + depts.length + '件');
}

// 承認マップを構築する（報告書ID → 承認配列）
function _buildApprovalMap() {
  if (_approvalsByReportMap !== null) return _approvalsByReportMap;
  var approvals = getAllApprovals();
  _approvalsByReportMap = {};
  approvals.forEach(function(a) {
    if (!_approvalsByReportMap[a.report_id]) {
      _approvalsByReportMap[a.report_id] = [];
    }
    _approvalsByReportMap[a.report_id].push(a);
  });
  Logger.log('承認マップ構築: ' + approvals.length + '件');
  return _approvalsByReportMap;
}

// ID でユーザーを O(1) で取得する
function getUserByIdFast(id) {
  _buildUserMaps();
  return _userByIdMap[id] || null;
}

// メールアドレスでユーザーを O(1) で取得する
function getUserByEmailFast(email) {
  _buildUserMaps();
  return _userByEmailMap[(email || '').toLowerCase()] || null;
}

// ID で部署を O(1) で取得する
function getDepartmentByIdFast(id) {
  _buildDeptMap();
  return _deptByIdMap[id] || null;
}

// 報告書 ID に紐づく承認レコードを O(1) で取得する
function getApprovalsByReportFast(reportId) {
  _buildApprovalMap();
  return _approvalsByReportMap[reportId] || [];
}

// 承認マップを無効化する（承認データ変更後に呼ぶ）
function _invalidateApprovalMap() {
  _approvalsByReportMap = null;
}

// ── 排他ロック（同時書き込み防止） ───────────────────────────

var LOCK_TIMEOUT_MS = 30000; // 30 秒

// LockService を使って排他制御しながら関数を実行する
function _withLock(lockName, fn) {
  var lock = LockService.getScriptLock();
  try {
    var acquired = lock.tryLock(LOCK_TIMEOUT_MS);
    if (!acquired) {
      Logger.log('ロック取得失敗: ' + lockName);
      return { error: 'サーバーが混み合っています。しばらく待ってから再試行してください。' };
    }
    Logger.log('ロック取得: ' + lockName);
    return fn();
  } catch (e) {
    Logger.log('ロック処理エラー ' + lockName + ': ' + e.toString());
    throw e;
  } finally {
    try {
      lock.releaseLock();
      Logger.log('ロック解放: ' + lockName);
    } catch (e) {
      Logger.log('ロック解放警告: ' + e.toString());
    }
  }
}

// 二重送信チェック（draft/rejected 以外の同一レコードが存在しないか確認）
function _checkDuplicateSubmission(sheetName, criteria, headers, excludeStatuses) {
  excludeStatuses = excludeStatuses || ['draft', 'rejected'];
  var sheet = getSheet(sheetName);
  var data  = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    var row     = data[i];
    var matches = true;
    var status  = null;

    for (var key in criteria) {
      var colIdx = headers.indexOf(key);
      if (colIdx === -1) continue;
      var cellValue = row[colIdx];
      if (cellValue instanceof Date) cellValue = _dateStr(cellValue);
      if (String(cellValue) !== String(criteria[key])) { matches = false; break; }
    }

    if (matches) {
      var statusCol = headers.indexOf('status');
      if (statusCol !== -1) {
        status = String(row[statusCol]);
        if (excludeStatuses.indexOf(status) !== -1) continue;
      }
      // 重複レコードを返す
      var record = {};
      headers.forEach(function(h, idx) { record[h] = row[idx]; });
      return record;
    }
  }
  return null;
}

// ── ページネーション・日付範囲フィルタ ───────────────────────

var DEFAULT_MONTHS_BACK = 1; // デフォルト遡り月数

// 日付範囲で在宅勤務申請をフィルタリングする
function getReportsInDateRange(startDate, endDate, employeeId) {
  if (!endDate)   endDate   = _dateStr(new Date());
  if (!startDate) {
    var d = new Date();
    d.setMonth(d.getMonth() - DEFAULT_MONTHS_BACK);
    startDate = _dateStr(d);
  }
  var startTime = new Date(startDate).getTime();
  var endTime   = new Date(endDate).getTime() + 86400000;

  return getAllReports().filter(function(r) {
    var reportDate = new Date(r.start_date).getTime();
    if (reportDate < startTime || reportDate > endTime) return false;
    if (employeeId && r.employee_id !== employeeId)     return false;
    return true;
  });
}

// 日付範囲で日報をフィルタリングする
function getTaskReportsInDateRange(startDate, endDate, employeeId) {
  if (!endDate)   endDate   = _dateStr(new Date());
  if (!startDate) {
    var d = new Date();
    d.setMonth(d.getMonth() - DEFAULT_MONTHS_BACK);
    startDate = _dateStr(d);
  }
  var startTime = new Date(startDate).getTime();
  var endTime   = new Date(endDate).getTime() + 86400000;

  return getAllTaskReports().filter(function(r) {
    var reportDate = new Date(r.report_date).getTime();
    if (reportDate < startTime || reportDate > endTime) return false;
    if (employeeId && r.employee_id !== employeeId)     return false;
    return true;
  });
}

// データ配列をページネーションして返す
function _paginate(data, page, pageSize) {
  page     = page     || 1;
  pageSize = pageSize || 50;
  var totalItems = data.length;
  var totalPages = Math.ceil(totalItems / pageSize);
  var startIdx   = (page - 1) * pageSize;
  return {
    items:      data.slice(startIdx, startIdx + pageSize),
    page:       page,
    pageSize:   pageSize,
    totalPages: totalPages,
    totalItems: totalItems,
    hasMore:    page < totalPages,
  };
}

// ── キャッシュ性能テスト（GASエディタから実行） ──────────────
function testCachingPerformance() {
  invalidateAllCaches();
  var start1 = new Date();
  var users1 = getAllUsers();
  var time1  = new Date() - start1;
  Logger.log('初回（キャッシュミス）: ' + time1 + 'ms, ' + users1.length + '件');

  var start2 = new Date();
  var users2 = getAllUsers();
  var time2  = new Date() - start2;
  Logger.log('2回目（キャッシュヒット）: ' + time2 + 'ms, ' + users2.length + '件');

  if (users1.length > 0) {
    var start3 = new Date();
    getUserByIdFast(users1[0].id);
    Logger.log('getUserByIdFast (O(1)): ' + (new Date() - start3) + 'ms');
  }
  Logger.log('速度改善: ' + Math.round((1 - time2 / time1) * 100) + '%');
  return { firstCall: time1, secondCall: time2 };
}
