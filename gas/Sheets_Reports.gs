// =============================================================================
// Sheets_Reports.gs — 在宅勤務申請管理
// 在宅勤務申請の取得・下書き保存・提出・承認・差戻し・削除などを定義する
// =============================================================================

// 在宅勤務申請テーブルのカラム定義
var REPORT_H = ['id', 'employee_id', 'report_type', 'start_date', 'end_date', 'request_date', 'week_title', 'work_type', 'day_short', 'notes', 'redmine_tasks', 'status', 'created_at', 'updated_at'];

// ── 基本 CRUD ─────────────────────────────────────────────────

// 全申請をキャッシュ経由で取得する
function getAllReports() {
  return _getCachedData(CACHE_KEY_REPORTS, function() {
    return _sheetToObjects(getSheet(SHEET_REPORTS));
  });
}

// 従業員 ID で申請を絞り込む
function getReportsByEmployee(employeeId) {
  return getAllReports().filter(function(r) { return r.employee_id === employeeId; });
}

// ステータスで申請を絞り込む
function getReportsByStatus(status) {
  return getAllReports().filter(function(r) { return r.status === status; });
}

// 在宅勤務申請レコードを新規作成する
function createReport(employeeId, reportType, startDate, endDate, requestDate, weekTitle, workType, dayShort, notes, redmineTasks, autoSubmit) {
  var r = {
    id:           _uuid(),
    employee_id:  employeeId,
    report_type:  reportType || '在宅勤務',
    start_date:   startDate,
    end_date:     endDate,
    request_date: requestDate,
    week_title:   weekTitle,
    work_type:    workType  || '在宅勤務',
    day_short:    dayShort  || '',
    notes:        notes     || '',
    redmine_tasks: JSON.stringify(redmineTasks || []),
    status:       autoSubmit ? 'submitted' : 'draft',
    created_at:   _now(),
    updated_at:   _now(),
  };
  _appendRow(SHEET_REPORTS, r, REPORT_H);
  _invalidateCache(CACHE_KEY_REPORTS);
  return r;
}

// 申請のステータスを更新する
function updateReportStatus(reportId, status) {
  var result = _updateRow(SHEET_REPORTS, reportId, { status: status, updated_at: _now() }, REPORT_H);
  _invalidateCache(CACHE_KEY_REPORTS);
  return result;
}

// ── クライアント向け API — 従業員 ────────────────────────────

// ログインユーザーの申請一覧を週単位にまとめて返す
function getMyReports() {
  var user = getCurrentUser();
  if (!user) return { error: 'Unauthorized' };

  var dayRecords = getReportsByEmployee(user.id);
  var weekMap = {};

  dayRecords.forEach(function(r) {
    var key = r.start_date + '|' + r.end_date;
    if (!weekMap[key]) {
      weekMap[key] = {
        id:          r.id,
        employee_id: r.employee_id,
        report_type: r.report_type,
        start_date:  r.start_date,
        end_date:    r.end_date,
        week_title:  r.week_title,
        status:      r.status,
        tasks:       [],
        created_at:  r.created_at,
        updated_at:  r.updated_at,
      };
    }
    var dayTask = {
      id:           r.id,
      date:         r.request_date,
      dayShort:     r.day_short || '',
      workType:     r.work_type || '在宅勤務',
      notes:        r.notes    || '',
      status:       r.status,
      redmineTasks: [],
      approvals:    [],
    };
    try { dayTask.redmineTasks = JSON.parse(r.redmine_tasks || '[]'); } catch (e) {}
    dayTask.approvals = getApprovalsByReport(r.id);
    weekMap[key].tasks.push(dayTask);
  });

  // 週単位のステータスを日単位ステータスから導出する
  var weeks = Object.keys(weekMap).map(function(k) {
    var wk = weekMap[k];
    var statuses = wk.tasks.map(function(t) { return t.status || 'draft'; });
    if (statuses.every(function(s) { return s === 'approved'; }))     wk.status = 'approved';
    else if (statuses.some(function(s) { return s === 'rejected'; })) wk.status = 'rejected';
    else if (statuses.some(function(s) { return s === 'reviewed'; })) wk.status = 'reviewed';
    else if (statuses.some(function(s) { return s === 'submitted'; })) wk.status = 'submitted';
    else                                                                wk.status = 'draft';
    return wk;
  });

  weeks.sort(function(a, b) {
    return new Date(b.start_date).getTime() - new Date(a.start_date).getTime();
  });
  return weeks;
}

// 1日分の申請を下書き保存する（既存レコードがあれば更新、なければ新規作成）
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

  var existingId     = existingRow > -1 ? String(data[existingRow][REPORT_H.indexOf('id')]) : null;
  var existingStatus = existingRow > -1 ? String(data[existingRow][statusCol]) : null;

  // 申請済みレコードは上書き不可
  if (existingStatus && existingStatus !== 'draft' && existingStatus !== 'rejected') {
    return { error: 'すでに申請済みのため上書きできません', status: existingStatus };
  }

  if (existingRow > -1) {
    _updateRow(SHEET_REPORTS, existingId, {
      work_type:     dayPayload.workType  || '在宅勤務',
      day_short:     dayPayload.dayShort  || '',
      notes:         dayPayload.notes     || '',
      redmine_tasks: JSON.stringify(dayPayload.redmineTasks || []),
      week_title:    weekTitle,
      status:        'draft',
      updated_at:    _now(),
    }, REPORT_H);
    _invalidateCache(CACHE_KEY_REPORTS);
    return { success: true, status: 'draft', id: existingId };
  } else {
    var r = createReport(
      user.id, '在宅勤務',
      dayPayload.startDate, dayPayload.endDate, dayPayload.date,
      weekTitle,
      dayPayload.workType  || '在宅勤務',
      dayPayload.dayShort  || '',
      dayPayload.notes     || '',
      dayPayload.redmineTasks || [],
      false
    );
    return { success: true, status: 'draft', id: r.id };
  }
}

// 週単位で下書きを一括提出する（draft → submitted）
// weekData: { startDate, endDate, days: [{date, ...}] }
function submitWeekReport(weekData) {
  var user = getCurrentUser();
  if (!user) return { error: 'Unauthorized' };
  if (!weekData || !weekData.startDate || !weekData.endDate || !weekData.days) {
    return { error: '週のデータが正しくありません' };
  }

  var sheet    = getSheet(SHEET_REPORTS);
  var raw      = sheet.getDataRange().getValues();
  var empCol   = REPORT_H.indexOf('employee_id');
  var startCol = REPORT_H.indexOf('start_date');
  var endCol   = REPORT_H.indexOf('end_date');
  var statusCol= REPORT_H.indexOf('status');
  var reqCol   = REPORT_H.indexOf('request_date');
  var idCol    = REPORT_H.indexOf('id');

  // 当週・当従業員の既存レコードを日付をキーにしたマップに展開
  var existingByDate = {};
  for (var i = 1; i < raw.length; i++) {
    if (String(raw[i][empCol])     === String(user.id) &&
        _dateStr(raw[i][startCol]) === String(weekData.startDate) &&
        _dateStr(raw[i][endCol])   === String(weekData.endDate)) {
      existingByDate[_dateStr(raw[i][reqCol])] = {
        rowIdx: i,
        id:     String(raw[i][idCol]),
        status: String(raw[i][statusCol]),
      };
    }
  }

  // 承認者（照査者・承認者）を部署で検索する
  var reviewer = _findApproverByRole(user, 'reviewer');
  var manager  = _findApproverByRole(user, 'manager');

  var createdReports = [];
  weekData.days.forEach(function(day) {
    var existing = existingByDate[day.date];
    if (existing && existing.status === 'draft') {
      _updateRow(SHEET_REPORTS, existing.id, { status: 'submitted', updated_at: _now() }, REPORT_H);

      // 承認レコードがなければ作成する
      var existingApprovals = getApprovalsByReport(existing.id);
      if (existingApprovals.length === 0) {
        if (reviewer) createApproval(existing.id, reviewer.id, 1);
        if (manager)  createApproval(existing.id, manager.id,  2);
      }
      createdReports.push({ id: existing.id, status: 'submitted', date: day.date });
    }
  });

  _invalidateCache(CACHE_KEY_REPORTS);
  return { success: true, reports: createdReports };
}

// ── クライアント向け API — 照査・承認者 ──────────────────────

// 照査・承認待ちの申請一覧を週単位で返す（部署フィルタあり）
function getPendingReports() {
  var user = getCurrentUser();
  if (!user) return { error: 'Unauthorized' };

  var userDeptIds    = _parseDeptIds(user.department_id);
  var filteredDeptIds = (user.role === 'reviewer' || user.role === 'manager')
    ? getChildDepartmentsOnly(userDeptIds)
    : userDeptIds;

  var dayRecords = getReportsByStatus('submitted').concat(getReportsByStatus('reviewed'));
  var allDepts   = getAllDepartments();
  var weekMap    = {};

  dayRecords.forEach(function(r) {
    var key = r.employee_id + '|' + r.start_date + '|' + r.end_date;
    if (!weekMap[key]) {
      var emp        = getUserById(r.employee_id);
      var empDeptIds = _parseDeptIds(emp ? emp.department_id : '');
      var deptNames  = empDeptIds.map(function(id) {
        var d = allDepts.find(function(dept) { return dept.id === id; });
        return d ? d.name : null;
      }).filter(Boolean);

      weekMap[key] = {
        id:                      r.id,
        employee_id:             r.employee_id,
        employee_department_ids: empDeptIds,
        report_type:             r.report_type,
        start_date:              r.start_date,
        end_date:                r.end_date,
        week_title:              r.week_title,
        status:                  r.status,
        tasks:                   [],
        created_at:              r.created_at,
        updated_at:              r.updated_at,
        employee_name:           emp ? emp.name : '不明',
        employee_department:     deptNames.length > 0 ? deptNames.join(', ') : '未設定',
      };
    }
    var dayTask = {
      id:           r.id,
      date:         r.request_date,
      dayShort:     r.day_short || '',
      workType:     r.work_type || '在宅勤務',
      notes:        r.notes    || '',
      status:       r.status,
      redmineTasks: [],
      approvals:    [],
    };
    try { dayTask.redmineTasks = JSON.parse(r.redmine_tasks || '[]'); } catch (e) {}
    dayTask.approvals = getApprovalsByReport(r.id);
    weekMap[key].tasks.push(dayTask);
  });

  var weeks = Object.keys(weekMap).map(function(k) {
    var wk = weekMap[k];
    var statuses = wk.tasks.map(function(t) { return t.status || 'submitted'; });
    if (statuses.every(function(s) { return s === 'approved'; }))     wk.status = 'approved';
    else if (statuses.some(function(s) { return s === 'rejected'; })) wk.status = 'rejected';
    else if (statuses.some(function(s) { return s === 'reviewed'; })) wk.status = 'reviewed';
    else                                                                wk.status = 'submitted';
    return wk;
  });

  // 部署フィルタリング
  var filtered = weeks.filter(function(w) {
    if (user.role === 'admin') return true;
    if (filteredDeptIds.length === 0 || w.employee_department_ids.length === 0) return false;
    return filteredDeptIds.some(function(d) {
      return w.employee_department_ids.indexOf(d) !== -1;
    });
  });

  filtered.sort(function(a, b) {
    return new Date(b.start_date).getTime() - new Date(a.start_date).getTime();
  });
  return filtered;
}

// 照査アクション（週単位一括）: submitted → reviewed
function reviewWeekReport(dayIds, comment) {
  var user = getCurrentUser();
  if (!user) return { error: 'Unauthorized' };
  if (!dayIds || dayIds.length === 0) return { error: '申請日が見つかりません' };
  if (user.role !== 'reviewer' && user.role !== 'manager' && user.role !== 'admin') {
    return { error: '照査権限がありません' };
  }

  var allReports = getAllReports();
  var firstReport = null;
  var employee    = null;

  for (var i = 0; i < dayIds.length; i++) {
    var report = allReports.find(function(r) { return r.id === dayIds[i]; });
    if (!report) continue;
    if (!firstReport) { firstReport = report; employee = getUserById(report.employee_id); }
    decideApproval(dayIds[i], 1, 'approved', comment);
    updateReportStatus(dayIds[i], 'reviewed');
  }

  // 週単位で1回だけ通知を送る
  if (firstReport && employee) {
    _sendReportNotification('telework', firstReport, employee, user, 'reviewed', '?page=reports');
  }
  // 更新後の保留リストをレスポンスに含めてクライアントの追加取得を省く
  return {
    success: true,
    pendingReports:     getPendingReports(),
    pendingTaskReports: getPendingTaskReports()
  };
}

// 承認アクション（週単位一括）: reviewed → approved
function approveWeekReport(dayIds, comment) {
  var user = getCurrentUser();
  if (!user) return { error: 'Unauthorized' };
  if (!dayIds || dayIds.length === 0) return { error: '申請日が見つかりません' };
  if (user.role !== 'manager' && user.role !== 'admin') {
    return { error: '承認権限がありません。照査のみ可能です。' };
  }

  var allReports = getAllReports();
  var firstReport = null;
  var employee    = null;

  for (var i = 0; i < dayIds.length; i++) {
    var report = allReports.find(function(r) { return r.id === dayIds[i]; });
    if (!report) continue;
    if (!firstReport) { firstReport = report; employee = getUserById(report.employee_id); }
    decideApproval(dayIds[i], 2, 'approved', comment);
    updateReportStatus(dayIds[i], 'approved');
  }

  if (firstReport && employee) {
    _sendReportNotification('telework', firstReport, employee, user, 'approved', '?page=reports');
  }
  // 更新後の保留リストをレスポンスに含めてクライアントの追加取得を省く
  return {
    success: true,
    pendingReports:     getPendingReports(),
    pendingTaskReports: getPendingTaskReports()
  };
}

// 差戻しアクション（週単位一括）: submitted/reviewed → rejected
function rejectWeekReport(dayIds, comment) {
  var user = getCurrentUser();
  if (!user) return { error: 'Unauthorized' };
  if (!dayIds || dayIds.length === 0) return { error: '申請日が見つかりません' };

  var allReports = getAllReports();
  var level       = (user.role === 'reviewer') ? 1 : 2;
  var firstReport = null;
  var employee    = null;

  for (var i = 0; i < dayIds.length; i++) {
    var report = allReports.find(function(r) { return r.id === dayIds[i]; });
    if (!report) continue;
    if (!firstReport) { firstReport = report; employee = getUserById(report.employee_id); }
    decideApproval(dayIds[i], level, 'rejected', comment);
    updateReportStatus(dayIds[i], 'rejected');
  }

  if (firstReport && employee) {
    _sendReportNotification('telework', firstReport, employee, user, 'rejected', '?page=reports');
  }
  // 更新後の保留リストをレスポンスに含めてクライアントの追加取得を省く
  return {
    success: true,
    pendingReports:     getPendingReports(),
    pendingTaskReports: getPendingTaskReports()
  };
}

// 単一日の照査（主に管理者用の個別操作）
function reviewReportAction(reportId, comment) {
  var user = getCurrentUser();
  if (!user) return { error: 'Unauthorized' };
  var report = getAllReports().find(function(r) { return r.id === reportId; });
  if (!report) return { error: 'レポートが見つかりません' };
  if (user.role !== 'reviewer' && user.role !== 'manager' && user.role !== 'admin') {
    return { error: '照査権限がありません' };
  }
  decideApproval(reportId, 1, 'approved', comment);
  updateReportStatus(reportId, 'reviewed');
  return { success: true };
}

// 単一日の最終承認
function approveReportAction(reportId, comment) {
  var user = getCurrentUser();
  if (!user) return { error: 'Unauthorized' };
  var report = getAllReports().find(function(r) { return r.id === reportId; });
  if (!report) return { error: 'レポートが見つかりません' };
  if (user.role !== 'manager' && user.role !== 'admin') {
    return { error: '承認権限がありません。照査のみ可能です。' };
  }
  decideApproval(reportId, 2, 'approved', comment);
  updateReportStatus(reportId, 'approved');
  return { success: true };
}

// 単一日の差戻し
function rejectReportAction(reportId, comment) {
  var user = getCurrentUser();
  if (!user) return { error: 'Unauthorized' };
  var report = getAllReports().find(function(r) { return r.id === reportId; });
  if (!report) return { error: 'レポートが見つかりません' };
  var level = (user.role === 'reviewer') ? 1 : 2;
  decideApproval(reportId, level, 'rejected', comment);
  updateReportStatus(reportId, 'rejected');
  return { success: true };
}

// ── 削除・取り下げ ────────────────────────────────────────────

// 在宅勤務申請を削除する（下書き・差戻しのみ可能）
function deleteTeleworkDay(payload) {
  return _withLock('deleteTeleworkDay', function() {
    var user = getCurrentUser();
    if (!user) return { error: 'Unauthorized' };
    if (!payload || !payload.date || !payload.startDate || !payload.endDate) {
      return { error: 'データが不足しています' };
    }

    var sheet     = getSheet(SHEET_REPORTS);
    var data      = sheet.getDataRange().getValues();
    var empCol    = REPORT_H.indexOf('employee_id');
    var reqCol    = REPORT_H.indexOf('request_date');
    var startCol  = REPORT_H.indexOf('start_date');
    var endCol    = REPORT_H.indexOf('end_date');
    var statusCol = REPORT_H.indexOf('status');
    var idCol     = REPORT_H.indexOf('id');

    var targetRow = -1;
    var targetId  = null;
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][empCol])     === String(user.id) &&
          _dateStr(data[i][reqCol])   === String(payload.date) &&
          _dateStr(data[i][startCol]) === String(payload.startDate) &&
          _dateStr(data[i][endCol])   === String(payload.endDate)) {
        var status = String(data[i][statusCol]);
        if (status === 'draft' || status === 'rejected') {
          targetRow = i;
          targetId  = String(data[i][idCol]);
          break;
        }
        return { error: 'このステータスの申請は削除できません: ' + status };
      }
    }

    if (targetRow === -1) return { error: 'レコードが見つかりません' };

    sheet.deleteRow(targetRow + 1);
    _deleteAssociatedApprovals(targetId);
    _invalidateCache(CACHE_KEY_REPORTS);
    return { success: true, message: '削除しました' };
  });
}

// 提出済み申請を取り下げる（submitted のみ可能）
function withdrawTeleworkDay(payload) {
  return _withLock('withdrawTeleworkDay', function() {
    var user = getCurrentUser();
    if (!user) return { error: 'Unauthorized' };
    if (!payload || !payload.date || !payload.startDate || !payload.endDate) {
      return { error: 'データが不足しています' };
    }

    var sheet     = getSheet(SHEET_REPORTS);
    var data      = sheet.getDataRange().getValues();
    var empCol    = REPORT_H.indexOf('employee_id');
    var reqCol    = REPORT_H.indexOf('request_date');
    var startCol  = REPORT_H.indexOf('start_date');
    var endCol    = REPORT_H.indexOf('end_date');
    var statusCol = REPORT_H.indexOf('status');
    var idCol     = REPORT_H.indexOf('id');

    var targetRow = -1;
    var targetId  = null;
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][empCol])     === String(user.id) &&
          _dateStr(data[i][reqCol])   === String(payload.date) &&
          _dateStr(data[i][startCol]) === String(payload.startDate) &&
          _dateStr(data[i][endCol])   === String(payload.endDate)) {
        if (String(data[i][statusCol]) === 'submitted') {
          targetRow = i;
          targetId  = String(data[i][idCol]);
          break;
        }
        return { error: 'この申請は取り下げできません（ステータス: ' + String(data[i][statusCol]) + '）' };
      }
    }

    if (targetRow === -1) return { error: 'レコードが見つかりません' };

    sheet.getRange(targetRow + 1, statusCol + 1).setValue('draft');
    _deleteAssociatedApprovals(targetId);
    _invalidateCache(CACHE_KEY_REPORTS);
    return { success: true, message: '取り下げしました' };
  });
}

// ── プライベートヘルパー ──────────────────────────────────────

// 指定ユーザーの部署に所属する承認者（reviewer/manager）を検索する
// 子部署のみを対象にする（親部署で担当する承認者は除外）
function _findApproverByRole(user, role) {
  var emp = getUserById(user.id);
  if (!emp || !emp.department_id) return null;

  var empDeptIds = _parseDeptIds(emp.department_id);
  var allUsers   = getAllUsers();
  var allDepts   = getAllDepartments();

  return allUsers.find(function(u) {
    if (u.role !== role || !u.is_active || !u.department_id) return false;
    var approverDeptIds = _parseDeptIds(u.department_id);
    return empDeptIds.some(function(empDept) {
      if (approverDeptIds.indexOf(empDept) === -1) return false;
      // 子部署かどうかを確認（parent_department が設定されているもの）
      var dept = allDepts.find(function(d) { return d.id === empDept; });
      return dept && dept.parent_department && dept.parent_department.trim() !== '';
    });
  });
}

// 報告書 ID に紐づく承認レコードを削除する
function _deleteAssociatedApprovals(reportId) {
  var approvals = getApprovalsByReport(reportId);
  approvals.forEach(function(a) { _deleteRowById(SHEET_APPROVALS, a.id); });
  _invalidateCache(CACHE_KEY_APPROVALS);
  _invalidateApprovalMap();
}

// Mattermost 通知を送信する（失敗しても承認処理は継続）
function _sendReportNotification(reportType, report, employee, approver, decision, pageParam) {
  try {
    var notificationData = {
      reportType:         reportType,
      reportDate:         report.start_date || report.report_date,
      weekTitle:          report.week_title || '',
      employeeName:       employee.name,
      employeeEmail:      employee.email,
      mattermostUsername: employee.mattermost_username || null,
      approverName:       approver.name,
      decision:           decision,
      reportUrl:          ScriptApp.getService().getUrl() + pageParam,
    };
    sendMattermostMessage(notificationData, 'daily-report');
  } catch (e) {
    Logger.log('Mattermost通知エラー: ' + e.message);
  }
}
