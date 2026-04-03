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
  _createSheet(ss, SHEET_DEPARTMENTS, ['id','name','created_at']);
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
      workType:     r.work_type || '在宅勤務',
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
  
  // Get user's department for filtering
  var userDept = user.department_id ? getDepartmentById(user.department_id) : null;
  var userDeptId = userDept ? userDept.id : null;
  
  // Group day records by start_date, end_date, and employee_id to reconstruct weeks
  var weekMap = {};
  dayRecords.forEach(function (r) {
    var key = r.employee_id + '|' + r.start_date + '|' + r.end_date;
    if (!weekMap[key]) {
      var emp  = getUserById(r.employee_id);
      var dept = emp && emp.department_id ? getDepartmentById(emp.department_id) : null;
      weekMap[key] = {
        id:          r.id,
        employee_id: r.employee_id,
        employee_department_id: dept ? dept.id : '',
        report_type: r.report_type,
        start_date:  r.start_date,
        end_date:    r.end_date,
        week_title:  r.week_title,
        status:      r.status,
        tasks:       [],
        created_at:  r.created_at,
        updated_at:  r.updated_at,
        employee_name:       emp  ? emp.name  : '不明',
        employee_department: dept ? dept.name : '未設定',
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
    else if (statuses.some(function (s) { return s === 'reviewer_approved'; }))   wk.status = 'reviewer_approved';
    else                                                                           wk.status = 'submitted';
    return wk;
  });
  
  // Filter by department based on user role
  var filtered = weeks.filter(function (w) {
    if (user.role === 'admin') return true;
    if (user.role === 'reviewer' || user.role === 'manager') {
      return w.employee_department_id === userDeptId;
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
      work_type:     dayPayload.workType  || '在宅勤務',
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
  
  // Find the single day report
  var report = getAllReports().find(function (r) { return r.id === reportId; });
  if (!report) return { error: 'レポートが見つかりません' };
  
  // Update only this single day record
  var level     = (user.role === 'reviewer') ? 1 : 2;
  var newStatus = (level === 1) ? 'reviewer_approved' : 'approved';
  decideApproval(reportId, level, 'approved', comment);
  updateReportStatus(reportId, newStatus);
  
  return { success: true };
}

function rejectReportAction(reportId, comment) {
  var user = getCurrentUser();
  if (!user) return { error: 'Unauthorized' };
  
  // Find the single day report
  var report = getAllReports().find(function (r) { return r.id === reportId; });
  if (!report) return { error: 'レポートが見つかりません' };
  
  // Update only this single day record
  var level = (user.role === 'reviewer') ? 1 : 2;
  decideApproval(reportId, level, 'rejected', comment);
  updateReportStatus(reportId, 'rejected');
  
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
  
  // Reviewer and Manager can only see their own department
  if (user.role === 'reviewer' || user.role === 'manager') {
    if (user.department_id) {
      var dept = depts.find(function (d) { return d.id === user.department_id; });
      if (dept) return [{ id: dept.id, name: dept.name }];
    }
  }
  
  return [];
}

// ── Task Reports (日報) ───────────────────────────────────────
var TASK_REPORT_H = ['id','employee_id','report_date','day_short','important_issues','next_day_plan','redmine_tasks','status','created_at','updated_at'];

function getAllTaskReports() {
  return _sheetToObjects(getSheet(SHEET_TASK_REPORTS));
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
    return { success: true, status: 'draft', id: r.id };
  }
}

// Submit a single day task report (individual only, no combined)
function submitTaskReport(payload) {
  var user = getCurrentUser();
  if (!user) return { error: 'Unauthorized' };
  if (!payload || !payload.date) return { error: 'データが不足しています' };

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

  // Create approval records
  var emp = getUserById(user.id);
  if (emp && emp.department_id) {
    var allUsers = getAllUsers();
    var reviewer = allUsers.find(function (u) {
      return u.role === 'reviewer' && u.department_id === emp.department_id && u.is_active;
    });
    var manager = allUsers.find(function (u) {
      return u.role === 'manager' && u.department_id === emp.department_id && u.is_active;
    });
    var existingApprovals = getApprovalsByReport(existingId);
    if (existingApprovals.length === 0) {
      if (reviewer) createApproval(existingId, reviewer.id, 1);
      if (manager) createApproval(existingId, manager.id, 2);
    }
  }

  return { success: true, status: 'submitted', id: existingId };
}

// Get pending task reports for reviewers/managers
function getPendingTaskReports() {
  var user = getCurrentUser();
  if (!user) return { error: 'Unauthorized' };

  // Get user's department for filtering
  var userDept = user.department_id ? getDepartmentById(user.department_id) : null;
  var userDeptId = userDept ? userDept.id : null;

  var allTR = getAllTaskReports().filter(function (r) {
    return r.status === 'submitted' || r.status === 'reviewer_approved';
  });

  var mapped = allTR.map(function (r) {
    var emp  = getUserById(r.employee_id);
    var dept = emp && emp.department_id ? getDepartmentById(emp.department_id) : null;
    var redmineTasks = [];
    try { redmineTasks = JSON.parse(r.redmine_tasks || '[]'); } catch (e) {}
    var approvals = getApprovalsByReport(r.id);
    return {
      id:                  r.id,
      employee_id:         r.employee_id,
      employee_department_id: dept ? dept.id : '',
      report_date:         r.report_date,
      day_short:           r.day_short,
      important_issues:    r.important_issues || '',
      next_day_plan:       r.next_day_plan || '',
      redmineTasks:        redmineTasks,
      status:              r.status,
      created_at:          r.created_at,
      employee_name:       emp ? emp.name : '不明',
      employee_department: dept ? dept.name : '未設定',
      approvals:           approvals,
    };
  });
  
  // Filter by department based on user role
  return mapped.filter(function (r) {
    // Admin can see all
    if (user.role === 'admin') return true;
    // Reviewer and Manager can only see their department
    if (user.role === 'reviewer' || user.role === 'manager') {
      return r.employee_department_id === userDeptId;
    }
    // Employee role shouldn't access this, but just in case
    return false;
  });
}

// Approve a task report
function approveTaskReportAction(reportId, comment) {
  var user = getCurrentUser();
  if (!user) return { error: 'Unauthorized' };

  var report = getAllTaskReports().find(function (r) { return r.id === reportId; });
  if (!report) return { error: 'レポートが見つかりません' };

  var level     = (user.role === 'reviewer') ? 1 : 2;
  var newStatus = (level === 1) ? 'reviewer_approved' : 'approved';
  decideApproval(reportId, level, 'approved', comment);
  _updateRow(SHEET_TASK_REPORTS, reportId, { status: newStatus, updated_at: _now() }, TASK_REPORT_H);
  return { success: true };
}

// Reject a task report
function rejectTaskReportAction(reportId, comment) {
  var user = getCurrentUser();
  if (!user) return { error: 'Unauthorized' };

  var report = getAllTaskReports().find(function (r) { return r.id === reportId; });
  if (!report) return { error: 'レポートが見つかりません' };

  var level = (user.role === 'reviewer') ? 1 : 2;
  decideApproval(reportId, level, 'rejected', comment);
  _updateRow(SHEET_TASK_REPORTS, reportId, { status: 'rejected', updated_at: _now() }, TASK_REPORT_H);
  return { success: true };
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
    var dept = (emp && emp.department_id)
      ? depts.find(function (d) { return d.id === emp.department_id; })
      : null;
    return {
      id:               r.id,
      employee_id:      r.employee_id,
      employee_name:    emp  ? emp.name  : '不明',
      department:       dept ? dept.name : '未設定',
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

// Delete a single telework report row by id
function adminDeleteTeleworkReport(id) {
  var user = getCurrentUser();
  if (!user || user.role !== 'admin') return { error: 'Unauthorized' };
  return _deleteRowById(SHEET_REPORTS, id);
}

// Delete a single task report row by id
function adminDeleteTaskReport(id) {
  var user = getCurrentUser();
  if (!user || user.role !== 'admin') return { error: 'Unauthorized' };
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
// Admin sees all; other roles see only their own department.
function getTeamCalendarData() {
  var user = getCurrentUser();
  if (!user) return { error: 'Unauthorized' };
  var reports = getAllReports();
  var users   = getAllUsers();
  var depts   = getAllDepartments();
  // Determine the requesting user's department for non-admin filtering
  var currentEmp   = users.find(function (u) { return u.id === user.id; });
  var userDeptId   = currentEmp ? (currentEmp.department_id || '') : '';
  return reports
    .filter(function (r) { return r.status && r.status !== 'draft'; })
    .filter(function (r) {
      if (user.role === 'admin') return true;
      var emp = users.find(function (u) { return u.id === r.employee_id; });
      return emp && emp.department_id === userDeptId;
    })
    .map(function (r) {
      var emp  = users.find(function (u) { return u.id === r.employee_id; }) || null;
      var dept = (emp && emp.department_id)
        ? depts.find(function (d) { return d.id === emp.department_id; })
        : null;
      return {
        id:            r.id,
        employee_name: emp  ? emp.name  : '不明',
        department:    dept ? dept.name : '未設定',
        department_id: emp  ? (emp.department_id || '') : '',
        request_date:  r.request_date || '',
        work_type:     r.work_type    || '在宅勤務',
        day_short:     r.day_short    || '',
        status:        r.status       || '',
      };
    });
}

// Returns departments list for the calendar filter dropdown.
// Only admin receives the full list; others receive an empty array.
function getTeamCalendarDepartments() {
  var user = getCurrentUser();
  if (!user) return { error: 'Unauthorized' };
  if (user.role !== 'admin') return [];
  return getAllDepartments().map(function (d) {
    return { id: d.id, name: d.name };
  });
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
