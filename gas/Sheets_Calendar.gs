// =============================================================================
// Sheets_Calendar.gs — チームカレンダー
// チームカレンダー表示用のデータ取得・部署フィルタなどを定義する
// =============================================================================

// カレンダー表示用: 部署フィルタを適用した在宅勤務申請一覧を返す
// admin: 全員表示 / reviewer・manager・employee: 自分の子部署のみ
function getTeamCalendarData() {
  var user = getCurrentUser();
  if (!user) return { error: 'Unauthorized' };

  var reports = getAllReports();
  var users   = getAllUsers();
  var depts   = getAllDepartments();

  // ログインユーザーの部署 ID を取得
  var currentEmp = users.find(function(u) { return u.id === user.id; });
  var userDeptIds = _parseDeptIds(currentEmp ? currentEmp.department_id : '');

  // admin 以外は子部署のみを対象にする
  var filteredDeptIds = (user.role === 'admin')
    ? userDeptIds
    : getChildDepartmentsOnly(userDeptIds);

  return reports
    .filter(function(r) { return r.status && r.status !== 'draft'; })
    .filter(function(r) {
      if (user.role === 'admin') return true;

      var emp = users.find(function(u) { return u.id === r.employee_id; });
      if (!emp || !emp.department_id) return false;

      var empDeptIds = _parseDeptIds(emp.department_id);
      return filteredDeptIds.some(function(d) {
        return empDeptIds.indexOf(d) !== -1;
      });
    })
    .map(function(r) {
      var emp = users.find(function(u) { return u.id === r.employee_id; }) || null;

      // 従業員の部署名を解決する
      var deptNames = [];
      if (emp && emp.department_id) {
        var empDeptIds = _parseDeptIds(emp.department_id);
        deptNames = empDeptIds.map(function(id) {
          var d = depts.find(function(dept) { return dept.id === id; });
          return d ? d.name : null;
        }).filter(Boolean);
      }

      return {
        id:            r.id,
        employee_name: emp ? emp.name : '不明',
        department:    deptNames.length > 0 ? deptNames.join(', ') : '未設定',
        department_id: emp ? (emp.department_id || '') : '',
        request_date:  r.request_date || '',
        work_type:     r.work_type    || '在宅勤務',
        day_short:     r.day_short    || '',
        status:        r.status       || '',
      };
    });
}

// カレンダーの部署フィルタ用ドロップダウン向けに部署一覧を返す
// admin: 全部署 / reviewer・manager: 担当子部署 / employee: 空配列
function getTeamCalendarDepartments() {
  var user = getCurrentUser();
  if (!user) return { error: 'Unauthorized' };

  var depts = getAllDepartments();

  if (user.role === 'admin') {
    return depts.map(function(d) { return { id: d.id, name: d.name }; });
  }

  if (user.role === 'manager' || user.role === 'reviewer') {
    var userDeptIds  = _parseDeptIds(user.department_id);
    var childDeptIds = getChildDepartmentsOnly(userDeptIds);
    return depts
      .filter(function(d) { return childDeptIds.indexOf(d.id) !== -1; })
      .map(function(d) { return { id: d.id, name: d.name }; });
  }

  return [];
}
