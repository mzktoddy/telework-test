// Export data with explicit headers to a NEW spreadsheet file in a specific Drive folder
function adminExportToNewSpreadsheet(headers, dataRows, sheetTitle) {
  var user = getCurrentUser();
  if (!user || user.role !== 'admin') return { error: 'Unauthorized' };
  if (!dataRows || dataRows.length === 0) return { error: 'データがありません' };
  if (!headers || headers.length === 0) return { error: 'ヘッダーがありません' };

  // Folder ID for マミヤITソリューションズ/Exported (user provided)
  var folderId = '1Fbl8fcqqAXLIqWQ7UybXD8sGMU3elz6r';

  var name = sheetTitle || ('エクスポート_' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd_HH-mm'));
  var ss = SpreadsheetApp.create(name);

  // Move to target folder in one call (avoids addFile + removeFile roundtrip)
  DriveApp.getFileById(ss.getId()).moveTo(DriveApp.getFolderById(folderId));

  var sheet = ss.getActiveSheet();

  // Write header + data in two range calls (no clear() needed on fresh sheet)
  sheet.getRange(1, 1, 1, headers.length)
       .setValues([headers])
       .setFontWeight('bold')
       .setBackground('#1e293b')
       .setFontColor('#ffffff');

  if (dataRows.length > 0) {
    sheet.getRange(2, 1, dataRows.length, headers.length).setValues(dataRows);
  }
  // No flush() — GAS batches writes automatically; getUrl() doesn't require it

  return { success: true, url: ss.getUrl(), fileId: ss.getId(), fileName: name };
}

/**
 * Optimized export function - does all processing server-side
 * @param {Object} options - Filter options (startDate, endDate, status, weekSundayKey, employeeName, reportType)
 * @returns {Object} { success, url, fileId, fileName }
 */
function adminExportFiltered(options) {
  var user = getCurrentUser();
  if (!user || user.role !== 'admin') return { error: 'Unauthorized' };
  
  options = options || {};
  var reportType = options.reportType || 'telework';
  
  // Fetch and filter data server-side (same logic as paginated functions)
  var reports, users, depts;
  
  if (reportType === 'telework') {
    reports = getReportsInDateRange(options.startDate, options.endDate, options.employeeId);
    users = getAllUsers();
    depts = getAllDepartments();
    
    var userMap = {};
    users.forEach(function(u) { userMap[u.id] = u; });
    var deptMap = {};
    depts.forEach(function(d) { deptMap[d.id] = d; });
    
    // Apply request_date boundary filter
    if (options.startDate || options.endDate) {
      var reqStart = options.startDate ? new Date(options.startDate) : null;
      var reqEnd   = options.endDate   ? new Date(options.endDate)   : null;
      if (reqEnd) reqEnd.setHours(23, 59, 59, 999);
      reports = reports.filter(function(r) {
        if (!r.request_date) return true;
        var reqDate = new Date(r.request_date);
        if (reqStart && reqDate < reqStart) return false;
        if (reqEnd   && reqDate > reqEnd)   return false;
        return true;
      });
    }
    
    // Status filter
    if (options.status) {
      reports = reports.filter(function(r) { return r.status === options.status; });
    }
    
    // Week filter
    if (options.weekSundayKey) {
      var weekSunday = new Date(options.weekSundayKey);
      var weekSaturday = new Date(weekSunday);
      weekSaturday.setDate(weekSunday.getDate() + 6);
      weekSaturday.setHours(23, 59, 59, 999);
      
      reports = reports.filter(function(r) {
        if (!r.request_date) return false;
        var requestDate = new Date(r.request_date);
        return requestDate >= weekSunday && requestDate <= weekSaturday;
      });
    }
    
    // Map with user/dept info
    var mapped = reports.map(function (r) {
      var emp = userMap[r.employee_id] || null;
      var dept = (emp && emp.department_id) ? deptMap[emp.department_id] : null;
      return {
        week_title:    r.week_title   || '',
        employee_name: emp  ? emp.name  : '不明',
        employee_name_lower: emp ? emp.name.toLowerCase() : '',
        department:    dept ? dept.name : '未設定',
        work_type:     r.work_type    || '',
        request_date:  r.request_date || '',
        day_short:     r.day_short    || '',
        status:        r.status       || '',
        notes:         r.notes        || '',
        created_at:    r.created_at   || '',
      };
    });
    
    // Employee name filter
    if (options.employeeName && options.employeeName.trim()) {
      var searchTerm = options.employeeName.trim().toLowerCase();
      mapped = mapped.filter(function(r) {
        return r.employee_name_lower.indexOf(searchTerm) !== -1;
      });
    }
    
    // Sort by request_date descending
    mapped.sort(function(a, b) {
      return new Date(b.request_date).getTime() - new Date(a.request_date).getTime();
    });
    
    if (mapped.length === 0) {
      return { error: 'エクスポートする対象がありません' };
    }
    
    // Status label map
    var statusMap = {
      approved: '承認済み',
      submitted: '申請中',
      draft: '未作成',
      rejected: '差戻し',
      reviewed: '照査済',
    };
    
    // Build export data
    var now = new Date();
    var stamp = now.getFullYear() +
      ('0' + (now.getMonth() + 1)).slice(-2) +
      ('0' + now.getDate()).slice(-2) + '_' +
      ('0' + now.getHours()).slice(-2) +
      ('0' + now.getMinutes()).slice(-2);
    
    var title = '在宅勤務申請_' + stamp;
    var headers = ['週', '従業員名', '部署', '勤務種別', '対象日', '曜日', 'ステータス', '作業予定内容', '作成日時'];
    var dataRows = mapped.map(function(r) {
      return [
        r.week_title,
        r.employee_name,
        r.department,
        r.work_type,
        r.request_date,
        r.day_short,
        statusMap[r.status] || r.status || '',
        r.notes,
        r.created_at
      ];
    });
    
    return adminExportToNewSpreadsheet(headers, dataRows, title);
    
  } else {
    // Task reports
    reports = getTaskReportsInDateRange(options.startDate, options.endDate, options.employeeId);
    users = getAllUsers();
    depts = getAllDepartments();
    
    var userMap = {};
    users.forEach(function(u) { userMap[u.id] = u; });
    var deptMap = {};
    depts.forEach(function(d) { deptMap[d.id] = d; });
    
    // Status filter
    if (options.status) {
      reports = reports.filter(function(r) { return r.status === options.status; });
    }
    
    // Week filter
    if (options.weekSundayKey) {
      var weekSunday = new Date(options.weekSundayKey);
      var weekSaturday = new Date(weekSunday);
      weekSaturday.setDate(weekSunday.getDate() + 6);
      weekSaturday.setHours(23, 59, 59, 999);
      
      reports = reports.filter(function(r) {
        if (!r.report_date) return false;
        var reportDate = new Date(r.report_date);
        return reportDate >= weekSunday && reportDate <= weekSaturday;
      });
    }
    
    // Map with user/dept info
    var mapped = reports.map(function (r) {
      var emp = userMap[r.employee_id] || null;
      var dept = (emp && emp.department_id) ? deptMap[emp.department_id] : null;
      return {
        employee_name: emp  ? emp.name  : '不明',
        employee_name_lower: emp ? emp.name.toLowerCase() : '',
        department:    dept ? dept.name : '未設定',
        report_date:   r.report_date   || '',
        day_short:     r.day_short     || '',
        status:        r.status        || '',
        important_issues: r.important_issues || '',
        next_day_plan:    r.next_day_plan    || '',
        created_at:    r.created_at    || '',
      };
    });
    
    // Employee name filter
    if (options.employeeName && options.employeeName.trim()) {
      var searchTerm = options.employeeName.trim().toLowerCase();
      mapped = mapped.filter(function(r) {
        return r.employee_name_lower.indexOf(searchTerm) !== -1;
      });
    }
    
    // Sort by report_date descending
    mapped.sort(function(a, b) {
      return new Date(b.report_date).getTime() - new Date(a.report_date).getTime();
    });
    
    if (mapped.length === 0) {
      return { error: 'エクスポートする対象がありません' };
    }
    
    // Status label map
    var statusMap = {
      approved: '承認済み',
      submitted: '申請中',
      draft: '未作成',
      rejected: '差戻し',
      reviewed: '照査済',
    };
    
    // Build export data
    var now = new Date();
    var stamp = now.getFullYear() +
      ('0' + (now.getMonth() + 1)).slice(-2) +
      ('0' + now.getDate()).slice(-2) + '_' +
      ('0' + now.getHours()).slice(-2) +
      ('0' + now.getMinutes()).slice(-2);
    
    var title = '日報報告_' + stamp;
    var headers = ['従業員名', '部署', '対象日', '曜日', 'ステータス', '作業報告', '翌日の計画', '作成日時'];
    var dataRows = mapped.map(function(r) {
      return [
        r.employee_name,
        r.department,
        r.report_date,
        r.day_short,
        statusMap[r.status] || r.status || '',
        r.important_issues,
        r.next_day_plan,
        r.created_at
      ];
    });
    
    return adminExportToNewSpreadsheet(headers, dataRows, title);
  }
}

// ============================================================
//  Sheets.gs — Google Sheets data layer
//
//  Sheet structure mirrors the Drizzle SQLite schema exactly:
//    departments      → id, name, parent_department, created_at
//    users            → id, email, password_hash, name, role,
//                       department_id, is_active, created_at, updated_at
//    telework_reports → id, employee_id, report_type, start_date,
//                       end_date, tasks, status, created_at, updated_at
//    approvals        → id, report_id, approver_id, level,
//                       decision, comment, decided_at, created_at
//
//  STEP 2: After setting SPREADSHEET_ID in Code.gs,
//          run setupSheets() once from the GAS editor to create
//          all sheets with the correct headers and seed data.
// ============================================================

var SHEET_DEPARTMENTS = 'departments';
var SHEET_USERS       = 'users';
var SHEET_REPORTS     = 'telework_reports';
var SHEET_APPROVALS   = 'approvals';
var SHEET_TASK_REPORTS = 'task_reports';

// ── Sheet access ─────────────────────────────────────────────
function getSpreadsheet() {
  if (!SPREADSHEET_ID) throw new Error('SPREADSHEET_ID が Code.gs に設定されていません');
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function getSheet(name) {
  var s = getSpreadsheet().getSheetByName(name);
  if (!s) throw new Error('シート "' + name + '" が見つかりません。setupSheets() を先に実行してください');
  return s;
}

// ── Setup (run once) ─────────────────────────────────────────
function setupSheets() {
  var ss = getSpreadsheet();
  _createSheet(ss, SHEET_DEPARTMENTS, ['id','name','parent_department','created_at']);
  _createSheet(ss, SHEET_USERS,       ['id','email','password_hash','name','role','department_id','is_active','created_at','updated_at']);
  _createSheet(ss, SHEET_REPORTS,     ['id','employee_id','report_type','start_date','end_date','request_date','week_title','work_type','day_short','notes','redmine_tasks','status','created_at','updated_at']);
  _createSheet(ss, SHEET_APPROVALS,   ['id','report_id','approver_id','level','decision','comment','decided_at','created_at']);
  _createSheet(ss, SHEET_TASK_REPORTS, ['id','employee_id','report_date','day_short','important_issues','next_day_plan','redmine_tasks','status','created_at','updated_at']);
  _seedData(ss);
  return '✅ セットアップ完了';
}

function _createSheet(ss, name, headers) {
  if (ss.getSheetByName(name)) return;
  var sheet = ss.insertSheet(name);
  var hRange = sheet.getRange(1, 1, 1, headers.length);
  hRange.setValues([headers])
        .setFontWeight('bold')
        .setBackground('#1e293b')
        .setFontColor('#ffffff');
  sheet.setFrozenRows(1);
  SpreadsheetApp.flush();
}

// ── Generic helpers ──────────────────────────────────────────
// Columns that hold YYYY-MM-DD date values (not datetime)
var _DATE_COLS = ['start_date', 'end_date', 'request_date', 'decided_at', 'report_date'];

// Convert a value (possibly a Date object from Sheets) to YYYY-MM-DD string
function _dateStr(val) {
  if (val instanceof Date) {
    return val.getFullYear() + '-' +
      String(val.getMonth() + 1).padStart(2, '0') + '-' +
      String(val.getDate()).padStart(2, '0');
  }
  return String(val);
}

function _sheetToObjects(sheet) {
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  var headers = data[0].map(String);
  return data.slice(1).map(function (row) {
    var o = {};
    headers.forEach(function (h, i) {
      var val = row[i];
      // Google Sheets auto-converts date strings to Date objects — normalize back
      if (val instanceof Date) {
        val = (_DATE_COLS.indexOf(h) >= 0) ? _dateStr(val) : val.toISOString();
      }
      o[h] = val;
    });
    return o;
  });
}

function _appendRow(sheetName, obj, headers) {
  getSheet(sheetName).appendRow(headers.map(function (h) {
    return obj[h] !== undefined ? obj[h] : '';
  }));
}

/**
 * Batch update row - uses single setValues() call instead of multiple setValue()
 * @param {string} sheetName - Sheet name
 * @param {string} id - Row ID to update
 * @param {Object} updates - Key-value pairs to update
 * @param {Array} headers - Column headers array
 * @returns {boolean} True if row was updated
 */
function _updateRow(sheetName, id, updates, headers) {
  var sheet = getSheet(sheetName);
  var data  = sheet.getDataRange().getValues();
  var idCol = headers.indexOf('id');
  
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][idCol]) === String(id)) {
      // Build new row data by applying updates to existing row
      var newRow = data[i].slice(); // Clone the row
      headers.forEach(function (h, c) {
        if (updates[h] !== undefined) {
          newRow[c] = updates[h];
        }
      });
      // Single batch write instead of multiple setValue calls
      sheet.getRange(i + 1, 1, 1, headers.length).setValues([newRow]);
      return true;
    }
  }
  return false;
}

/**
 * Batch update multiple rows at once - for bulk operations
 * @param {string} sheetName - Sheet name
 * @param {Array} updates - Array of {id: string, data: Object} to update
 * @param {Array} headers - Column headers array
 * @returns {number} Count of rows updated
 */
function _updateRowsBatch(sheetName, updates, headers) {
  if (!updates || updates.length === 0) return 0;
  
  var sheet = getSheet(sheetName);
  var data  = sheet.getDataRange().getValues();
  var idCol = headers.indexOf('id');
  
  // Build a map of id -> row index for O(1) lookups
  var idToRow = {};
  for (var i = 1; i < data.length; i++) {
    idToRow[String(data[i][idCol])] = i;
  }
  
  var updated = 0;
  updates.forEach(function(upd) {
    var rowIdx = idToRow[String(upd.id)];
    if (rowIdx !== undefined) {
      headers.forEach(function(h, c) {
        if (upd.data[h] !== undefined) {
          data[rowIdx][c] = upd.data[h];
        }
      });
      updated++;
    }
  });
  
  // Write all data back in single call if any updates were made
  if (updated > 0) {
    sheet.getRange(1, 1, data.length, headers.length).setValues(data);
  }
  
  return updated;
}

function _uuid()  { return Utilities.getUuid(); }
// Returns current timestamp in Japan Standard Time (JST/Asia/Tokyo) in ISO 8601 format
function _now()   { 
  var now = new Date();
  // Format as ISO 8601 with JST timezone offset (+09:00)
  return Utilities.formatDate(now, 'Asia/Tokyo', "yyyy-MM-dd'T'HH:mm:ss'+09:00'");
}

// ══════════════════════════════════════════════════════════════
//  PERFORMANCE OPTIMIZATION: Caching Layer
//  - 5-minute cache TTL for frequently accessed data
//  - O(1) lookup maps for users and departments
//  - Cache invalidation on data changes
// ══════════════════════════════════════════════════════════════

var CACHE_TTL = 300; // 5 minutes in seconds

// Cache keys
var CACHE_KEY_USERS       = 'cache_all_users';
var CACHE_KEY_DEPARTMENTS = 'cache_all_departments';
var CACHE_KEY_REPORTS     = 'cache_all_reports';
var CACHE_KEY_TASK_REPORTS = 'cache_all_task_reports';
var CACHE_KEY_APPROVALS   = 'cache_all_approvals';

/**
 * Generic caching helper - retrieves from cache or fetches fresh data
 * @param {string} cacheKey - Unique cache key
 * @param {Function} fetchFunction - Function to call if cache miss
 * @param {number} ttl - Time-to-live in seconds (default: CACHE_TTL)
 * @returns {Array|Object} Cached or fresh data
 */
function _getCachedData(cacheKey, fetchFunction, ttl) {
  ttl = ttl || CACHE_TTL;
  var cache = CacheService.getScriptCache();
  
  try {
    var cached = cache.get(cacheKey);
    if (cached) {
      Logger.log('Cache HIT: ' + cacheKey);
      return JSON.parse(cached);
    }
  } catch (e) {
    Logger.log('Cache parse error for ' + cacheKey + ': ' + e.toString());
  }
  
  Logger.log('Cache MISS: ' + cacheKey + ' - fetching fresh data');
  var data = fetchFunction();
  
  // Cache only if data is small enough (< 100KB - CacheService limit per key)
  try {
    var jsonStr = JSON.stringify(data);
    if (jsonStr.length < 100000) {
      cache.put(cacheKey, jsonStr, ttl);
      Logger.log('Cached ' + cacheKey + ' (' + jsonStr.length + ' bytes)');
    } else {
      Logger.log('Data too large to cache: ' + cacheKey + ' (' + jsonStr.length + ' bytes)');
    }
  } catch (e) {
    Logger.log('Cache put error for ' + cacheKey + ': ' + e.toString());
  }
  
  return data;
}

/**
 * Invalidate specific cache keys
 * @param {string|Array} keys - Cache key(s) to invalidate
 */
function _invalidateCache(keys) {
  var cache = CacheService.getScriptCache();
  if (Array.isArray(keys)) {
    cache.removeAll(keys);
    Logger.log('Invalidated cache keys: ' + keys.join(', '));
  } else {
    cache.remove(keys);
    Logger.log('Invalidated cache key: ' + keys);
  }
  // Clear ALL lookup maps to ensure fresh data on next read
  _clearAllLookupMaps();
}

/**
 * Clear all in-memory lookup maps
 */
function _clearAllLookupMaps() {
  _userByIdMap = null;
  _userByEmailMap = null;
  _deptByIdMap = null;
  _approvalsByReportMap = null;
}

/**
 * Invalidate all data caches (call after bulk operations)
 */
function invalidateAllCaches() {
  _invalidateCache([
    CACHE_KEY_USERS,
    CACHE_KEY_DEPARTMENTS,
    CACHE_KEY_REPORTS,
    CACHE_KEY_TASK_REPORTS,
    CACHE_KEY_APPROVALS
  ]);
}

// ── Lookup Maps for O(1) Access ───────────────────────────────
var _userByIdMap = null;
var _userByEmailMap = null;
var _deptByIdMap = null;
var _approvalsByReportMap = null;

/**
 * Build user lookup maps from cached data
 */
function _buildUserMaps() {
  if (_userByIdMap !== null) return; // Already built
  
  var users = getAllUsers();
  _userByIdMap = {};
  _userByEmailMap = {};
  
  users.forEach(function(u) {
    _userByIdMap[u.id] = u;
    if (u.email) {
      _userByEmailMap[u.email.toLowerCase()] = u;
    }
  });
  
  Logger.log('Built user lookup maps: ' + users.length + ' users indexed');
}

/**
 * Build department lookup map from cached data
 */
function _buildDeptMap() {
  if (_deptByIdMap !== null) return; // Already built
  
  var depts = getAllDepartments();
  _deptByIdMap = {};
  
  depts.forEach(function(d) {
    _deptByIdMap[d.id] = d;
  });
  
  Logger.log('Built department lookup map: ' + depts.length + ' departments indexed');
}

/**
 * Get user by ID - O(1) lookup using map
 */
function getUserByIdFast(id) {
  _buildUserMaps();
  return _userByIdMap[id] || null;
}

/**
 * Get user by email - O(1) lookup using map
 */
function getUserByEmailFast(email) {
  if (!email) return null;
  _buildUserMaps();
  return _userByEmailMap[email.toLowerCase()] || null;
}

/**
 * Get department by ID - O(1) lookup using map
 */
function getDepartmentByIdFast(id) {
  _buildDeptMap();
  return _deptByIdMap[id] || null;
}

/**
 * Test caching performance - run from GAS editor
 */
function testCachingPerformance() {
  // Clear all caches first
  invalidateAllCaches();
  
  // First call - should be cache MISS
  var start1 = new Date();
  var users1 = getAllUsers();
  var time1 = new Date() - start1;
  Logger.log('First call (cache MISS): ' + time1 + 'ms, ' + users1.length + ' users');
  
  // Second call - should be cache HIT
  var start2 = new Date();
  var users2 = getAllUsers();
  var time2 = new Date() - start2;
  Logger.log('Second call (cache HIT): ' + time2 + 'ms, ' + users2.length + ' users');
  
  // Test fast lookup
  if (users1.length > 0) {
    var testUser = users1[0];
    var start3 = new Date();
    var found = getUserByIdFast(testUser.id);
    var time3 = new Date() - start3;
    Logger.log('getUserByIdFast (O(1) lookup): ' + time3 + 'ms, found: ' + (found ? found.name : 'null'));
  }
  
  Logger.log('═══════════════════════════════════════');
  Logger.log('Performance improvement: ' + Math.round((1 - time2/time1) * 100) + '% faster on cache hit');
  
  return { firstCall: time1, secondCall: time2, improvement: Math.round((1 - time2/time1) * 100) + '%' };
}

// ══════════════════════════════════════════════════════════════
//  PHASE 2: Approval Lookup Map for O(1) Access by Report ID
// ══════════════════════════════════════════════════════════════

/**
 * Build approval lookup map grouped by report_id for O(1) access
 * @returns {Object} Map of report_id -> array of approvals
 */
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
  
  Logger.log('Built approval lookup map: ' + approvals.length + ' approvals indexed');
  return _approvalsByReportMap;
}

/**
 * Get approvals by report ID - O(1) lookup using map
 * @param {string} reportId - Report ID
 * @returns {Array} Array of approvals for this report
 */
function getApprovalsByReportFast(reportId) {
  _buildApprovalMap();
  return _approvalsByReportMap[reportId] || [];
}

/**
 * Invalidate approval map (call after approval changes)
 */
function _invalidateApprovalMap() {
  _approvalsByReportMap = null;
}

// ══════════════════════════════════════════════════════════════
//  PHASE 3: Concurrent Access Protection (LockService)
//  - Prevents race conditions during concurrent writes
//  - 30-second lock timeout for safety
// ══════════════════════════════════════════════════════════════

var LOCK_TIMEOUT_MS = 30000; // 30 seconds

/**
 * Execute a function with exclusive lock protection
 * @param {string} lockName - Unique identifier for this lock scope
 * @param {Function} fn - Function to execute with lock
 * @returns {*} Return value of fn, or error object if lock fails
 */
function _withLock(lockName, fn) {
  var lock = LockService.getScriptLock();
  
  try {
    // Wait up to 30 seconds to acquire lock
    var acquired = lock.tryLock(LOCK_TIMEOUT_MS);
    if (!acquired) {
      Logger.log('Failed to acquire lock: ' + lockName);
      return { error: 'サーバーが混み合っています。しばらく待ってから再試行してください。' };
    }
    
    Logger.log('Lock acquired: ' + lockName);
    var result = fn();
    return result;
    
  } catch (e) {
    Logger.log('Error in locked operation ' + lockName + ': ' + e.toString());
    throw e;
  } finally {
    try {
      lock.releaseLock();
      Logger.log('Lock released: ' + lockName);
    } catch (e) {
      // Lock may already be released if timeout occurred
      Logger.log('Lock release warning: ' + e.toString());
    }
  }
}

/**
 * Check for duplicate submission (prevents double-submit)
 * @param {string} sheetName - Sheet to check
 * @param {Object} criteria - Key-value pairs to match
 * @param {Array} headers - Column headers
 * @param {Array} excludeStatuses - Statuses to exclude from duplicate check
 * @returns {Object|null} Existing record if duplicate found, null otherwise
 */
function _checkDuplicateSubmission(sheetName, criteria, headers, excludeStatuses) {
  excludeStatuses = excludeStatuses || ['draft', 'rejected'];
  var sheet = getSheet(sheetName);
  var data = sheet.getDataRange().getValues();
  
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var matches = true;
    var status = null;
    
    // Check all criteria match
    for (var key in criteria) {
      var colIdx = headers.indexOf(key);
      if (colIdx === -1) continue;
      
      var cellValue = row[colIdx];
      // Handle date columns
      if (cellValue instanceof Date) {
        cellValue = _dateStr(cellValue);
      }
      
      if (String(cellValue) !== String(criteria[key])) {
        matches = false;
        break;
      }
    }
    
    if (matches) {
      var statusCol = headers.indexOf('status');
      if (statusCol !== -1) {
        status = String(row[statusCol]);
        // If status is in exclude list, don't count as duplicate
        if (excludeStatuses.indexOf(status) !== -1) {
          continue;
        }
      }
      
      // Found a duplicate - return the record
      var record = {};
      headers.forEach(function(h, idx) {
        record[h] = row[idx];
      });
      return record;
    }
  }
  
  return null;
}

// ══════════════════════════════════════════════════════════════
//  PHASE 4: Data Volume Management
//  - Date-range filtering for reports (avoids loading entire history)
//  - Pagination for large datasets
// ══════════════════════════════════════════════════════════════

/**
 * Default date range - last 3 months for performance
 */
var DEFAULT_MONTHS_BACK = 1;

/**
 * Get reports within a date range (efficient for large datasets)
 * @param {string} startDate - Start date (YYYY-MM-DD) or null for 3 months ago
 * @param {string} endDate - End date (YYYY-MM-DD) or null for today
 * @param {string} employeeId - Optional employee ID filter
 * @returns {Array} Filtered reports
 */
function getReportsInDateRange(startDate, endDate, employeeId) {
  // Default to last 3 months if no date range specified
  if (!endDate) {
    endDate = _dateStr(new Date());
  }
  if (!startDate) {
    var d = new Date();
    d.setMonth(d.getMonth() - DEFAULT_MONTHS_BACK);
    startDate = _dateStr(d);
  }
  
  var startTime = new Date(startDate).getTime();
  var endTime = new Date(endDate).getTime() + 86400000; // Include end date
  
  var reports = getAllReports();
  
  return reports.filter(function(r) {
    // Filter by date range (use start_date of the report)
    var reportDate = new Date(r.start_date).getTime();
    if (reportDate < startTime || reportDate > endTime) return false;
    
    // Filter by employee if specified
    if (employeeId && r.employee_id !== employeeId) return false;
    
    return true;
  });
}

/**
 * Get task reports within a date range
 * @param {string} startDate - Start date (YYYY-MM-DD) or null for 3 months ago
 * @param {string} endDate - End date (YYYY-MM-DD) or null for today
 * @param {string} employeeId - Optional employee ID filter
 * @returns {Array} Filtered task reports
 */
function getTaskReportsInDateRange(startDate, endDate, employeeId) {
  // Default to last 3 months if no date range specified
  if (!endDate) {
    endDate = _dateStr(new Date());
  }
  if (!startDate) {
    var d = new Date();
    d.setMonth(d.getMonth() - DEFAULT_MONTHS_BACK);
    startDate = _dateStr(d);
  }
  
  var startTime = new Date(startDate).getTime();
  var endTime = new Date(endDate).getTime() + 86400000; // Include end date
  
  var reports = getAllTaskReports();
  
  return reports.filter(function(r) {
    // Filter by date range
    var reportDate = new Date(r.report_date).getTime();
    if (reportDate < startTime || reportDate > endTime) return false;
    
    // Filter by employee if specified
    if (employeeId && r.employee_id !== employeeId) return false;
    
    return true;
  });
}

/**
 * Get paginated data from an array
 * @param {Array} data - Full dataset
 * @param {number} page - Page number (1-indexed)
 * @param {number} pageSize - Items per page (default: 50)
 * @returns {Object} { items: Array, page: number, pageSize: number, totalPages: number, totalItems: number }
 */
function _paginate(data, page, pageSize) {
  page = page || 1;
  pageSize = pageSize || 50;
  
  var totalItems = data.length;
  var totalPages = Math.ceil(totalItems / pageSize);
  var startIdx = (page - 1) * pageSize;
  var items = data.slice(startIdx, startIdx + pageSize);
  
  return {
    items: items,
    page: page,
    pageSize: pageSize,
    totalPages: totalPages,
    totalItems: totalItems,
    hasMore: page < totalPages
  };
}

// Calculate week title like "第13週" (Sunday-based week)
function _getWeekTitle(dateStr) {
  var date = new Date(dateStr);
  var startOfYear = new Date(date.getFullYear(), 0, 1);
  
  // Find the first Sunday of the year
  var firstSunday = new Date(startOfYear);
  var dayOfWeek = startOfYear.getDay();
  if (dayOfWeek !== 0) {
    firstSunday.setDate(startOfYear.getDate() + (7 - dayOfWeek));
  }
  
  // If date is before first Sunday, it's week 1
  if (date < firstSunday) {
    return '第1週';
  }
  
  // Calculate week number from first Sunday
  var daysSinceFirstSunday = Math.floor((date - firstSunday) / (24 * 60 * 60 * 1000));
  var weekNumber = Math.floor(daysSinceFirstSunday / 7) + 1;
  
  return '第' + weekNumber + '週';
}

// ── Departments ──────────────────────────────────────────────
var DEPT_H = ['id','name','parent_department','created_at'];

function getAllDepartments() {
  return _getCachedData(CACHE_KEY_DEPARTMENTS, function() {
    return _sheetToObjects(getSheet(SHEET_DEPARTMENTS));
  });
}
function getDepartmentById(id) {
  return getDepartmentByIdFast(id);
}

// Filter department IDs to return only CHILD departments (exclude parent departments)
// A parent department is one where parent_department is empty/null
function getChildDepartmentsOnly(departmentIds) {
  if (!departmentIds || departmentIds.length === 0) return [];
  var allDepts = getAllDepartments();
  return departmentIds.filter(function(deptId) {
    var dept = allDepts.find(function(d) { return d.id === deptId; });
    // Keep only departments that have a parent_department value (i.e., are NOT parent departments)
    return dept && dept.parent_department && dept.parent_department.trim() !== '';
  });
}

function createDepartment(name, parentDepartmentId) {
  var d = { id: _uuid(), name: name, parent_department: parentDepartmentId || '', created_at: _now() };
  _appendRow(SHEET_DEPARTMENTS, d, DEPT_H);
  _invalidateCache(CACHE_KEY_DEPARTMENTS);
  return d;
}

// ── Users ─────────────────────────────────────────────────────
var USER_H = ['id','email','password_hash','name','role','department_id','is_active','created_at','updated_at'];

function getAllUsers() {
  return _getCachedData(CACHE_KEY_USERS, function() {
    return _sheetToObjects(getSheet(SHEET_USERS)).map(function (u) {
      u.is_active = (u.is_active === true || u.is_active === 'TRUE' || u.is_active === 1);
      return u;
    });
  });
}
function getUserByEmail(email) {
  return getUserByEmailFast(email);
}
function getUserById(id) {
  return getUserByIdFast(id);
}
function getUsersByDepartment(departmentId) {
  if (!departmentId) return [];
  return getAllUsers().filter(function(u) {
    if (!u.department_id) return false;
    // Handle both single ID string and JSON array of IDs
    try {
      var deptIds = JSON.parse(u.department_id);
      return Array.isArray(deptIds) && deptIds.indexOf(departmentId) >= 0;
    } catch (e) {
      return String(u.department_id) === String(departmentId);
    }
  });
}
function getUsersByDepartments(departmentIds) {
  if (!departmentIds || departmentIds.length === 0) return [];
  var allUsers = getAllUsers();
  var userMap = {}; // Use object to deduplicate users
  
  departmentIds.forEach(function(deptId) {
    allUsers.forEach(function(u) {
      if (!u.department_id) return;
      // Check if user belongs to this department
      try {
        var userDeptIds = JSON.parse(u.department_id);
        if (Array.isArray(userDeptIds) && userDeptIds.indexOf(deptId) >= 0) {
          userMap[u.id] = u;
        }
      } catch (e) {
        if (String(u.department_id) === String(deptId)) {
          userMap[u.id] = u;
        }
      }
    });
  });
  
  // Convert map back to array
  var result = [];
  for (var id in userMap) {
    result.push(userMap[id]);
  }
  return result;
}
function createUser(name, email, role, departmentIds, plainPassword) {
  // departmentIds can be a string (single ID), array of IDs, or empty
  var deptIdStr = '';
  if (Array.isArray(departmentIds)) {
    deptIdStr = JSON.stringify(departmentIds);
  } else if (departmentIds) {
    deptIdStr = departmentIds;
  }
  
  var u = {
    id:            _uuid(),
    email:         email,
    password_hash: plainPassword ? hashPassword(plainPassword) : 'GWS_AUTH_ONLY',
    name:          name,
    role:          role,                  // employee | reviewer | manager | admin
    department_id: deptIdStr,
    is_active:     true,
    created_at:    _now(),
    updated_at:    _now(),
  };
  _appendRow(SHEET_USERS, u, USER_H);
  _invalidateCache(CACHE_KEY_USERS);
  return u;
}
function setUserActive(userId, active) {
  var result = _updateRow(SHEET_USERS, userId, { is_active: active, updated_at: _now() }, USER_H);
  _invalidateCache(CACHE_KEY_USERS);
  return result;
}

// ── Reports ──────────────────────────────────────────────────
var REPORT_H = ['id','employee_id','report_type','start_date','end_date','request_date','week_title','work_type','day_short','notes','redmine_tasks','status','created_at','updated_at'];

function getAllReports() {
  return _getCachedData(CACHE_KEY_REPORTS, function() {
    return _sheetToObjects(getSheet(SHEET_REPORTS));
  });
}
function getReportsByEmployee(employeeId) {
  return getAllReports().filter(function (r) { return r.employee_id === employeeId; });
}
function getReportsByStatus(status) {
  return getAllReports().filter(function (r) { return r.status === status; });
}
function createReport(employeeId, reportType, startDate, endDate, requestDate, weekTitle, workType, dayShort, notes, redmineTasks, autoSubmit) {
  var r = {
    id:          _uuid(),
    employee_id: employeeId,
    report_type: reportType || '在宅勤務',
    start_date:  startDate,
    end_date:    endDate,
    request_date: requestDate,
    week_title:  weekTitle,
    work_type:   workType || '在宅勤務',
    day_short:   dayShort || '',
    notes:       notes || '',
    redmine_tasks: JSON.stringify(redmineTasks || []),
    status:      autoSubmit ? 'submitted' : 'draft',
    created_at:  _now(),
    updated_at:  _now(),
  };
  _appendRow(SHEET_REPORTS, r, REPORT_H);
  _invalidateCache(CACHE_KEY_REPORTS);
  return r;
}
function updateReportStatus(reportId, status) {
  var result = _updateRow(SHEET_REPORTS, reportId, { status: status, updated_at: _now() }, REPORT_H);
  _invalidateCache(CACHE_KEY_REPORTS);
  return result;
}

// ── Approvals ────────────────────────────────────────────────
var APPROVAL_H = ['id','report_id','approver_id','level','decision','comment','decided_at','created_at'];

function getAllApprovals() {
  return _getCachedData(CACHE_KEY_APPROVALS, function() {
    return _sheetToObjects(getSheet(SHEET_APPROVALS));
  });
}
function getApprovalsByReport(reportId) {
  // Use O(1) lookup map instead of filtering all approvals
  return getApprovalsByReportFast(reportId);
}
function createApproval(reportId, approverId, level) {
  var a = {
    id:          _uuid(),
    report_id:   reportId,
    approver_id: approverId,
    level:       level,          // 1 = reviewer, 2 = manager
    decision:    'pending',
    comment:     '',
    decided_at:  '',
    created_at:  _now(),
  };
  _appendRow(SHEET_APPROVALS, a, APPROVAL_H);
  _invalidateCache(CACHE_KEY_APPROVALS);
  _invalidateApprovalMap();
  return a;
}
function decideApproval(reportId, level, decision, comment) {
  var approvals = getAllApprovals();
  var target = approvals.find(function (a) {
    return a.report_id === reportId && String(a.level) === String(level);
  });
  if (target) {
    var result = _updateRow(SHEET_APPROVALS, target.id, {
      decision: decision, comment: comment || '', decided_at: _now(),
    }, APPROVAL_H);
    _invalidateCache(CACHE_KEY_APPROVALS);
    _invalidateApprovalMap();
    return result;
  }
  // Create if missing
  var approverId = getCurrentUser() ? getCurrentUser().id : '';
  var a = createApproval(reportId, approverId, level);
  var result = _updateRow(SHEET_APPROVALS, a.id, {
    decision: decision, comment: comment || '', decided_at: _now(),
  }, APPROVAL_H);
  _invalidateCache(CACHE_KEY_APPROVALS);
  _invalidateApprovalMap();
  return result;
}

// ── Client-facing API functions ───────────────────────────────

function getMyReports() {
  var user = getCurrentUser();
  if (!user) return { error: 'Unauthorized' };
  var dayRecords = getReportsByEmployee(user.id);
  
  // Group day records by start_date & end_date to reconstruct weeks
  var weekMap = {};
  dayRecords.forEach(function (r) {
    var key = r.start_date + '|' + r.end_date;
    if (!weekMap[key]) {
      weekMap[key] = {
        id:          r.id, // Use first day's ID as week ID (for compatibility)
        employee_id: r.employee_id,
        report_type: r.report_type,
        start_date:  r.start_date,
        end_date:    r.end_date,
        week_title:  r.week_title,
        status:      r.status, // All days in week should have same status
        tasks:       [], // Will aggregate all day data
        created_at:  r.created_at,
        updated_at:  r.updated_at,
      };
    }
    // Reconstruct day task from individual columns (getMyReports)
    var dayTask = {
      id:           r.id,
      date:         r.request_date,
      dayShort:     r.day_short || '',
      workType:     r.work_type || '在宅勤務',
      notes:        r.notes || '',
      status:       r.status,   // per-day status for UI badge
      redmineTasks: [],
      approvals:    [],
    };
    try {
      dayTask.redmineTasks = JSON.parse(r.redmine_tasks || '[]');
    } catch (e) {}
    dayTask.approvals = getApprovalsByReport(r.id);
    weekMap[key].tasks.push(dayTask);
  });
  
  // Convert to array, compute aggregate week status, and sort
  var weeks = Object.keys(weekMap).map(function (k) {
    var wk = weekMap[k];
    // Derive week-level status from individual day statuses
    var statuses = wk.tasks.map(function (t) { return t.status || 'draft'; });
    if (statuses.every(function (s) { return s === 'approved'; }))          wk.status = 'approved';
    else if (statuses.some(function (s) { return s === 'rejected'; }))       wk.status = 'rejected';
    else if (statuses.some(function (s) { return s === 'reviewed'; }))       wk.status = 'reviewed';
    else if (statuses.some(function (s) { return s === 'submitted'; }))      wk.status = 'submitted';
    else                                                                      wk.status = 'draft';
    return wk;
  });
  weeks.sort(function (a, b) {
    return new Date(b.start_date).getTime() - new Date(a.start_date).getTime();
  });
  return weeks;
}

function getPendingReports() {
  var user = getCurrentUser();
  if (!user) return { error: 'Unauthorized' };
  var dayRecords = getReportsByStatus('submitted').concat(getReportsByStatus('reviewed'));
  
  // Get user's departments for filtering (support multiple departments)
  var userDeptIds = [];
  try {
    if (user.department_id && user.department_id.trim()) {
      if (user.department_id.startsWith('[')) {
        userDeptIds = JSON.parse(user.department_id);
      } else {
        userDeptIds = [user.department_id];
      }
    }
  } catch (e) {
    userDeptIds = user.department_id ? [user.department_id] : [];
  }
  
  // For reviewers and managers (not admin), filter to ONLY child departments
  var filteredDeptIds = userDeptIds;
  if (user.role === 'reviewer' || user.role === 'manager') {
    filteredDeptIds = getChildDepartmentsOnly(userDeptIds);
  }
  
  // Group day records by start_date, end_date, and employee_id to reconstruct weeks
  var weekMap = {};
  var allDepts = getAllDepartments();
  dayRecords.forEach(function (r) {
    var key = r.employee_id + '|' + r.start_date + '|' + r.end_date;
    if (!weekMap[key]) {
      var emp = getUserById(r.employee_id);
      
      // Parse employee's department IDs
      var empDeptIds = [];
      if (emp && emp.department_id) {
        try {
          if (emp.department_id.startsWith('[')) {
            empDeptIds = JSON.parse(emp.department_id);
          } else {
            empDeptIds = [emp.department_id];
          }
        } catch (e) {
          empDeptIds = [emp.department_id];
        }
      }
      
      // Get department names
      var deptNames = empDeptIds.map(function(id) {
        var d = allDepts.find(function(dept) { return dept.id === id; });
        return d ? d.name : null;
      }).filter(function(n) { return n !== null; });
      
      weekMap[key] = {
        id:          r.id,
        employee_id: r.employee_id,
        employee_department_ids: empDeptIds,
        report_type: r.report_type,
        start_date:  r.start_date,
        end_date:    r.end_date,
        week_title:  r.week_title,
        status:      r.status,
        tasks:       [],
        created_at:  r.created_at,
        updated_at:  r.updated_at,
        employee_name:       emp  ? emp.name  : '不明',
        employee_department: deptNames.length > 0 ? deptNames.join(', ') : '未設定',
      };
    }
    // Reconstruct day task from individual columns
    var dayTask = {
      id:           r.id,
      date:         r.request_date,
      dayShort:     r.day_short || '',
      workType:     r.work_type || '在宅勤務',
      notes:        r.notes || '',
      status:       r.status,
      redmineTasks: [],
      approvals:    [],
    };
    try {
      dayTask.redmineTasks = JSON.parse(r.redmine_tasks || '[]');
    } catch (e) {}
    dayTask.approvals = getApprovalsByReport(r.id);
    weekMap[key].tasks.push(dayTask);
  });
  
  // Compute aggregate week status
  var weeks = Object.keys(weekMap).map(function (k) {
    var wk = weekMap[k];
    var statuses = wk.tasks.map(function (t) { return t.status || 'submitted'; });
    if (statuses.every(function (s) { return s === 'approved'; }))               wk.status = 'approved';
    else if (statuses.some(function (s) { return s === 'rejected'; }))            wk.status = 'rejected';
    else if (statuses.some(function (s) { return s === 'reviewed'; }))            wk.status = 'reviewed';
    else                                                                           wk.status = 'submitted';
    return wk;
  });
  
  // Filter by department based on user role
  var filtered = weeks.filter(function (w) {
    if (user.role === 'admin') return true;
    if (user.role === 'reviewer' || user.role === 'manager') {
      // Check if any of the user's CHILD departments match any of the employee's departments
      if (filteredDeptIds.length === 0 || w.employee_department_ids.length === 0) return false;
      return filteredDeptIds.some(function(userDept) {
        return w.employee_department_ids.indexOf(userDept) !== -1;
      });
    }
    return false;
  });
  
  // Sort by start_date descending
  filtered.sort(function (a, b) {
    return new Date(b.start_date).getTime() - new Date(a.start_date).getTime();
  });
  return filtered;
}

function getAllEmployees() {
  var user = getCurrentUser();
  if (!user || user.role !== 'admin') return { error: 'Unauthorized' };
  var allDepts = getAllDepartments();
  
  return getAllUsers().map(function (u) {
    // Parse department_id as JSON array or handle single ID
    var deptIds = [];
    try {
      if (u.department_id && u.department_id.trim()) {
        if (u.department_id.startsWith('[')) {
          deptIds = JSON.parse(u.department_id);
        } else {
          deptIds = [u.department_id];
        }
      }
    } catch (e) {
      deptIds = u.department_id ? [u.department_id] : [];
    }
    
    // Map department IDs to names
    var deptNames = deptIds.map(function(id) {
      var dept = allDepts.find(function(d) { return d.id === id; });
      return dept ? dept.name : null;
    }).filter(function(name) { return name !== null; });
    
    return {
      id:          u.id,
      name:        u.name,
      email:       u.email,
      role:        u.role,
      departments: deptNames,
      is_active:   u.is_active,
      created_at:  u.created_at,
    };
  });
}

function submitNewReport(data) {
  var user = getCurrentUser();
  if (!user) return { error: 'Unauthorized' };
  var requestDate = data.request_date || data.start_date; // assume same
  var weekTitle = _getWeekTitle(requestDate);
  var r = createReport(user.id, data.report_type, data.start_date, data.end_date, requestDate, weekTitle, data.tasks, data.submit);
  return { success: true, report: r };
}

// Save a single day as draft — upserts: updates existing draft or creates new one
// dayPayload: { startDate, endDate, date, dayShort, workType, notes, redmineTasks }
function saveDayDraft(dayPayload) {
  var user = getCurrentUser();
  if (!user) return { error: 'Unauthorized' };
  if (!dayPayload || !dayPayload.date || !dayPayload.startDate || !dayPayload.endDate) {
    return { error: 'データが不足しています' };
  }

  var weekTitle = _getWeekTitle(dayPayload.startDate);
  var sheet     = getSheet(SHEET_REPORTS);
  var data      = sheet.getDataRange().getValues();
  var empCol    = REPORT_H.indexOf('employee_id');
  var reqCol    = REPORT_H.indexOf('request_date');
  var startCol  = REPORT_H.indexOf('start_date');
  var endCol    = REPORT_H.indexOf('end_date');
  var statusCol = REPORT_H.indexOf('status');

  // Look for an existing record for this employee + this exact day
  var existingRow = -1;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][empCol])        === String(user.id) &&
        _dateStr(data[i][reqCol])      === String(dayPayload.date) &&
        _dateStr(data[i][startCol])    === String(dayPayload.startDate) &&
        _dateStr(data[i][endCol])      === String(dayPayload.endDate)) {
      existingRow = i;
      break;
    }
  }

  var existingId = existingRow > -1 ? String(data[existingRow][REPORT_H.indexOf('id')]) : null;
  var existingStatus = existingRow > -1 ? String(data[existingRow][statusCol]) : null;

  // If a submitted/approved record exists, do not overwrite with draft
  if (existingStatus && existingStatus !== 'draft' && existingStatus !== 'rejected') {
    return { error: 'すでに申請済みのため上書きできません', status: existingStatus };
  }

  if (existingRow > -1) {
    // Update existing row in-place
    var updates = {
      work_type:     dayPayload.workType  || '在宅勤務',
      day_short:     dayPayload.dayShort  || '',
      notes:         dayPayload.notes     || '',
      redmine_tasks: JSON.stringify(dayPayload.redmineTasks || []),
      week_title:    weekTitle,
      status:        'draft',
      updated_at:    _now(),
    };
    _updateRow(SHEET_REPORTS, existingId, updates, REPORT_H);
    _invalidateCache(CACHE_KEY_REPORTS);
    return { success: true, status: 'draft', id: existingId };
  } else {
    // Create a new draft record
    var r = createReport(
      user.id,
      '在宅勤務',
      dayPayload.startDate,
      dayPayload.endDate,
      dayPayload.date,
      weekTitle,
      dayPayload.workType  || '在宅勤務',
      dayPayload.dayShort  || '',
      dayPayload.notes     || '',
      dayPayload.redmineTasks || [],
      false  // draft
    );
    return { success: true, status: 'draft', id: r.id };
  }
}

// Submit one row per requested day in the week — only days that have a saved draft/are marked telework
// weekData: { startDate, endDate, days: [{date, dayShort, workType, notes, redmineTasks, edited}] }
function submitWeekReport(weekData) {
  var user = getCurrentUser();
  if (!user) return { error: 'Unauthorized' };
  if (!weekData || !weekData.startDate || !weekData.endDate || !weekData.days) {
    return { error: '週のデータが正しくありません' };
  }

  var weekTitle = _getWeekTitle(weekData.startDate);
  var sheet     = getSheet(SHEET_REPORTS);
  var raw       = sheet.getDataRange().getValues();
  var empCol    = REPORT_H.indexOf('employee_id');
  var startCol  = REPORT_H.indexOf('start_date');
  var endCol    = REPORT_H.indexOf('end_date');
  var statusCol = REPORT_H.indexOf('status');
  var reqCol    = REPORT_H.indexOf('request_date');
  var idCol     = REPORT_H.indexOf('id');

  // Build a map of existing rows for this employee + week keyed by request_date
  var existingByDate = {};
  for (var i = 1; i < raw.length; i++) {
    if (String(raw[i][empCol])        === String(user.id) &&
        _dateStr(raw[i][startCol])    === String(weekData.startDate) &&
        _dateStr(raw[i][endCol])      === String(weekData.endDate)) {
      existingByDate[_dateStr(raw[i][reqCol])] = { rowIdx: i, id: String(raw[i][idCol]), status: String(raw[i][statusCol]) };
    }
  }

  var createdReports = [];

  // Get employee info for approvals (get once, use for all days)
  var emp = getUserById(user.id);
  var reviewer = null;
  var manager = null;
  
  if (emp && emp.department_id) {
    var allUsers = getAllUsers();
    var allDepts = getAllDepartments();
    
    // Parse employee's department IDs
    var empDeptIds = [];
    try {
      if (emp.department_id.startsWith('[')) {
        empDeptIds = JSON.parse(emp.department_id);
      } else {
        empDeptIds = [emp.department_id];
      }
    } catch (e) {
      empDeptIds = [emp.department_id];
    }
    
    // Find reviewer who has at least one matching CHILD department (not parent department)
    reviewer = allUsers.find(function (u) {
      if (u.role !== 'reviewer' || !u.is_active || !u.department_id) return false;
      
      // Parse reviewer's department IDs
      var reviewerDeptIds = [];
      try {
        if (u.department_id.startsWith('[')) {
          reviewerDeptIds = JSON.parse(u.department_id);
        } else {
          reviewerDeptIds = [u.department_id];
        }
      } catch (e) {
        reviewerDeptIds = [u.department_id];
      }
      
      // Check if any matching department exists that is NOT a parent department
      return empDeptIds.some(function(empDept) {
        if (reviewerDeptIds.indexOf(empDept) === -1) return false;
        // Found a match - check if it's a child department (has parent_department)
        var dept = allDepts.find(function(d) { return d.id === empDept; });
        return dept && dept.parent_department && dept.parent_department.trim() !== '';
      });
    });
    
    // Find manager who has at least one matching CHILD department (not parent department)
    manager = allUsers.find(function (u) {
      if (u.role !== 'manager' || !u.is_active || !u.department_id) return false;
      
      // Parse manager's department IDs
      var managerDeptIds = [];
      try {
        if (u.department_id.startsWith('[')) {
          managerDeptIds = JSON.parse(u.department_id);
        } else {
          managerDeptIds = [u.department_id];
        }
      } catch (e) {
        managerDeptIds = [u.department_id];
      }
      
      // Check if any matching department exists that is NOT a parent department
      return empDeptIds.some(function(empDept) {
        if (managerDeptIds.indexOf(empDept) === -1) return false;
        // Found a match - check if it's a child department (has parent_department)
        var dept = allDepts.find(function(d) { return d.id === empDept; });
        return dept && dept.parent_department && dept.parent_department.trim() !== '';
      });
    });
  }

  weekData.days.forEach(function (day) {
    var existing = existingByDate[day.date];

    // Only submit draft records (days that were saved but not yet submitted)
    if (existing && existing.status === 'draft') {
      // Promote draft → submitted
      var updates = {
        status:        'submitted',
        updated_at:    _now(),
      };
      _updateRow(SHEET_REPORTS, existing.id, updates, REPORT_H);
      
      // Create approval records for this day's report
      var existingApprovals = getApprovalsByReport(existing.id);
      if (existingApprovals.length === 0) {
        if (reviewer) createApproval(existing.id, reviewer.id, 1);
        if (manager) createApproval(existing.id, manager.id, 2);
      }
      
      createdReports.push({ id: existing.id, status: 'submitted', date: day.date });
    }
    // Skip: rejected records, already submitted, or no record at all
  });

  // Invalidate cache after all updates
  _invalidateCache(CACHE_KEY_REPORTS);
  
  return { success: true, reports: createdReports };
}

// Review a single report (first approval step)
function reviewReportAction(reportId, comment) {
  var user = getCurrentUser();
  if (!user) return { error: 'Unauthorized' };
  
  var report = getAllReports().find(function (r) { return r.id === reportId; });
  if (!report) return { error: 'レポートが見つかりません' };
  
  // Only reviewers, managers, and admins can review
  if (user.role !== 'reviewer' && user.role !== 'manager' && user.role !== 'admin') {
    return { error: '照査権限がありません' };
  }
  
  // Update status to reviewed
  var level = 1; // Review level
  decideApproval(reportId, level, 'approved', comment);
  updateReportStatus(reportId, 'reviewed');
  
  return { success: true };
}

// Batch review all days in a week (first approval step)
function reviewWeekReport(dayIds, comment) {
  var user = getCurrentUser();
  if (!user) return { error: 'Unauthorized' };
  if (!dayIds || dayIds.length === 0) return { error: '申請日が見つかりません' };
  
  // Only reviewers, managers, and admins can review
  if (user.role !== 'reviewer' && user.role !== 'manager' && user.role !== 'admin') {
    return { error: '照査権限がありません' };
  }
  
  var allReports = getAllReports();
  var level = 1; // Review level
  var firstReport = null;
  var employee = null;
  
  // Review each day
  for (var i = 0; i < dayIds.length; i++) {
    var report = allReports.find(function (r) { return r.id === dayIds[i]; });
    if (!report) continue;
    if (!firstReport) {
      firstReport = report;
      employee = getUserById(report.employee_id);
    }
    decideApproval(dayIds[i], level, 'approved', comment);
    updateReportStatus(dayIds[i], 'reviewed');
  }
  
  // Send notification for the week
  if (firstReport && employee) {
    try {
      var notificationData = {
        reportType: 'telework',
        reportDate: firstReport.start_date,
        weekTitle: firstReport.week_title,
        employeeName: employee.name,
        employeeEmail: employee.email,
        approverName: user.name,
        decision: 'reviewed',
        reportUrl: ScriptApp.getService().getUrl() + '?page=reports',
      };
      sendMattermostMessage(notificationData, 'daily-report');
      
    } catch (e) {
      Logger.log('Mattermost notification failed: ' + e.message);
    }
  }
  
  return { success: true };
}

function approveReportAction(reportId, comment) {
  var user = getCurrentUser();
  if (!user) return { error: 'Unauthorized' };
  
  var report = getAllReports().find(function (r) { return r.id === reportId; });
  if (!report) return { error: 'レポートが見つかりません' };
  
  // Only managers and admins can do final approval
  if (user.role !== 'manager' && user.role !== 'admin') {
    return { error: '承認権限がありません。照査のみ可能です。' };
  }
  
  // Update to final approved status
  var level = 2; // Final approval level
  decideApproval(reportId, level, 'approved', comment);
  updateReportStatus(reportId, 'approved');
  
  return { success: true };
}

function rejectReportAction(reportId, comment) {
  var user = getCurrentUser();
  if (!user) return { error: 'Unauthorized' };
  
  // Find the single day report
  var report = getAllReports().find(function (r) { return r.id === reportId; });
  if (!report) return { error: 'レポートが見つかりません' };
  
  // Update only this single day record (no notification — use rejectWeekReport for batch)
  var level = (user.role === 'reviewer') ? 1 : 2;
  decideApproval(reportId, level, 'rejected', comment);
  updateReportStatus(reportId, 'rejected');
  
  return { success: true };
}

// Batch approve all days in a week and send ONE notification (final approval step)
function approveWeekReport(dayIds, comment) {
  var user = getCurrentUser();
  if (!user) return { error: 'Unauthorized' };
  if (!dayIds || dayIds.length === 0) return { error: '申請日が見つかりません' };
  
  // Only managers and admins can do final approval
  if (user.role !== 'manager' && user.role !== 'admin') {
    return { error: '承認権限がありません。照査のみ可能です。' };
  }
  
  var allReports = getAllReports();
  var level = 2; // Final approval level
  var firstReport = null;
  var employee = null;
  
  // Approve each day
  for (var i = 0; i < dayIds.length; i++) {
    var report = allReports.find(function (r) { return r.id === dayIds[i]; });
    if (!report) continue;
    if (!firstReport) {
      firstReport = report;
      employee = getUserById(report.employee_id);
    }
    decideApproval(dayIds[i], level, 'approved', comment);
    updateReportStatus(dayIds[i], 'approved');
  }
  
  // Send ONE notification for the whole week
  if (firstReport && employee) {
    try {
      var notificationData = {
        reportType: 'telework',
        reportDate: firstReport.start_date,
        weekTitle: firstReport.week_title,
        employeeName: employee.name,
        employeeEmail: employee.email,
        approverName: user.name,
        decision: 'approved',
        reportUrl: ScriptApp.getService().getUrl() + '?page=reports',
      };
      sendMattermostMessage(notificationData, 'daily-report');
    } catch (e) {
      Logger.log('Mattermost notification failed: ' + e.toString());
    }
  }
  
  return { success: true };
}

// Batch reject all days in a week and send ONE notification
function rejectWeekReport(dayIds, comment) {
  var user = getCurrentUser();
  if (!user) return { error: 'Unauthorized' };
  if (!dayIds || dayIds.length === 0) return { error: '申請日が見つかりません' };
  
  var allReports = getAllReports();
  var level = (user.role === 'reviewer') ? 1 : 2;
  var firstReport = null;
  var employee = null;
  
  // Reject each day
  for (var i = 0; i < dayIds.length; i++) {
    var report = allReports.find(function (r) { return r.id === dayIds[i]; });
    if (!report) continue;
    if (!firstReport) {
      firstReport = report;
      employee = getUserById(report.employee_id);
    }
    decideApproval(dayIds[i], level, 'rejected', comment);
    updateReportStatus(dayIds[i], 'rejected');
  }
  
  // Send ONE notification for the whole week
  if (firstReport && employee) {
    try {
      var notificationData = {
        reportType: 'telework',
        reportDate: firstReport.start_date,
        weekTitle: firstReport.week_title,
        employeeName: employee.name,
        employeeEmail: employee.email,
        approverName: user.name,
        decision: 'rejected',
        reportUrl: ScriptApp.getService().getUrl() + '?page=reports',
      };
      sendMattermostMessage(notificationData, 'daily-report');
    } catch (e) {
      Logger.log('Mattermost notification failed: ' + e.toString());
    }
  }
  
  return { success: true };
}

function toggleEmployeeStatus(userId, active) {
  var user = getCurrentUser();
  if (!user || user.role !== 'admin') return { error: 'Unauthorized' };
  setUserActive(userId, active);
  return { success: true };
}

function addEmployee(data) {
  var user = getCurrentUser();
  if (!user || user.role !== 'admin') return { error: 'Unauthorized' };
  
  var allDepts = getAllDepartments();
  var deptIds = [];
  
  // Handle departments as array
  if (data.departments && Array.isArray(data.departments)) {
    data.departments.forEach(function(deptName) {
      var dept = allDepts.find(function (d) { return d.name === deptName; });
      if (dept) deptIds.push(dept.id);
    });
  } else if (data.department) {
    // Backward compatibility: single department
    var dept = allDepts.find(function (d) { return d.name === data.department; });
    if (dept) deptIds.push(dept.id);
  }
  
  var newUser = createUser(data.name, data.email, data.role, deptIds, data.password || '');
  return { success: true, user: newUser };
}

function updateEmployee(data) {
  var user = getCurrentUser();
  if (!user || user.role !== 'admin') return { error: 'Unauthorized' };
  
  // Validate required fields
  if (!data.id || !data.name || !data.email || !data.role) {
    return { error: 'Missing required fields' };
  }
  
  // Check if employee exists
  var existingUser = getUserById(data.id);
  if (!existingUser) return { error: 'Employee not found' };
  
  // Get department IDs from department names
  var deptIds = [];
  if (data.departments && Array.isArray(data.departments) && data.departments.length > 0) {
    var allDepts = getAllDepartments();
    data.departments.forEach(function(deptName) {
      var dept = allDepts.find(function (d) { return d.name === deptName; });
      if (dept) deptIds.push(dept.id);
    });
  } else if (data.department) {
    // Backward compatibility: single department
    var allDepts = getAllDepartments();
    var dept = allDepts.find(function (d) { return d.name === data.department; });
    if (dept) deptIds.push(dept.id);
  }
  
  // Prepare update object
  var updates = {
    name: data.name,
    email: data.email,
    role: data.role,
    department_id: deptIds.length > 0 ? JSON.stringify(deptIds) : '',
    updated_at: _now()
  };
  
  // Only update password if provided
  if (data.password && data.password.trim() !== '') {
    updates.password_hash = hashPassword(data.password);
  }
  
  // Update the user record
  var success = _updateRow(SHEET_USERS, data.id, updates, USER_H);
  
  if (success) {
    _invalidateCache(CACHE_KEY_USERS);
    return { success: true };
  } else {
    return { error: 'Failed to update employee' };
  }
}

function getDepartmentList() {
  return getAllDepartments();
}

function getApproveDepartments() {
  var user = getCurrentUser();
  if (!user) return { error: 'Unauthorized' };
  var depts = getAllDepartments();
  
  // Admin can see all departments
  if (user.role === 'admin') {
    return depts.map(function (d) {
      return { id: d.id, name: d.name };
    });
  }
  
  // Reviewer and Manager can see their department(s)
  if (user.role === 'reviewer' || user.role === 'manager') {
    var userDeptIds = [];
    try {
      if (user.department_id && user.department_id.trim()) {
        if (user.department_id.startsWith('[')) {
          userDeptIds = JSON.parse(user.department_id);
        } else {
          userDeptIds = [user.department_id];
        }
      }
    } catch (e) {
      userDeptIds = user.department_id ? [user.department_id] : [];
    }
    
    // Filter to ONLY child departments (exclude parent departments)
    var childDeptIds = getChildDepartmentsOnly(userDeptIds);
    
    return depts.filter(function(d) {
      return childDeptIds.indexOf(d.id) !== -1;
    }).map(function(d) {
      return { id: d.id, name: d.name };
    });
  }
  
  return [];
}

// ── Task Reports (日報) ───────────────────────────────────────
var TASK_REPORT_H = ['id','employee_id','report_date','day_short','important_issues','next_day_plan','redmine_tasks','status','created_at','updated_at'];

function getAllTaskReports() {
  return _getCachedData(CACHE_KEY_TASK_REPORTS, function() {
    return _sheetToObjects(getSheet(SHEET_TASK_REPORTS));
  });
}
function getTaskReportsByEmployee(employeeId) {
  return getAllTaskReports().filter(function (r) { return r.employee_id === employeeId; });
}

// Client-facing: get my task reports grouped by week
function getMyTaskReports() {
  var user = getCurrentUser();
  if (!user) return { error: 'Unauthorized' };
  var records = getTaskReportsByEmployee(user.id);
  return records.map(function (r) {
    var redmineTasks = [];
    try { redmineTasks = JSON.parse(r.redmine_tasks || '[]'); } catch (e) {}
    return {
      id:              r.id,
      report_date:     r.report_date,
      day_short:       r.day_short,
      important_issues: r.important_issues || '',
      next_day_plan:   r.next_day_plan || '',
      redmineTasks:    redmineTasks,
      status:          r.status,
      approvals:       getApprovalsByReport(r.id),
      created_at:      r.created_at,
      updated_at:      r.updated_at,
    };
  });
}

// Save a single day task report as draft
function saveTaskReportDraft(payload) {
  var user = getCurrentUser();
  if (!user) return { error: 'Unauthorized' };
  if (!payload || !payload.date) return { error: 'データが不足しています' };

  var sheet = getSheet(SHEET_TASK_REPORTS);
  var data  = sheet.getDataRange().getValues();
  var empCol  = TASK_REPORT_H.indexOf('employee_id');
  var dateCol = TASK_REPORT_H.indexOf('report_date');
  var statusCol = TASK_REPORT_H.indexOf('status');

  var existingRow = -1;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][empCol]) === String(user.id) &&
        _dateStr(data[i][dateCol]) === String(payload.date)) {
      existingRow = i;
      break;
    }
  }

  var existingId = existingRow > -1 ? String(data[existingRow][TASK_REPORT_H.indexOf('id')]) : null;
  var existingStatus = existingRow > -1 ? String(data[existingRow][statusCol]) : null;

  if (existingStatus && existingStatus !== 'draft' && existingStatus !== 'rejected') {
    return { error: 'すでに申請済みのため上書きできません', status: existingStatus };
  }

  var updates = {
    day_short:        payload.dayShort || '',
    important_issues: payload.importantIssues || '',
    next_day_plan:    payload.nextDayPlan || '',
    redmine_tasks:    JSON.stringify(payload.redmineTasks || []),
    status:           'draft',
    updated_at:       _now(),
  };

  if (existingRow > -1) {
    _updateRow(SHEET_TASK_REPORTS, existingId, updates, TASK_REPORT_H);
    _invalidateCache(CACHE_KEY_TASK_REPORTS);
    return { success: true, status: 'draft', id: existingId };
  } else {
    var r = {
      id:               _uuid(),
      employee_id:      user.id,
      report_date:      payload.date,
      day_short:        payload.dayShort || '',
      important_issues: payload.importantIssues || '',
      next_day_plan:    payload.nextDayPlan || '',
      redmine_tasks:    JSON.stringify(payload.redmineTasks || []),
      status:           'draft',
      created_at:       _now(),
      updated_at:       _now(),
    };
    _appendRow(SHEET_TASK_REPORTS, r, TASK_REPORT_H);
    _invalidateCache(CACHE_KEY_TASK_REPORTS);
    return { success: true, status: 'draft', id: r.id };
  }
}

// Submit a single day task report (individual only, no combined)
function submitTaskReport(payload) {
  return _withLock('submitTaskReport', function() {
    return _submitTaskReportImpl(payload);
  });
}

function _submitTaskReportImpl(payload) {
  var user = getCurrentUser();
  if (!user) return { error: 'Unauthorized' };
  if (!payload || !payload.date) return { error: 'データが不足しています' };

  // Check for duplicate submission BEFORE proceeding
  var duplicate = _checkDuplicateSubmission(
    SHEET_TASK_REPORTS,
    { employee_id: user.id, report_date: payload.date },
    TASK_REPORT_H,
    ['draft', 'rejected']
  );
  if (duplicate) {
    return { error: 'この日報は既に申請済みです', status: duplicate.status };
  }

  var sheet = getSheet(SHEET_TASK_REPORTS);
  var data  = sheet.getDataRange().getValues();
  var empCol  = TASK_REPORT_H.indexOf('employee_id');
  var dateCol = TASK_REPORT_H.indexOf('report_date');
  var statusCol = TASK_REPORT_H.indexOf('status');
  var idCol   = TASK_REPORT_H.indexOf('id');

  var existingRow = -1;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][empCol]) === String(user.id) &&
        _dateStr(data[i][dateCol]) === String(payload.date)) {
      existingRow = i;
      break;
    }
  }

  if (existingRow < 0) return { error: '先に下書き保存してください' };

  var existingId = String(data[existingRow][idCol]);
  var existingStatus = String(data[existingRow][statusCol]);

  if (existingStatus !== 'draft') {
    return { error: 'この日報は既に申請済みです', status: existingStatus };
  }

  _updateRow(SHEET_TASK_REPORTS, existingId, { status: 'submitted', updated_at: _now() }, TASK_REPORT_H);
  _invalidateCache(CACHE_KEY_TASK_REPORTS);

  // Create approval records
  var emp = getUserById(user.id);
  if (emp && emp.department_id) {
    var allUsers = getAllUsers();
    var allDepts = getAllDepartments();
    
    // Parse employee's department IDs
    var empDeptIds = [];
    try {
      if (emp.department_id.startsWith('[')) {
        empDeptIds = JSON.parse(emp.department_id);
      } else {
        empDeptIds = [emp.department_id];
      }
    } catch (e) {
      empDeptIds = [emp.department_id];
    }
    
    // Find reviewer who has at least one matching CHILD department (not parent department)
    var reviewer = allUsers.find(function (u) {
      if (u.role !== 'reviewer' || !u.is_active || !u.department_id) return false;
      
      // Parse reviewer's department IDs
      var reviewerDeptIds = [];
      try {
        if (u.department_id.startsWith('[')) {
          reviewerDeptIds = JSON.parse(u.department_id);
        } else {
          reviewerDeptIds = [u.department_id];
        }
      } catch (e) {
        reviewerDeptIds = [u.department_id];
      }
      
      // Check if any matching department exists that is NOT a parent department
      return empDeptIds.some(function(empDept) {
        if (reviewerDeptIds.indexOf(empDept) === -1) return false;
        // Found a match - check if it's a child department (has parent_department)
        var dept = allDepts.find(function(d) { return d.id === empDept; });
        return dept && dept.parent_department && dept.parent_department.trim() !== '';
      });
    });
    
    // Find manager who has at least one matching CHILD department (not parent department)
    var manager = allUsers.find(function (u) {
      if (u.role !== 'manager' || !u.is_active || !u.department_id) return false;
      
      // Parse manager's department IDs
      var managerDeptIds = [];
      try {
        if (u.department_id.startsWith('[')) {
          managerDeptIds = JSON.parse(u.department_id);
        } else {
          managerDeptIds = [u.department_id];
        }
      } catch (e) {
        managerDeptIds = [u.department_id];
      }
      
      // Check if any matching department exists that is NOT a parent department
      return empDeptIds.some(function(empDept) {
        if (managerDeptIds.indexOf(empDept) === -1) return false;
        // Found a match - check if it's a child department (has parent_department)
        var dept = allDepts.find(function(d) { return d.id === empDept; });
        return dept && dept.parent_department && dept.parent_department.trim() !== '';
      });
    });
    
    var existingApprovals = getApprovalsByReport(existingId);
    if (existingApprovals.length === 0) {
      if (reviewer) createApproval(existingId, reviewer.id, 1);
      if (manager) createApproval(existingId, manager.id, 2);
    }
  }

  return { success: true, status: 'submitted', id: existingId };
}

// Delete a telework report day (user can only delete their own draft/rejected reports)
function deleteTeleworkDay(payload) {
  return _withLock('deleteTeleworkDay', function() {
    var user = getCurrentUser();
    if (!user) return { error: 'Unauthorized' };
    if (!payload || !payload.date || !payload.startDate || !payload.endDate) {
      return { error: 'データが不足しています' };
    }

    var sheet = getSheet(SHEET_REPORTS);
    var data  = sheet.getDataRange().getValues();
    var empCol    = REPORT_H.indexOf('employee_id');
    var reqCol    = REPORT_H.indexOf('request_date');
    var startCol  = REPORT_H.indexOf('start_date');
    var endCol    = REPORT_H.indexOf('end_date');
    var statusCol = REPORT_H.indexOf('status');
    var idCol     = REPORT_H.indexOf('id');

    // Find the record for this employee + this exact day
    var targetRow = -1;
    var targetId = null;
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][empCol])        === String(user.id) &&
          _dateStr(data[i][reqCol])      === String(payload.date) &&
          _dateStr(data[i][startCol])    === String(payload.startDate) &&
          _dateStr(data[i][endCol])      === String(payload.endDate)) {
        var status = String(data[i][statusCol]);
        // Only allow deletion of draft or rejected reports
        if (status === 'draft' || status === 'rejected') {
          targetRow = i;
          targetId = String(data[i][idCol]);
          break;
        } else {
          return { error: 'このステータスの申請は削除できません: ' + status };
        }
      }
    }

    if (targetRow === -1) {
      return { error: 'レコードが見つかりません' };
    }

    // Delete the row
    sheet.deleteRow(targetRow + 1); // +1 because sheet rows are 1-indexed
    
    // Also delete associated approvals
    var approvals = getApprovalsByReport(targetId);
    approvals.forEach(function(approval) {
      _deleteRowById(SHEET_APPROVALS, approval.id);
    });

    _invalidateCache(CACHE_KEY_REPORTS);
    _invalidateCache(CACHE_KEY_APPROVALS);
    _invalidateApprovalMap();
    return { success: true, message: '削除しました' };
  });
}

// Delete a task report day (user can only delete their own draft/rejected reports)
function deleteTaskDay(dateStr) {
  return _withLock('deleteTaskDay', function() {
    var user = getCurrentUser();
    if (!user) return { error: 'Unauthorized' };
    if (!dateStr) return { error: 'データが不足しています' };

    var sheet = getSheet(SHEET_TASK_REPORTS);
    var data  = sheet.getDataRange().getValues();
    var empCol  = TASK_REPORT_H.indexOf('employee_id');
    var dateCol = TASK_REPORT_H.indexOf('report_date');
    var statusCol = TASK_REPORT_H.indexOf('status');
    var idCol = TASK_REPORT_H.indexOf('id');

    // Find the record for this employee + this date
    var targetRow = -1;
    var targetId = null;
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][empCol]) === String(user.id) &&
          _dateStr(data[i][dateCol]) === String(dateStr)) {
        var status = String(data[i][statusCol]);
        // Only allow deletion of draft or rejected reports
        if (status === 'draft' || status === 'rejected') {
          targetRow = i;
          targetId = String(data[i][idCol]);
          break;
        } else {
          return { error: 'このステータスの日報は削除できません: ' + status };
        }
      }
    }

    if (targetRow === -1) {
      return { error: 'レコードが見つかりません' };
    }

    // Delete the row
    sheet.deleteRow(targetRow + 1); // +1 because sheet rows are 1-indexed
    
    // Also delete associated approvals
    var approvals = getApprovalsByReport(targetId);
    approvals.forEach(function(approval) {
      _deleteRowById(SHEET_APPROVALS, approval.id);
    });

    _invalidateCache(CACHE_KEY_TASK_REPORTS);
    _invalidateCache(CACHE_KEY_APPROVALS);
    _invalidateApprovalMap();
    return { success: true, message: '削除しました' };
  });
}

// Get pending task reports for reviewers/managers
function getPendingTaskReports() {
  var user = getCurrentUser();
  if (!user) return { error: 'Unauthorized' };

  // Get user's departments for filtering (support multiple departments)
  var userDeptIds = [];
  try {
    if (user.department_id && user.department_id.trim()) {
      if (user.department_id.startsWith('[')) {
        userDeptIds = JSON.parse(user.department_id);
      } else {
        userDeptIds = [user.department_id];
      }
    }
  } catch (e) {
    userDeptIds = user.department_id ? [user.department_id] : [];
  }
  
  // For reviewers and managers (not admin), filter to ONLY child departments
  var filteredDeptIds = userDeptIds;
  if (user.role === 'reviewer' || user.role === 'manager') {
    filteredDeptIds = getChildDepartmentsOnly(userDeptIds);
  }

  var allTR = getAllTaskReports().filter(function (r) {
    return r.status === 'submitted' || r.status === 'reviewed';
  });

  var allDepts = getAllDepartments();
  var mapped = allTR.map(function (r) {
    var emp = getUserById(r.employee_id);
    
    // Parse employee's department IDs
    var empDeptIds = [];
    if (emp && emp.department_id) {
      try {
        if (emp.department_id.startsWith('[')) {
          empDeptIds = JSON.parse(emp.department_id);
        } else {
          empDeptIds = [emp.department_id];
        }
      } catch (e) {
        empDeptIds = [emp.department_id];
      }
    }
    
    // Get department names
    var deptNames = empDeptIds.map(function(id) {
      var d = allDepts.find(function(dept) { return dept.id === id; });
      return d ? d.name : null;
    }).filter(function(n) { return n !== null; });
    
    var redmineTasks = [];
    try { redmineTasks = JSON.parse(r.redmine_tasks || '[]'); } catch (e) {}
    var approvals = getApprovalsByReport(r.id);
    return {
      id:                  r.id,
      employee_id:         r.employee_id,
      employee_department_ids: empDeptIds,
      report_date:         r.report_date,
      day_short:           r.day_short,
      important_issues:    r.important_issues || '',
      next_day_plan:       r.next_day_plan || '',
      redmineTasks:        redmineTasks,
      status:              r.status,
      created_at:          r.created_at,
      employee_name:       emp ? emp.name : '不明',
      employee_department: deptNames.length > 0 ? deptNames.join(', ') : '未設定',
      approvals:           approvals,
    };
  });
  
  // Filter by department based on user role
  return mapped.filter(function (r) {
    // Admin can see all
    if (user.role === 'admin') return true;
    // Reviewer and Manager can only see their CHILD department(s)
    if (user.role === 'reviewer' || user.role === 'manager') {
      // Check if any of the user's CHILD departments match any of the employee's departments
      if (filteredDeptIds.length === 0 || r.employee_department_ids.length === 0) return false;
      return filteredDeptIds.some(function(userDept) {
        return r.employee_department_ids.indexOf(userDept) !== -1;
      });
    }
    // Employee role shouldn't access this, but just in case
    return false;
  });
}

// Review a task report (first approval step)
function reviewTaskReportAction(reportId, comment) {
  return _withLock('reviewTaskReport_' + reportId, function() {
    var user = getCurrentUser();
    if (!user) return { error: 'Unauthorized' };
    
    var report = getAllTaskReports().find(function (r) { return r.id === reportId; });
    if (!report) return { error: 'レポートが見つかりません' };
    
    // Check if already reviewed (prevent duplicate action)
    if (report.status !== 'submitted') {
      return { error: 'この日報は既に処理済みです', status: report.status };
    }
    
    // Only reviewers, managers, and admins can review
    if (user.role !== 'reviewer' && user.role !== 'manager' && user.role !== 'admin') {
      return { error: '照査権限がありません' };
    }
    
    var level = 1; // Review level
    decideApproval(reportId, level, 'approved', comment);
    _updateRow(SHEET_TASK_REPORTS, reportId, { status: 'reviewed', updated_at: _now() }, TASK_REPORT_H);
    _invalidateCache(CACHE_KEY_TASK_REPORTS);
  
  // Send notification
  var employee = getUserById(report.employee_id);
  if (employee) {
    try {
      var notificationData = {
        reportType: 'task',
        reportDate: report.report_date,
        employeeName: employee.name,
        employeeEmail: employee.email,
        approverName: user.name,
        decision: 'reviewed',
        reportUrl: ScriptApp.getService().getUrl() + '?page=task_report',
      };
      sendMattermostMessage(notificationData, 'daily-report');
    } catch (e) {
      Logger.log('Mattermost notification failed: ' + e.message);
    }
  }
  
    return { success: true };
  });
}

// Approve a task report (final approval step)
function approveTaskReportAction(reportId, comment) {
  return _withLock('approveTaskReport_' + reportId, function() {
    var user = getCurrentUser();
    if (!user) return { error: 'Unauthorized' };

    var report = getAllTaskReports().find(function (r) { return r.id === reportId; });
    if (!report) return { error: 'レポートが見つかりません' };
    
    // Check if already approved (prevent duplicate action)
    if (report.status === 'approved') {
      return { error: 'この日報は既に承認済みです', status: report.status };
    }
    
    // Only managers and admins can do final approval
    if (user.role !== 'manager' && user.role !== 'admin') {
      return { error: '承認権限がありません。照査のみ可能です。' };
    }
    
    var employee = getUserById(report.employee_id);

    var level = 2; // Final approval level
    decideApproval(reportId, level, 'approved', comment);
    _updateRow(SHEET_TASK_REPORTS, reportId, { status: 'approved', updated_at: _now() }, TASK_REPORT_H);
    _invalidateCache(CACHE_KEY_TASK_REPORTS);
  
    // Send Mattermost notification
    if (employee) {
      try {
        var notificationData = {
          reportType: 'task',
          reportDate: report.report_date,
          employeeName: employee.name,
          employeeEmail: employee.email,
          approverName: user.name,
          decision: 'approved',
          reportUrl: ScriptApp.getService().getUrl() + '?page=task_report',
        };
        sendMattermostMessage(notificationData, 'daily-report');
      } catch (e) {
        Logger.log('Mattermost notification failed: ' + e.toString());
        // Don't fail the approval if notification fails
      }
    }
  
    return { success: true };
  });
}

// Reject a task report
function rejectTaskReportAction(reportId, comment) {
  return _withLock('rejectTaskReport_' + reportId, function() {
    var user = getCurrentUser();
    if (!user) return { error: 'Unauthorized' };

    var report = getAllTaskReports().find(function (r) { return r.id === reportId; });
    if (!report) return { error: 'レポートが見つかりません' };
    
    // Check if already rejected (prevent duplicate action)
    if (report.status === 'rejected') {
      return { error: 'この日報は既に差戻し済みです', status: report.status };
    }
  
    // Get employee information for notification
    var employee = getUserById(report.employee_id);

    var level = (user.role === 'reviewer') ? 1 : 2;
    decideApproval(reportId, level, 'rejected', comment);
    _updateRow(SHEET_TASK_REPORTS, reportId, { status: 'rejected', updated_at: _now() }, TASK_REPORT_H);
    _invalidateCache(CACHE_KEY_TASK_REPORTS);
  
    // Send Mattermost notification
    if (employee) {
      try {
        var notificationData = {
          reportType: 'task',
          reportDate: report.report_date,
          employeeName: employee.name,
          employeeEmail: employee.email,
          approverName: user.name,
          decision: 'rejected',
          reportUrl: ScriptApp.getService().getUrl() + '?page=task_report',
        };
        sendMattermostMessage(notificationData, 'daily-report');
      } catch (e) {
        Logger.log('Mattermost notification failed: ' + e.toString());
        // Don't fail the rejection if notification fails
      }
    }
  
    return { success: true };
  });
}

// ── Admin History functions ───────────────────────────────────

// Return all telework report rows enriched with employee / department names
function getAdminTeleworkReports() {
  var user = getCurrentUser();
  if (!user || user.role !== 'admin') return { error: 'Unauthorized' };
  var reports = getAllReports();
  var users   = getAllUsers();
  var depts   = getAllDepartments();
  return reports.map(function (r) {
    var emp  = users.find(function (u) { return u.id === r.employee_id; }) || null;
    var dept = (emp && emp.department_id)
      ? depts.find(function (d) { return d.id === emp.department_id; })
      : null;
    return {
      id:            r.id,
      employee_id:   r.employee_id,
      employee_name: emp  ? emp.name  : '不明',
      department:    dept ? dept.name : '未設定',
      report_type:   r.report_type  || '',
      request_date:  r.request_date || '',
      week_title:    r.week_title   || '',
      start_date:    r.start_date   || '',
      end_date:      r.end_date     || '',
      work_type:     r.work_type    || '',
      day_short:     r.day_short    || '',
      notes:         r.notes        || '',
      redmine_tasks: r.redmine_tasks || '[]',
      status:        r.status       || '',
      created_at:    r.created_at   || '',
    };
  });
}

// Return all daily task report rows enriched with employee / department names
function getAdminTaskReports() {
  var user = getCurrentUser();
  if (!user || user.role !== 'admin') return { error: 'Unauthorized' };
  var reports = _sheetToObjects(getSheet(SHEET_TASK_REPORTS));
  var users   = getAllUsers();
  var depts   = getAllDepartments();
  return reports.map(function (r) {
    var emp  = users.find(function (u) { return u.id === r.employee_id; }) || null;
    
    // Parse employee's department IDs
    var empDeptIds = [];
    if (emp && emp.department_id) {
      try {
        if (emp.department_id.startsWith('[')) {
          empDeptIds = JSON.parse(emp.department_id);
        } else {
          empDeptIds = [emp.department_id];
        }
      } catch (e) {
        empDeptIds = [emp.department_id];
      }
    }
    
    // Get department names
    var deptNames = empDeptIds.map(function(id) {
      var d = depts.find(function(dept) { return dept.id === id; });
      return d ? d.name : null;
    }).filter(function(n) { return n !== null; });
    
    return {
      id:               r.id,
      employee_id:      r.employee_id,
      employee_name:    emp  ? emp.name  : '不明',
      department:       deptNames.length > 0 ? deptNames.join(', ') : '未設定',
      department_id:    emp  ? (emp.department_id || '') : '',
      report_date:      r.report_date      || '',
      day_short:        r.day_short        || '',
      important_issues: r.important_issues || '',
      next_day_plan:    r.next_day_plan    || '',
      redmine_tasks:    r.redmine_tasks    || '[]',
      status:           r.status           || '',
      created_at:       r.created_at       || '',
    };
  });
}

/**
 * Get admin telework reports with date range filtering and pagination
 * @param {Object} options - { startDate, endDate, page, pageSize, status, employeeId }
 * @returns {Object} Paginated report data
 */
function getAdminTeleworkReportsPaginated(options) {
  var user = getCurrentUser();
  if (!user || user.role !== 'admin') return { error: 'Unauthorized' };
  
  options = options || {};
  var reports = getReportsInDateRange(options.startDate, options.endDate, options.employeeId);
  var users   = getAllUsers();
  var depts   = getAllDepartments();
  
  // Build user lookup for O(1) access
  var userMap = {};
  users.forEach(function(u) { userMap[u.id] = u; });
  
  // Build dept lookup for O(1) access
  var deptMap = {};
  depts.forEach(function(d) { deptMap[d.id] = d; });
  
  // IMPORTANT: getReportsInDateRange filters by start_date (week Sunday),
  // so records where start_date is in range but request_date exceeds end date can slip through.
  // Enforce actual date boundaries on request_date here.
  if (options.startDate || options.endDate) {
    var reqStart = options.startDate ? new Date(options.startDate) : null;
    var reqEnd   = options.endDate   ? new Date(options.endDate)   : null;
    if (reqEnd) reqEnd.setHours(23, 59, 59, 999);
    reports = reports.filter(function(r) {
      if (!r.request_date) return true;
      var reqDate = new Date(r.request_date);
      if (reqStart && reqDate < reqStart) return false;
      if (reqEnd   && reqDate > reqEnd)   return false;
      return true;
    });
  }
  
  // Filter by status if specified
  if (options.status) {
    reports = reports.filter(function(r) { return r.status === options.status; });
  }
  
  // Filter by week (Sunday-Saturday) using request_date
  if (options.weekSundayKey) {
    var weekSunday = new Date(options.weekSundayKey);
    var weekSaturday = new Date(weekSunday);
    weekSaturday.setDate(weekSunday.getDate() + 6);
    weekSaturday.setHours(23, 59, 59, 999);
    
    reports = reports.filter(function(r) {
      if (!r.request_date) return false;
      var requestDate = new Date(r.request_date);
      return requestDate >= weekSunday && requestDate <= weekSaturday;
    });
  }
  
  var mapped = reports.map(function (r) {
    var emp = userMap[r.employee_id] || null;
    var dept = (emp && emp.department_id) ? deptMap[emp.department_id] : null;
    return {
      id:            r.id,
      employee_id:   r.employee_id,
      employee_name: emp  ? emp.name  : '不明',
      employee_name_lower: emp ? emp.name.toLowerCase() : '',
      department:    dept ? dept.name : '未設定',
      report_type:   r.report_type  || '',
      request_date:  r.request_date || '',
      week_title:    r.week_title   || '',
      start_date:    r.start_date   || '',
      end_date:      r.end_date     || '',
      work_type:     r.work_type    || '',
      day_short:     r.day_short    || '',
      notes:         r.notes        || '',
      redmine_tasks: r.redmine_tasks || '[]',
      status:        r.status       || '',
      created_at:    r.created_at   || '',
    };
  });
  
  // Filter by employee name if specified
  if (options.employeeName && options.employeeName.trim()) {
    var searchTerm = options.employeeName.trim().toLowerCase();
    mapped = mapped.filter(function(r) {
      return r.employee_name_lower.indexOf(searchTerm) !== -1;
    });
  }
  
  // Remove helper field before returning
  mapped.forEach(function(r) { delete r.employee_name_lower; });
  
  // Sort by start_date descending
  mapped.sort(function(a, b) {
    return new Date(b.start_date).getTime() - new Date(a.start_date).getTime();
  });
  
  return _paginate(mapped, options.page, options.pageSize);
}

/**
 * Get admin task reports with date range filtering and pagination
 * @param {Object} options - { startDate, endDate, page, pageSize, status, employeeId }
 * @returns {Object} Paginated task report data
 */
function getAdminTaskReportsPaginated(options) {
  var user = getCurrentUser();
  if (!user || user.role !== 'admin') return { error: 'Unauthorized' };
  
  options = options || {};
  var reports = getTaskReportsInDateRange(options.startDate, options.endDate, options.employeeId);
  var users   = getAllUsers();
  var depts   = getAllDepartments();
  
  // Build user lookup for O(1) access
  var userMap = {};
  users.forEach(function(u) { userMap[u.id] = u; });
  
  // Build dept lookup for O(1) access
  var deptMap = {};
  depts.forEach(function(d) { deptMap[d.id] = d; });
  
  // Filter by status if specified
  if (options.status) {
    reports = reports.filter(function(r) { return r.status === options.status; });
  }
  
  // Filter by week (Sunday-Saturday) using report_date
  // getTaskReportsInDateRange already filters on report_date, so boundary is already enforced.
  if (options.weekSundayKey) {
    var weekSunday = new Date(options.weekSundayKey);
    var weekSaturday = new Date(weekSunday);
    weekSaturday.setDate(weekSunday.getDate() + 6);
    weekSaturday.setHours(23, 59, 59, 999);
    
    reports = reports.filter(function(r) {
      if (!r.report_date) return false;
      var reportDate = new Date(r.report_date);
      return reportDate >= weekSunday && reportDate <= weekSaturday;
    });
  }
  
  var mapped = reports.map(function (r) {
    var emp = userMap[r.employee_id] || null;
    var empNameLower = emp ? emp.name.toLowerCase() : '';
    
    // Parse employee's department IDs
    var empDeptIds = [];
    if (emp && emp.department_id) {
      try {
        if (emp.department_id.startsWith('[')) {
          empDeptIds = JSON.parse(emp.department_id);
        } else {
          empDeptIds = [emp.department_id];
        }
      } catch (e) {
        empDeptIds = [emp.department_id];
      }
    }
    
    // Get department names using O(1) lookup
    var deptNames = empDeptIds.map(function(id) {
      var d = deptMap[id];
      return d ? d.name : null;
    }).filter(function(n) { return n !== null; });
    
    return {
      id:               r.id,
      employee_id:      r.employee_id,
      employee_name:    emp  ? emp.name  : '不明',
      employee_name_lower: empNameLower,
      department:       deptNames.length > 0 ? deptNames.join(', ') : '未設定',
      department_id:    emp  ? (emp.department_id || '') : '',
      report_date:      r.report_date      || '',
      day_short:        r.day_short        || '',
      important_issues: r.important_issues || '',
      next_day_plan:    r.next_day_plan    || '',
      redmine_tasks:    r.redmine_tasks    || '[]',
      status:           r.status           || '',
      created_at:       r.created_at       || '',
    };
  });
  
  // Filter by employee name if specified
  if (options.employeeName && options.employeeName.trim()) {
    var searchTerm = options.employeeName.trim().toLowerCase();
    mapped = mapped.filter(function(r) {
      return r.employee_name_lower.indexOf(searchTerm) !== -1;
    });
  }
  
  // Remove helper field before returning
  mapped.forEach(function(r) { delete r.employee_name_lower; });
  
  // Sort by report_date descending
  mapped.sort(function(a, b) {
    return new Date(b.report_date).getTime() - new Date(a.report_date).getTime();
  });
  
  return _paginate(mapped, options.page, options.pageSize);
}

/**
 * Get all available weeks (Sunday keys) within a date range for admin history
 * @param {Object} options - { startDate, endDate, reportType }
 * @returns {Array} Array of week objects with {sundayKey, label}
 */
function getAvailableWeeksForDateRange(options) {
  var user = getCurrentUser();
  if (!user || user.role !== 'admin') return { error: 'Unauthorized' };
  
  options = options || {};
  var reportType = options.reportType || 'telework';
  
  // Resolve date range (default: last 1 month)
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var endDate = options.endDate ? new Date(options.endDate) : new Date(today);
  endDate.setHours(0, 0, 0, 0);
  var startDate = options.startDate ? new Date(options.startDate) : (function() {
    var d = new Date(today);
    d.setMonth(d.getMonth() - 1);
    return d;
  })();
  startDate.setHours(0, 0, 0, 0);
  
  // Cache key
  var startKey = startDate.getFullYear() + '-' + String(startDate.getMonth() + 1).padStart(2, '0') + '-' + String(startDate.getDate()).padStart(2, '0');
  var endKey   = endDate.getFullYear()   + '-' + String(endDate.getMonth()   + 1).padStart(2, '0') + '-' + String(endDate.getDate()).padStart(2, '0');
  var cacheKey = 'weeks_' + reportType + '_' + startKey + '_' + endKey;
  var cache = CacheService.getScriptCache();
  var cached = cache.get(cacheKey);
  if (cached) {
    try { return JSON.parse(cached); } catch (e) {}
  }
  
  // Find the Sunday on or before startDate
  var dow = startDate.getDay(); // 0 = Sunday
  var cur = new Date(startDate);
  cur.setDate(startDate.getDate() - dow);
  cur.setHours(0, 0, 0, 0);
  
  var weeks = [];
  
  // Iterate week by week while the week's Sunday is <= endDate
  while (cur <= endDate) {
    var sun = new Date(cur);
    var sat = new Date(cur);
    sat.setDate(cur.getDate() + 6);
    
    // Calculate ISO week number based on Sunday
    var utcD = new Date(Date.UTC(sun.getFullYear(), sun.getMonth(), sun.getDate()));
    var utcDay = utcD.getUTCDay() || 7;
    utcD.setUTCDate(utcD.getUTCDate() + 4 - utcDay);
    var yearStart = new Date(Date.UTC(utcD.getUTCFullYear(), 0, 1));
    var weekNum = Math.ceil(((utcD - yearStart) / 86400000 + 1) / 7);
    
    var sunStr = sun.getFullYear() + '-' + String(sun.getMonth() + 1).padStart(2, '0') + '-' + String(sun.getDate()).padStart(2, '0');
    var satStr = sat.getFullYear() + '-' + String(sat.getMonth() + 1).padStart(2, '0') + '-' + String(sat.getDate()).padStart(2, '0');
    
    weeks.push({
      sundayKey: sunStr,
      label: '第' + weekNum + '週 ' + sunStr + '（日）〜' + satStr + '（土）',
      timestamp: sun.getTime()
    });
    
    // Advance to next Sunday
    cur.setDate(cur.getDate() + 7);
  }
  
  // Sort descending (most recent first)
  weeks.sort(function(a, b) { return b.timestamp - a.timestamp; });
  
  // Cache for 5 minutes
  try { cache.put(cacheKey, JSON.stringify(weeks), 300); } catch (e) {}
  
  return weeks;
}

// Delete a single telework report row by id
function adminDeleteTeleworkReport(id) {
  var user = getCurrentUser();
  if (!user || user.role !== 'admin') return { error: 'Unauthorized' };
  
  // Delete associated approvals first
  var approvals = getApprovalsByReport(id);
  approvals.forEach(function(approval) {
    _deleteRowById(SHEET_APPROVALS, approval.id);
  });
  
  // Delete the report
  return _deleteRowById(SHEET_REPORTS, id);
}

// Delete a single task report row by id
function adminDeleteTaskReport(id) {
  var user = getCurrentUser();
  if (!user || user.role !== 'admin') return { error: 'Unauthorized' };
  
  // Delete associated approvals first
  var approvals = getApprovalsByReport(id);
  approvals.forEach(function(approval) {
    _deleteRowById(SHEET_APPROVALS, approval.id);
  });
  
  // Delete the report
  return _deleteRowById(SHEET_TASK_REPORTS, id);
}

// Export an array of plain objects to a new sheet in the spreadsheet
function adminExportToSheet(rows, sheetTitle) {
  var user = getCurrentUser();
  if (!user || user.role !== 'admin') return { error: 'Unauthorized' };
  if (!rows || rows.length === 0) return { error: 'データがありません' };

  var ss   = getSpreadsheet();
  var name = sheetTitle || ('エクスポート_' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd_HH-mm'));

  var existing = ss.getSheetByName(name);
  if (existing) ss.deleteSheet(existing);

  var sheet   = ss.insertSheet(name);
  var headers = Object.keys(rows[0]);
  sheet.getRange(1, 1, 1, headers.length)
       .setValues([headers])
       .setFontWeight('bold')
       .setBackground('#1e293b')
       .setFontColor('#ffffff');

  var dataRows = rows.map(function (r) {
    return headers.map(function (h) { return r[h] !== undefined ? r[h] : ''; });
  });
  sheet.getRange(2, 1, dataRows.length, headers.length).setValues(dataRows);
  SpreadsheetApp.flush();

  return { success: true, sheetName: name };
}

// ── Team Calendar functions ─────────────────────────────────

// Returns non-draft telework reports for calendar display.
// Admin sees all; managers/reviewers see their department(s); employees see their own department.
function getTeamCalendarData() {
  var user = getCurrentUser();
  if (!user) return { error: 'Unauthorized' };
  var reports = getAllReports();
  var users   = getAllUsers();
  var depts   = getAllDepartments();
  
  // Parse current user's department IDs
  var currentEmp = users.find(function (u) { return u.id === user.id; });
  var userDeptIds = [];
  if (currentEmp && currentEmp.department_id) {
    try {
      if (currentEmp.department_id.startsWith('[')) {
        userDeptIds = JSON.parse(currentEmp.department_id);
      } else {
        userDeptIds = [currentEmp.department_id];
      }
    } catch (e) {
      userDeptIds = currentEmp.department_id ? [currentEmp.department_id] : [];
    }
  }
  
  // For reviewers and employees (not admin), filter to ONLY child departments
  var filteredDeptIds = userDeptIds;
  if (user.role !== 'admin') {
    filteredDeptIds = getChildDepartmentsOnly(userDeptIds);
  }
  
  return reports
    .filter(function (r) { return r.status && r.status !== 'draft'; })
    .filter(function (r) {
      // Admin sees all
      if (user.role === 'admin') return true;
      
      // For managers, reviewers, and employees: check if employee is in any of user's CHILD departments
      var emp = users.find(function (u) { return u.id === r.employee_id; });
      if (!emp || !emp.department_id) return false;
      
      // Parse employee's department IDs
      var empDeptIds = [];
      try {
        if (emp.department_id.startsWith('[')) {
          empDeptIds = JSON.parse(emp.department_id);
        } else {
          empDeptIds = [emp.department_id];
        }
      } catch (e) {
        empDeptIds = [emp.department_id];
      }
      
      // Check if any of user's CHILD departments match any of employee's departments
      return filteredDeptIds.some(function(userDept) {
        return empDeptIds.indexOf(userDept) !== -1;
      });
    })
    .map(function (r) {
      var emp = users.find(function (u) { return u.id === r.employee_id; }) || null;
      
      // Parse employee's department IDs and get names
      var deptNames = [];
      if (emp && emp.department_id) {
        var empDeptIds = [];
        try {
          if (emp.department_id.startsWith('[')) {
            empDeptIds = JSON.parse(emp.department_id);
          } else {
            empDeptIds = [emp.department_id];
          }
        } catch (e) {
          empDeptIds = emp.department_id ? [emp.department_id] : [];
        }
        
        deptNames = empDeptIds.map(function(id) {
          var d = depts.find(function(dept) { return dept.id === id; });
          return d ? d.name : null;
        }).filter(function(n) { return n !== null; });
      }
      
      return {
        id:            r.id,
        employee_name: emp ? emp.name : '不明',
        department:    deptNames.length > 0 ? deptNames.join(', ') : '未設定',
        department_id: emp ? (emp.department_id || '') : '',
        request_date:  r.request_date || '',
        work_type:     r.work_type || '在宅勤務',
        day_short:     r.day_short || '',
        status:        r.status || '',
      };
    });
}

// Returns departments list for the calendar filter dropdown.
// Admin receives all departments; managers/reviewers receive their assigned departments.
function getTeamCalendarDepartments() {
  var user = getCurrentUser();
  if (!user) return { error: 'Unauthorized' };
  var depts = getAllDepartments();
  
  // Admin can see all departments
  if (user.role === 'admin') {
    return depts.map(function (d) {
      return { id: d.id, name: d.name };
    });
  }
  
  // Managers and reviewers can see their department(s)
  if (user.role === 'manager' || user.role === 'reviewer') {
    var userDeptIds = [];
    try {
      if (user.department_id && user.department_id.trim()) {
        if (user.department_id.startsWith('[')) {
          userDeptIds = JSON.parse(user.department_id);
        } else {
          userDeptIds = [user.department_id];
        }
      }
    } catch (e) {
      userDeptIds = user.department_id ? [user.department_id] : [];
    }
    
    // Filter to ONLY child departments (exclude parent departments)
    var childDeptIds = getChildDepartmentsOnly(userDeptIds);
    
    return depts.filter(function(d) {
      return childDeptIds.indexOf(d.id) !== -1;
    }).map(function(d) {
      return { id: d.id, name: d.name };
    });
  }
  
  // Employees don't get department filter
  return [];
}

// Helper: delete a sheet row whose 'id' column matches the given id
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

// ── Admin Dashboard Summary ──────────────────────────────────
// Returns telework conditions and daily report submission counts
// for the current Mon–Fri week. Called from Dashboard.html.
function getAdminDashboardData() {
  var user = getCurrentUser();
  if (!user || user.role !== 'admin') return { error: 'Unauthorized' };

  // Compute Mon–Fri date strings for the current week
  var today  = new Date();
  var dow    = today.getDay(); // 0=Sun … 6=Sat
  var offset = dow === 0 ? -6 : 1 - dow;
  var monday = new Date(today);
  monday.setDate(today.getDate() + offset);
  monday.setHours(0, 0, 0, 0);

  var weekDays = [];
  for (var i = 0; i < 5; i++) {
    var d = new Date(monday);
    d.setDate(monday.getDate() + i);
    weekDays.push(_dateStr(d));
  }

  // Total active employees
  var totalEmployees = getAllUsers().filter(function(u) {
    return u.role === 'employee' && u.is_active;
  }).length;

  // Telework vs office counts per day — only approved requests, all departments
  var allReports = getAllReports();
  var teleworkData = weekDays.map(function(date) {
    var dayRows = allReports.filter(function(r) {
      return _dateStr(r.request_date) === date && r.status === 'approved';
    });
    return {
      date:     date,
      telework: dayRows.filter(function(r) { return r.work_type === '在宅勤務'; }).length,
      office:   dayRows.filter(function(r) { return r.work_type === '出社';     }).length,
    };
  });

  // Submitted task_reports per day
  var taskReports = _sheetToObjects(getSheet(SHEET_TASK_REPORTS));
  var reportData = weekDays.map(function(date) {
    var submitted = taskReports.filter(function(r) {
      return _dateStr(r.report_date) === date && r.status !== 'draft';
    }).length;
    return {
      date:      date,
      submitted: submitted,
      missing:   Math.max(0, totalEmployees - submitted),
    };
  });

  return {
    weekDays:       weekDays,
    totalEmployees: totalEmployees,
    teleworkData:   teleworkData,
    reportData:     reportData,
  };
}

// ── Department Dashboard Data (for non-admin users) ──────────
function getDepartmentDashboardData() {
  var user = getCurrentUser();
  if (!user) return { error: 'Unauthorized' };

  // Admin should use getAdminDashboardData instead
  if (user.role === 'admin') {
    return getAdminDashboardData();
  }

  // Get user's department IDs (can be multiple)
  var userDeptIds = [];
  if (user.department_id) {
    try {
      var parsed = JSON.parse(user.department_id);
      userDeptIds = Array.isArray(parsed) ? parsed : [user.department_id];
    } catch (e) {
      userDeptIds = [user.department_id];
    }
  }

  if (userDeptIds.length === 0) {
    return { error: 'ユーザーに部門が割り当てられていません' };
  }

  // Filter to ONLY child departments (exclude parent departments)
  var childDeptIds = getChildDepartmentsOnly(userDeptIds);
  
  if (childDeptIds.length === 0) {
    return { error: 'ユーザーに子部門が割り当てられていません' };
  }

  // Compute Mon–Fri date strings for the current week
  var today  = new Date();
  var dow    = today.getDay(); // 0=Sun … 6=Sat
  var offset = dow === 0 ? -6 : 1 - dow;
  var monday = new Date(today);
  monday.setDate(today.getDate() + offset);
  monday.setHours(0, 0, 0, 0);

  var weekDays = [];
  for (var i = 0; i < 5; i++) {
    var d = new Date(monday);
    d.setDate(monday.getDate() + i);
    weekDays.push(_dateStr(d));
  }

  // Get all employees from ONLY child departments (NOT parent departments)
  var deptUsers = getUsersByDepartments(childDeptIds).filter(function(u) {
    return u.role === 'employee' && u.is_active;
  });
  var deptUserIds = deptUsers.map(function(u) { return u.id; });
  var totalEmployees = deptUsers.length;

  // Telework vs office counts per day — only approved requests in this department
  var allReports = getAllReports();
  var teleworkData = weekDays.map(function(date) {
    var dayRows = allReports.filter(function(r) {
      return _dateStr(r.request_date) === date && 
             r.status === 'approved' &&
             deptUserIds.indexOf(r.employee_id) >= 0;
    });
    return {
      date:     date,
      telework: dayRows.filter(function(r) { return r.work_type === '在宅勤務'; }).length,
      office:   dayRows.filter(function(r) { return r.work_type === '出社';     }).length,
    };
  });

  // Submitted task_reports per day for department employees only
  var taskReports = _sheetToObjects(getSheet(SHEET_TASK_REPORTS));
  var reportData = weekDays.map(function(date) {
    var submitted = taskReports.filter(function(r) {
      return _dateStr(r.report_date) === date && 
             r.status !== 'draft' &&
             deptUserIds.indexOf(r.employee_id) >= 0;
    }).length;
    return {
      date:      date,
      submitted: submitted,
      missing:   Math.max(0, totalEmployees - submitted),
    };
  });

  return {
    weekDays:       weekDays,
    totalEmployees: totalEmployees,
    teleworkData:   teleworkData,
    reportData:     reportData,
  };
}

// ── Seed initial data (called by setupSheets) ─────────────────
function _seedData(ss) {
  var dSheet = ss.getSheetByName(SHEET_DEPARTMENTS);
  if (dSheet.getLastRow() > 1) return; // already seeded

  // Create parent departments first
  var parentDept1 = { id: _uuid(), name: 'エンジニアリング部門', parent_department: '', created_at: _now() };
  var parentDept2 = { id: _uuid(), name: '管理部門', parent_department: '', created_at: _now() };
  
  var depts = [
    parentDept1,
    parentDept2,
    { id: _uuid(), name: 'エンジニアリング第1チーム', parent_department: parentDept1.id, created_at: _now() },
    { id: _uuid(), name: 'UI/UXデザイン',             parent_department: parentDept1.id, created_at: _now() },
    { id: _uuid(), name: 'システムエンジニア',         parent_department: parentDept1.id, created_at: _now() },
    { id: _uuid(), name: '人事部',                     parent_department: parentDept2.id, created_at: _now() },
  ];
  depts.forEach(function (d) { _appendRow(SHEET_DEPARTMENTS, d, DEPT_H); });

  // ⚠ Replace 'admin@yourdomain.com' with the real admin Google Workspace email
  _appendRow(SHEET_USERS, {
    id:            _uuid(),
    email:         'admin@yourdomain.com',
    password_hash: 'GWS_AUTH_ONLY',
    name:          '管理者',
    role:          'admin',
    department_id: '',
    is_active:     true,
    created_at:    _now(),
    updated_at:    _now(),
  }, USER_H);
}
