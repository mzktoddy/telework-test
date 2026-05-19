// =============================================================================
// Sheets_Departments.gs — 部署管理
// 部署の取得・作成・フィルタリングなどの関数を定義する
// =============================================================================

// 部署テーブルのカラム定義
var DEPT_H = ['id', 'name', 'parent_department', 'created_at'];

// ── 基本 CRUD ─────────────────────────────────────────────────

// 全部署をキャッシュ経由で取得する
function getAllDepartments() {
  return _getCachedData(CACHE_KEY_DEPARTMENTS, function() {
    return _sheetToObjects(getSheet(SHEET_DEPARTMENTS));
  });
}

// ID で部署を取得する（O(1) ルックアップ）
function getDepartmentById(id) {
  return getDepartmentByIdFast(id);
}

// 新しい部署を作成する
function createDepartment(name, parentDepartmentId) {
  var d = {
    id:                _uuid(),
    name:              name,
    parent_department: parentDepartmentId || '',
    created_at:        _now(),
  };
  _appendRow(SHEET_DEPARTMENTS, d, DEPT_H);
  _invalidateCache(CACHE_KEY_DEPARTMENTS);
  return d;
}

// ── フィルタリングヘルパー ────────────────────────────────────

// 指定 ID リストのうち「子部署」のみを返す
// 親部署（parent_department が空）は除外される
function getChildDepartmentsOnly(departmentIds) {
  if (!departmentIds || departmentIds.length === 0) return [];
  var allDepts = getAllDepartments();
  return departmentIds.filter(function(deptId) {
    var dept = allDepts.find(function(d) { return d.id === deptId; });
    return dept && dept.parent_department && dept.parent_department.trim() !== '';
  });
}

// ── クライアント向け API ──────────────────────────────────────

// 部署一覧を返す（主に社員編集フォームで使用）
function getDepartmentList() {
  return getAllDepartments();
}

// 承認画面向けに、ログインユーザーが参照可能な部署一覧を返す
// admin: 全部署 / reviewer・manager: 自分の子部署のみ / employee: 空配列
function getApproveDepartments() {
  var user = getCurrentUser();
  if (!user) return { error: 'Unauthorized' };
  var depts = getAllDepartments();

  if (user.role === 'admin') {
    return depts.map(function(d) { return { id: d.id, name: d.name }; });
  }

  if (user.role === 'reviewer' || user.role === 'manager') {
    var userDeptIds = _parseDeptIds(user.department_id);
    var childDeptIds = getChildDepartmentsOnly(userDeptIds);
    return depts
      .filter(function(d) { return childDeptIds.indexOf(d.id) !== -1; })
      .map(function(d) { return { id: d.id, name: d.name }; });
  }

  return [];
}

// ── プライベートヘルパー ──────────────────────────────────────

// department_id フィールド（文字列または JSON 配列）を ID 配列に変換する
function _parseDeptIds(departmentId) {
  if (!departmentId || !departmentId.trim()) return [];
  try {
    var parsed = JSON.parse(departmentId);
    return Array.isArray(parsed) ? parsed : [departmentId];
  } catch (e) {
    return [departmentId];
  }
}
