// =============================================================================
// Sheets_Approvals.gs — 承認・照査管理
// 承認レコードの取得・作成・決裁などの関数を定義する
// =============================================================================

// 承認テーブルのカラム定義
var APPROVAL_H = ['id', 'report_id', 'approver_id', 'level', 'decision', 'comment', 'decided_at', 'created_at'];

// ── 基本 CRUD ─────────────────────────────────────────────────

// 全承認レコードをキャッシュ経由で取得する
function getAllApprovals() {
  return _getCachedData(CACHE_KEY_APPROVALS, function() {
    return _sheetToObjects(getSheet(SHEET_APPROVALS));
  });
}

// 報告書 ID に紐づく承認レコードを取得する（O(1) ルックアップ）
function getApprovalsByReport(reportId) {
  return getApprovalsByReportFast(reportId);
}

// 承認レコードを新規作成する（決裁待ち状態で登録）
// level: 1 = 照査 (reviewer)、2 = 承認 (manager)
function createApproval(reportId, approverId, level) {
  var a = {
    id:          _uuid(),
    report_id:   reportId,
    approver_id: approverId,
    level:       level,
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

// 指定報告書・レベルの承認を決裁する（承認/差戻し）
// 対象レコードが存在しない場合は新規作成してから更新する
function decideApproval(reportId, level, decision, comment) {
  var approvals = getAllApprovals();
  var target = approvals.find(function(a) {
    return a.report_id === reportId && String(a.level) === String(level);
  });

  if (target) {
    var result = _updateRow(SHEET_APPROVALS, target.id, {
      decision:   decision,
      comment:    comment || '',
      decided_at: _now(),
    }, APPROVAL_H);
    _invalidateCache(CACHE_KEY_APPROVALS);
    _invalidateApprovalMap();
    return result;
  }

  // レコードが存在しない場合は新規作成
  var approverId = getCurrentUser() ? getCurrentUser().id : '';
  var a = createApproval(reportId, approverId, level);
  var result = _updateRow(SHEET_APPROVALS, a.id, {
    decision:   decision,
    comment:    comment || '',
    decided_at: _now(),
  }, APPROVAL_H);
  _invalidateCache(CACHE_KEY_APPROVALS);
  _invalidateApprovalMap();
  return result;
}
