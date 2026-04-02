// ============================================================
//  Sheets.gs — Google Sheets data layer
//
//  Sheet structure mirrors the Drizzle SQLite schema exactly:
//    departments      → id, name, created_at
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
  _createSheet(ss, SHEET_DEPARTMENTS, ['id','name','created_at']);
  _createSheet(ss, SHEET_USERS,       ['id','email','password_hash','name','role','department_id','is_active','created_at','updated_at']);
  _createSheet(ss, SHEET_REPORTS,     ['id','employee_id','report_type','start_date','end_date','request_date','week_title','work_type','day_short','notes','redmine_tasks','status','created_at','updated_at']);
  _createSheet(ss, SHEET_APPROVALS,   ['id','report_id','approver_id','level','decision','comment','decided_at','created_at']);
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
var _DATE_COLS = ['start_date', 'end_date', 'request_date', 'decided_at'];

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

function _updateRow(sheetName, id, updates, headers) {
  var sheet = getSheet(sheetName);
  var data  = sheet.getDataRange().getValues();
  var idCol = headers.indexOf('id');
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][idCol]) === String(id)) {
      headers.forEach(function (h, c) {
        if (updates[h] !== undefined) sheet.getRange(i + 1, c + 1).setValue(updates[h]);
      });
      return true;
    }
  }
  return false;
}

function _uuid()  { return Utilities.getUuid(); }
function _now()   { return new Date().toISOString(); }

// Calculate week title like "第13週"
function _getWeekTitle(dateStr) {
  var date = new Date(dateStr);
  var startOfYear = new Date(date.getFullYear(), 0, 1);
  var days = Math.floor((date - startOfYear) / (24 * 60 * 60 * 1000));
  var weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7);
  return '第' + weekNumber + '週';
}

// ── Departments ──────────────────────────────────────────────
var DEPT_H = ['id','name','created_at'];

function getAllDepartments() {
  return _sheetToObjects(getSheet(SHEET_DEPARTMENTS));
}
function getDepartmentById(id) {
  return getAllDepartments().find(function (d) { return d.id === id; }) || null;
}
function createDepartment(name) {
  var d = { id: _uuid(), name: name, created_at: _now() };
  _appendRow(SHEET_DEPARTMENTS, d, DEPT_H);
  return d;
}

// ── Users ─────────────────────────────────────────────────────
var USER_H = ['id','email','password_hash','name','role','department_id','is_active','created_at','updated_at'];

function getAllUsers() {
  return _sheetToObjects(getSheet(SHEET_USERS)).map(function (u) {
    u.is_active = (u.is_active === true || u.is_active === 'TRUE' || u.is_active === 1);
    return u;
  });
}
function getUserByEmail(email) {
  return getAllUsers().find(function (u) {
    return String(u.email).toLowerCase() === String(email).toLowerCase();
  }) || null;
}
function getUserById(id) {
  return getAllUsers().find(function (u) { return u.id === id; }) || null;
}
function createUser(name, email, role, departmentId, plainPassword) {
  var u = {
    id:            _uuid(),
    email:         email,
    password_hash: plainPassword ? hashPassword(plainPassword) : 'GWS_AUTH_ONLY',
    name:          name,
    role:          role,                  // employee | reviewer | manager | admin
    department_id: departmentId || '',
    is_active:     true,
    created_at:    _now(),
    updated_at:    _now(),
  };
  _appendRow(SHEET_USERS, u, USER_H);
  return u;
}
function setUserActive(userId, active) {
  return _updateRow(SHEET_USERS, userId, { is_active: active, updated_at: _now() }, USER_H);
}

// ── Reports ──────────────────────────────────────────────────
var REPORT_H = ['id','employee_id','report_type','start_date','end_date','request_date','week_title','work_type','day_short','notes','redmine_tasks','status','created_at','updated_at'];

function getAllReports() {
  return _sheetToObjects(getSheet(SHEET_REPORTS));
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
    report_type: reportType || 'テレワーク',
    start_date:  startDate,
    end_date:    endDate,
    request_date: requestDate,
    week_title:  weekTitle,
    work_type:   workType || 'テレワーク',
    day_short:   dayShort || '',
    notes:       notes || '',
    redmine_tasks: JSON.stringify(redmineTasks || []),
    status:      autoSubmit ? 'submitted' : 'draft',
    created_at:  _now(),
    updated_at:  _now(),
  };
  _appendRow(SHEET_REPORTS, r, REPORT_H);
  return r;
}
function updateReportStatus(reportId, status) {
  return _updateRow(SHEET_REPORTS, reportId, { status: status, updated_at: _now() }, REPORT_H);
}

// ── Approvals ────────────────────────────────────────────────
var APPROVAL_H = ['id','report_id','approver_id','level','decision','comment','decided_at','created_at'];

function getAllApprovals() {
  return _sheetToObjects(getSheet(SHEET_APPROVALS));
}
function getApprovalsByReport(reportId) {
  return getAllApprovals().filter(function (a) { return a.report_id === reportId; });
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
  return a;
}
function decideApproval(reportId, level, decision, comment) {
  var approvals = getAllApprovals();
  var target = approvals.find(function (a) {
    return a.report_id === reportId && String(a.level) === String(level);
  });
  if (target) {
    return _updateRow(SHEET_APPROVALS, target.id, {
      decision: decision, comment: comment || '', decided_at: _now(),
    }, APPROVAL_H);
  }
  // Create if missing
  var approverId = getCurrentUser() ? getCurrentUser().id : '';
  var a = createApproval(reportId, approverId, level);
  return _updateRow(SHEET_APPROVALS, a.id, {
    decision: decision, comment: comment || '', decided_at: _now(),
  }, APPROVAL_H);
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
      date:         r.request_date,
      dayShort:     r.day_short || '',
      workType:     r.work_type || 'テレワーク',
      notes:        r.notes || '',
      status:       r.status,   // per-day status for UI badge
      redmineTasks: [],
    };
    try {
      dayTask.redmineTasks = JSON.parse(r.redmine_tasks || '[]');
    } catch (e) {}
    weekMap[key].tasks.push(dayTask);
  });
  
  // Convert to array, compute aggregate week status, and sort
  var weeks = Object.keys(weekMap).map(function (k) {
    var wk = weekMap[k];
    // Derive week-level status from individual day statuses
    var statuses = wk.tasks.map(function (t) { return t.status || 'draft'; });
    if (statuses.every(function (s) { return s === 'approved'; }))          wk.status = 'approved';
    else if (statuses.some(function (s) { return s === 'rejected'; }))       wk.status = 'rejected';
    else if (statuses.some(function (s) { return s === 'reviewer_approved'; })) wk.status = 'reviewer_approved';
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
  var dayRecords = getReportsByStatus('submitted').concat(getReportsByStatus('reviewer_approved'));
  
  // Group day records by start_date, end_date, and employee_id to reconstruct weeks
  var weekMap = {};
  dayRecords.forEach(function (r) {
    var key = r.employee_id + '|' + r.start_date + '|' + r.end_date;
    if (!weekMap[key]) {
      var emp  = getUserById(r.employee_id);
      var dept = emp && emp.department_id ? getDepartmentById(emp.department_id) : null;
      weekMap[key] = {
        id:          r.id, // Use first day's ID (for compat with approvals)
        employee_id: r.employee_id,
        report_type: r.report_type,
        start_date:  r.start_date,
        end_date:    r.end_date,
        week_title:  r.week_title,
        status:      r.status,
        tasks:       [],
        reportIds:   [], // collect all day record IDs for approval lookup
        created_at:  r.created_at,
        updated_at:  r.updated_at,
        employee_name:       emp  ? emp.name  : '不明',
        employee_department: dept ? dept.name : '未設定',
        approvals:           [],
      };
    }
    // Reconstruct day task from individual columns (getPendingReports)
    var dayTask = {
      date:         r.request_date,
      dayShort:     r.day_short || '',
      workType:     r.work_type || 'テレワーク',
      notes:        r.notes || '',
      status:       r.status,
      redmineTasks: [],
    };
    try {
      dayTask.redmineTasks = JSON.parse(r.redmine_tasks || '[]');
    } catch (e) {}
    weekMap[key].tasks.push(dayTask);
    weekMap[key].reportIds.push(r.id);
  });
  Object.keys(weekMap).forEach(function (k) {
    var wk = weekMap[k];
    var allApprovals = [];
    // wk.reportIds contains all day record IDs in this week
    (wk.reportIds || []).forEach(function (rid) {
      var aprs = getApprovalsByReport(rid);
      aprs.forEach(function (a) { allApprovals.push(a); });
    });
    wk.approvals = allApprovals;
    delete wk.reportIds; // cleanup — don't send to client
  });
  
  // Compute aggregate week status
  var weeks = Object.keys(weekMap).map(function (k) {
    var wk = weekMap[k];
    var statuses = wk.tasks.map(function (t) { return t.status || 'submitted'; });
    if (statuses.every(function (s) { return s === 'approved'; }))               wk.status = 'approved';
    else if (statuses.some(function (s) { return s === 'rejected'; }))            wk.status = 'rejected';
    else if (statuses.some(function (s) { return s === 'reviewer_approved'; }))   wk.status = 'reviewer_approved';
    else                                                                           wk.status = 'submitted';
    return wk;
  });
  // Sort by start_date descending
  weeks.sort(function (a, b) {
    return new Date(b.start_date).getTime() - new Date(a.start_date).getTime();
  });
  return weeks;
}

function getAllEmployees() {
  var user = getCurrentUser();
  if (!user || user.role !== 'admin') return { error: 'Unauthorized' };
  return getAllUsers().map(function (u) {
    var dept = u.department_id ? getDepartmentById(u.department_id) : null;
    return {
      id:         u.id,
      name:       u.name,
      email:      u.email,
      role:       u.role,
      department: dept ? dept.name : '未設定',
      is_active:  u.is_active,
      created_at: u.created_at,
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
      work_type:     dayPayload.workType  || 'テレワーク',
      day_short:     dayPayload.dayShort  || '',
      notes:         dayPayload.notes     || '',
      redmine_tasks: JSON.stringify(dayPayload.redmineTasks || []),
      week_title:    weekTitle,
      status:        'draft',
      updated_at:    _now(),
    };
    _updateRow(SHEET_REPORTS, existingId, updates, REPORT_H);
    return { success: true, status: 'draft', id: existingId };
  } else {
    // Create a new draft record
    var r = createReport(
      user.id,
      'テレワーク',
      dayPayload.startDate,
      dayPayload.endDate,
      dayPayload.date,
      weekTitle,
      dayPayload.workType  || 'テレワーク',
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
    reviewer = allUsers.find(function (u) {
      return u.role === 'reviewer' && u.department_id === emp.department_id && u.is_active;
    });
    manager = allUsers.find(function (u) {
      return u.role === 'manager' && u.department_id === emp.department_id && u.is_active;
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

  return { success: true, reports: createdReports };
}

function approveReportAction(reportId, comment) {
  var user = getCurrentUser();
  if (!user) return { error: 'Unauthorized' };
  
  // Find the report and get its week range
  var report = getAllReports().find(function (r) { return r.id === reportId; });
  if (!report) return { error: 'レポートが見つかりません' };
  
  // Update all records for this week (compare dates as strings)
  var allRpts = getAllReports();
  allRpts.forEach(function (r) {
    if (String(r.employee_id) === String(report.employee_id) &&
        String(r.start_date)  === String(report.start_date) &&
        String(r.end_date)    === String(report.end_date)) {
      var level     = (user.role === 'reviewer') ? 1 : 2;
      var newStatus = (level === 1) ? 'reviewer_approved' : 'approved';
      decideApproval(r.id, level, 'approved', comment);
      updateReportStatus(r.id, newStatus);
    }
  });
  
  return { success: true };
}

function rejectReportAction(reportId, comment) {
  var user = getCurrentUser();
  if (!user) return { error: 'Unauthorized' };
  
  // Find the report and get its week range
  var report = getAllReports().find(function (r) { return r.id === reportId; });
  if (!report) return { error: 'レポートが見つかりません' };
  
  // Update all records for this week (compare dates as strings)
  var allRpts = getAllReports();
  allRpts.forEach(function (r) {
    if (String(r.employee_id) === String(report.employee_id) &&
        String(r.start_date)  === String(report.start_date) &&
        String(r.end_date)    === String(report.end_date)) {
      var level = (user.role === 'reviewer') ? 1 : 2;
      decideApproval(r.id, level, 'rejected', comment);
      updateReportStatus(r.id, 'rejected');
    }
  });
  
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
  var depts = getAllDepartments();
  var dept  = depts.find(function (d) { return d.name === data.department; });
  var deptId = dept ? dept.id : '';
  var newUser = createUser(data.name, data.email, data.role, deptId, data.password || '');
  return { success: true, user: newUser };
}

function getDepartmentList() {
  return getAllDepartments();
}

// ── Seed initial data (called by setupSheets) ─────────────────
function _seedData(ss) {
  var dSheet = ss.getSheetByName(SHEET_DEPARTMENTS);
  if (dSheet.getLastRow() > 1) return; // already seeded

  var depts = [
    { id: _uuid(), name: 'エンジニアリング第1チーム', created_at: _now() },
    { id: _uuid(), name: 'UI/UXデザイン',             created_at: _now() },
    { id: _uuid(), name: 'システムエンジニア',         created_at: _now() },
    { id: _uuid(), name: '人事部',                     created_at: _now() },
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
