// =============================================================================
// Sheets_TaskReports.gs — 日報管理
// 日報の取得・下書き保存・提出・承認・差戻し・削除などを定義する
// =============================================================================

// 日報テーブルのカラム定義
var TASK_REPORT_H = ['id', 'employee_id', 'report_date', 'day_short', 'important_issues', 'next_day_plan', 'redmine_tasks', 'status', 'created_at', 'updated_at'];

// ── 基本 CRUD ─────────────────────────────────────────────────

// 全日報をキャッシュ経由で取得する
function getAllTaskReports() {
  return _getCachedData(CACHE_KEY_TASK_REPORTS, function() {
    return _sheetToObjects(getSheet(SHEET_TASK_REPORTS));
  });
}

// 従業員 ID で日報を絞り込む
function getTaskReportsByEmployee(employeeId) {
  return getAllTaskReports().filter(function(r) { return r.employee_id === employeeId; });
}

// ── クライアント向け API — 従業員 ────────────────────────────

// ログインユーザーの日報一覧を返す
function getMyTaskReports() {
  var user = getCurrentUser();
  if (!user) return { error: 'Unauthorized' };

  return getTaskReportsByEmployee(user.id).map(function(r) {
    var redmineTasks = [];
    try { redmineTasks = JSON.parse(r.redmine_tasks || '[]'); } catch (e) {}
    return {
      id:               r.id,
      report_date:      r.report_date,
      day_short:        r.day_short,
      important_issues: r.important_issues || '',
      next_day_plan:    r.next_day_plan    || '',
      redmineTasks:     redmineTasks,
      status:           r.status,
      approvals:        getApprovalsByReport(r.id),
      created_at:       r.created_at,
      updated_at:       r.updated_at,
    };
  });
}

// 1日分の日報を下書き保存する（既存レコードがあれば更新、なければ新規作成）
// payload: { date, dayShort, importantIssues, nextDayPlan, redmineTasks }
function saveTaskReportDraft(payload) {
  var user = getCurrentUser();
  if (!user) return { error: 'Unauthorized' };
  if (!payload || !payload.date) return { error: 'データが不足しています' };

  var sheet     = getSheet(SHEET_TASK_REPORTS);
  var data      = sheet.getDataRange().getValues();
  var empCol    = TASK_REPORT_H.indexOf('employee_id');
  var dateCol   = TASK_REPORT_H.indexOf('report_date');
  var statusCol = TASK_REPORT_H.indexOf('status');

  var existingRow = -1;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][empCol])  === String(user.id) &&
        _dateStr(data[i][dateCol]) === String(payload.date)) {
      existingRow = i;
      break;
    }
  }

  var existingId     = existingRow > -1 ? String(data[existingRow][TASK_REPORT_H.indexOf('id')]) : null;
  var existingStatus = existingRow > -1 ? String(data[existingRow][statusCol]) : null;

  // 申請済みレコードは上書き不可
  if (existingStatus && existingStatus !== 'draft' && existingStatus !== 'rejected') {
    return { error: 'すでに申請済みのため上書きできません', status: existingStatus };
  }

  var updates = {
    day_short:        payload.dayShort       || '',
    important_issues: payload.importantIssues || '',
    next_day_plan:    payload.nextDayPlan     || '',
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
      day_short:        payload.dayShort       || '',
      important_issues: payload.importantIssues || '',
      next_day_plan:    payload.nextDayPlan     || '',
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

// 1日分の日報を提出する（排他ロックで二重送信を防止）
function submitTaskReport(payload) {
  return _withLock('submitTaskReport', function() {
    return _submitTaskReportImpl(payload);
  });
}

// submitTaskReport の実装本体
function _submitTaskReportImpl(payload) {
  var user = getCurrentUser();
  if (!user) return { error: 'Unauthorized' };
  if (!payload || !payload.date) return { error: 'データが不足しています' };

  // 二重送信チェック
  var duplicate = _checkDuplicateSubmission(
    SHEET_TASK_REPORTS,
    { employee_id: user.id, report_date: payload.date },
    TASK_REPORT_H,
    ['draft', 'rejected']
  );
  if (duplicate) return { error: 'この日報は既に申請済みです', status: duplicate.status };

  var sheet     = getSheet(SHEET_TASK_REPORTS);
  var data      = sheet.getDataRange().getValues();
  var empCol    = TASK_REPORT_H.indexOf('employee_id');
  var dateCol   = TASK_REPORT_H.indexOf('report_date');
  var statusCol = TASK_REPORT_H.indexOf('status');
  var idCol     = TASK_REPORT_H.indexOf('id');

  var existingRow = -1;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][empCol])    === String(user.id) &&
        _dateStr(data[i][dateCol]) === String(payload.date)) {
      existingRow = i;
      break;
    }
  }

  if (existingRow < 0)  return { error: '先に下書き保存してください' };
  var existingId     = String(data[existingRow][idCol]);
  var existingStatus = String(data[existingRow][statusCol]);
  if (existingStatus !== 'draft') return { error: 'この日報は既に申請済みです', status: existingStatus };

  _updateRow(SHEET_TASK_REPORTS, existingId, { status: 'submitted', updated_at: _now() }, TASK_REPORT_H);
  _invalidateCache(CACHE_KEY_TASK_REPORTS);

  // 承認レコードを作成する
  var reviewer = _findApproverByRole(user, 'reviewer');
  var manager  = _findApproverByRole(user, 'manager');
  var existingApprovals = getApprovalsByReport(existingId);
  if (existingApprovals.length === 0) {
    if (reviewer) createApproval(existingId, reviewer.id, 1);
    if (manager)  createApproval(existingId, manager.id,  2);
  }

  return { success: true, status: 'submitted', id: existingId };
}

// ── クライアント向け API — 照査・承認者 ──────────────────────

// 照査・承認待ちの日報一覧を返す（部署フィルタあり）
function getPendingTaskReports() {
  var user = getCurrentUser();
  if (!user) return { error: 'Unauthorized' };

  var userDeptIds     = _parseDeptIds(user.department_id);
  var filteredDeptIds = (user.role === 'reviewer' || user.role === 'manager')
    ? getChildDepartmentsOnly(userDeptIds)
    : userDeptIds;

  var allDepts = getAllDepartments();
  var allTR    = getAllTaskReports().filter(function(r) {
    return r.status === 'submitted' || r.status === 'reviewed';
  });

  var mapped = allTR.map(function(r) {
    var emp        = getUserById(r.employee_id);
    var empDeptIds = _parseDeptIds(emp ? emp.department_id : '');
    var deptNames  = empDeptIds.map(function(id) {
      var d = allDepts.find(function(dept) { return dept.id === id; });
      return d ? d.name : null;
    }).filter(Boolean);

    var redmineTasks = [];
    try { redmineTasks = JSON.parse(r.redmine_tasks || '[]'); } catch (e) {}

    return {
      id:                      r.id,
      employee_id:             r.employee_id,
      employee_department_ids: empDeptIds,
      report_date:             r.report_date,
      day_short:               r.day_short,
      important_issues:        r.important_issues || '',
      next_day_plan:           r.next_day_plan    || '',
      redmineTasks:            redmineTasks,
      status:                  r.status,
      created_at:              r.created_at,
      employee_name:           emp ? emp.name : '不明',
      employee_department:     deptNames.length > 0 ? deptNames.join(', ') : '未設定',
      approvals:               getApprovalsByReport(r.id),
    };
  });

  // 部署フィルタリング
  return mapped.filter(function(r) {
    if (user.role === 'admin') return true;
    if (filteredDeptIds.length === 0 || r.employee_department_ids.length === 0) return false;
    return filteredDeptIds.some(function(d) {
      return r.employee_department_ids.indexOf(d) !== -1;
    });
  });
}

// 日報の照査（submitted → reviewed）
function reviewTaskReportAction(reportId, comment) {
  // 書き込みはロック内で実行
  var result = _withLock('reviewTaskReport_' + reportId, function() {
    var user = getCurrentUser();
    if (!user) return { error: 'Unauthorized' };

    var report = getAllTaskReports().find(function(r) { return r.id === reportId; });
    if (!report) return { error: 'レポートが見つかりません' };
    if (report.status !== 'submitted') return { error: 'この日報は既に処理済みです', status: report.status };
    if (user.role !== 'reviewer' && user.role !== 'manager' && user.role !== 'admin') {
      return { error: '照査権限がありません' };
    }

    decideApproval(reportId, 1, 'approved', comment);
    _updateRow(SHEET_TASK_REPORTS, reportId, { status: 'reviewed', updated_at: _now() }, TASK_REPORT_H);
    _invalidateCache(CACHE_KEY_TASK_REPORTS);

    _sendReportNotification('task', reportId, report.employee_id, user.id, 'reviewed', '?page=task_report');

    return { success: true };
  });
  // エラー時は即座に返す
  if (!result || result.error) return result;
  // ロック解放後に保留リストを取得してレスポンスに含める（クライアントの追加取得を省く）
  result.pendingReports     = getPendingReports();
  result.pendingTaskReports = getPendingTaskReports();
  return result;
}

// 日報の最終承認（reviewed → approved）
function approveTaskReportAction(reportId, comment) {
  var result = _withLock('approveTaskReport_' + reportId, function() {
    var user = getCurrentUser();
    if (!user) return { error: 'Unauthorized' };

    var report = getAllTaskReports().find(function(r) { return r.id === reportId; });
    if (!report) return { error: 'レポートが見つかりません' };
    if (report.status === 'approved') return { error: 'この日報は既に承認済みです', status: report.status };
    if (user.role !== 'manager' && user.role !== 'admin') {
      return { error: '承認権限がありません。照査のみ可能です。' };
    }

    decideApproval(reportId, 2, 'approved', comment);
    _updateRow(SHEET_TASK_REPORTS, reportId, { status: 'approved', updated_at: _now() }, TASK_REPORT_H);
    _invalidateCache(CACHE_KEY_TASK_REPORTS);

    _sendReportNotification('task', reportId, report.employee_id, user.id, 'approved', '?page=task_report');

    return { success: true };
  });
  if (!result || result.error) return result;
  result.pendingReports     = getPendingReports();
  result.pendingTaskReports = getPendingTaskReports();
  return result;
}

// 日報の差戻し（submitted/reviewed → rejected）
function rejectTaskReportAction(reportId, comment) {
  var result = _withLock('rejectTaskReport_' + reportId, function() {
    var user = getCurrentUser();
    if (!user) return { error: 'Unauthorized' };

    var report = getAllTaskReports().find(function(r) { return r.id === reportId; });
    if (!report) return { error: 'レポートが見つかりません' };
    if (report.status === 'rejected') return { error: 'この日報は既に差戻し済みです', status: report.status };

    var level = (user.role === 'reviewer') ? 1 : 2;
    decideApproval(reportId, level, 'rejected', comment);
    _updateRow(SHEET_TASK_REPORTS, reportId, { status: 'rejected', updated_at: _now() }, TASK_REPORT_H);
    _invalidateCache(CACHE_KEY_TASK_REPORTS);

    _sendReportNotification('task', reportId, report.employee_id, user.id, 'rejected', '?page=task_report');

    return { success: true };
  });
  if (!result || result.error) return result;
  result.pendingReports     = getPendingReports();
  result.pendingTaskReports = getPendingTaskReports();
  return result;
}

// ── 削除・取り下げ ────────────────────────────────────────────

// 日報を削除する（下書き・差戻しのみ可能）
function deleteTaskDay(dateStr) {
  return _withLock('deleteTaskDay', function() {
    var user = getCurrentUser();
    if (!user) return { error: 'Unauthorized' };
    if (!dateStr) return { error: 'データが不足しています' };

    var sheet     = getSheet(SHEET_TASK_REPORTS);
    var data      = sheet.getDataRange().getValues();
    var empCol    = TASK_REPORT_H.indexOf('employee_id');
    var dateCol   = TASK_REPORT_H.indexOf('report_date');
    var statusCol = TASK_REPORT_H.indexOf('status');
    var idCol     = TASK_REPORT_H.indexOf('id');

    var targetRow = -1;
    var targetId  = null;
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][empCol])    === String(user.id) &&
          _dateStr(data[i][dateCol]) === String(dateStr)) {
        var status = String(data[i][statusCol]);
        if (status === 'draft' || status === 'rejected') {
          targetRow = i;
          targetId  = String(data[i][idCol]);
          break;
        }
        return { error: 'このステータスの日報は削除できません: ' + status };
      }
    }

    if (targetRow === -1) return { error: 'レコードが見つかりません' };

    sheet.deleteRow(targetRow + 1);
    _deleteAssociatedApprovals(targetId);
    _invalidateCache(CACHE_KEY_TASK_REPORTS);
    return { success: true, message: '削除しました' };
  });
}

// 提出済み日報を取り下げる（submitted のみ可能）
function withdrawTaskReport(dateStr) {
  return _withLock('withdrawTaskReport', function() {
    var user = getCurrentUser();
    if (!user) return { error: 'Unauthorized' };
    if (!dateStr) return { error: 'データが不足しています' };

    var sheet     = getSheet(SHEET_TASK_REPORTS);
    var data      = sheet.getDataRange().getValues();
    var empCol    = TASK_REPORT_H.indexOf('employee_id');
    var dateCol   = TASK_REPORT_H.indexOf('report_date');
    var statusCol = TASK_REPORT_H.indexOf('status');
    var idCol     = TASK_REPORT_H.indexOf('id');

    var targetRow = -1;
    var targetId  = null;
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][empCol])    === String(user.id) &&
          _dateStr(data[i][dateCol]) === String(dateStr)) {
        if (String(data[i][statusCol]) === 'submitted') {
          targetRow = i;
          targetId  = String(data[i][idCol]);
          break;
        }
        return { error: 'この日報は取り下げできません（ステータス: ' + String(data[i][statusCol]) + '）' };
      }
    }

    if (targetRow === -1) return { error: 'レコードが見つかりません' };

    // ステータスを 'draft' に変更（レコードは削除しない）
    sheet.getRange(targetRow + 1, statusCol + 1).setValue('draft');
    _deleteAssociatedApprovals(targetId);
    _invalidateCache(CACHE_KEY_TASK_REPORTS);
    return { success: true, message: '取り下げしました' };
  });
}
