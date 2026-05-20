// =============================================================================
// Sheets_Users.gs — ユーザー・従業員管理
// ユーザーの取得・作成・更新・有効化/無効化などの関数を定義する
// =============================================================================

// ユーザーテーブルのカラム定義
var USER_H = ['id', 'email', 'password_hash', 'name', 'role', 'department_id', 'is_active', 'created_at', 'updated_at', 'mattermost_username'];

// ── 基本 CRUD ─────────────────────────────────────────────────

// 全ユーザーをキャッシュ経由で取得する（is_active を真偽値に正規化）
function getAllUsers() {
  return _getCachedData(CACHE_KEY_USERS, function() {
    return _sheetToObjects(getSheet(SHEET_USERS)).map(function(u) {
      u.is_active = (u.is_active === true || u.is_active === 'TRUE' || u.is_active === 1);
      return u;
    });
  });
}

// メールアドレスでユーザーを取得する（O(1) ルックアップ）
function getUserByEmail(email) {
  return getUserByEmailFast(email);
}

// ID でユーザーを取得する（O(1) ルックアップ）
function getUserById(id) {
  return getUserByIdFast(id);
}

// 指定部署に所属するユーザーを返す（複数部署 JSON 配列にも対応）
function getUsersByDepartment(departmentId) {
  if (!departmentId) return [];
  return getAllUsers().filter(function(u) {
    if (!u.department_id) return false;
    try {
      var deptIds = JSON.parse(u.department_id);
      return Array.isArray(deptIds) && deptIds.indexOf(departmentId) >= 0;
    } catch (e) {
      return String(u.department_id) === String(departmentId);
    }
  });
}

// 複数部署のいずれかに所属するユーザーを重複なく返す
function getUsersByDepartments(departmentIds) {
  if (!departmentIds || departmentIds.length === 0) return [];
  var allUsers = getAllUsers();
  var userMap  = {};

  departmentIds.forEach(function(deptId) {
    allUsers.forEach(function(u) {
      if (!u.department_id) return;
      try {
        var userDeptIds = JSON.parse(u.department_id);
        if (Array.isArray(userDeptIds) && userDeptIds.indexOf(deptId) >= 0) {
          userMap[u.id] = u;
        }
      } catch (e) {
        if (String(u.department_id) === String(deptId)) userMap[u.id] = u;
      }
    });
  });

  var result = [];
  for (var id in userMap) { result.push(userMap[id]); }
  return result;
}

// 新しいユーザーを作成する
// departmentIds: ID の配列または単一 ID 文字列
function createUser(name, email, role, departmentIds, plainPassword, mattermostUsername) {
  var deptIdStr = '';
  if (Array.isArray(departmentIds)) {
    deptIdStr = JSON.stringify(departmentIds);
  } else if (departmentIds) {
    deptIdStr = departmentIds;
  }

  var u = {
    id:                  _generateUserId(),
    email:               email,
    password_hash:       plainPassword ? hashPassword(plainPassword) : 'GWS_AUTH_ONLY',
    name:                name,
    role:                role,
    department_id:       deptIdStr,
    is_active:           true,
    created_at:          _now(),
    updated_at:          _now(),
    mattermost_username: mattermostUsername || '',
  };
  _appendRow(SHEET_USERS, u, USER_H);
  _invalidateCache(CACHE_KEY_USERS);
  return u;
}

// ユーザーの有効/無効状態を更新する
function setUserActive(userId, active) {
  var result = _updateRow(SHEET_USERS, userId, { is_active: active, updated_at: _now() }, USER_H);
  _invalidateCache(CACHE_KEY_USERS);
  return result;
}

// ── クライアント向け API ──────────────────────────────────────

// 管理者向け: 全従業員の詳細一覧を返す（部署名を解決して付与）
function getAllEmployees() {
  var user = getCurrentUser();
  if (!user || user.role !== 'admin') return { error: 'Unauthorized' };
  var allDepts = getAllDepartments();

  return getAllUsers().map(function(u) {
    var deptIds   = _parseDeptIds(u.department_id);
    var deptNames = deptIds.map(function(id) {
      var dept = allDepts.find(function(d) { return d.id === id; });
      return dept ? dept.name : null;
    }).filter(Boolean);

    return {
      id:                  u.id,
      name:                u.name,
      email:               u.email,
      role:                u.role,
      departments:         deptNames,
      is_active:           u.is_active,
      created_at:          u.created_at,
      mattermost_username: u.mattermost_username || '',
      has_password:        u.password_hash && u.password_hash !== 'GWS_AUTH_ONLY',
    };
  });
}

// 管理者向け: 新規従業員を追加する
function addEmployee(data) {
  var user = getCurrentUser();
  if (!user || user.role !== 'admin') return { error: 'Unauthorized' };

  var allDepts = getAllDepartments();
  var deptIds  = [];

  if (data.departments && Array.isArray(data.departments)) {
    data.departments.forEach(function(deptName) {
      var dept = allDepts.find(function(d) { return d.name === deptName; });
      if (dept) deptIds.push(dept.id);
    });
  } else if (data.department) {
    // 後方互換: 単一部署名
    var dept = allDepts.find(function(d) { return d.name === data.department; });
    if (dept) deptIds.push(dept.id);
  }

  var newUser = createUser(data.name, data.email, data.role, deptIds, data.password || '', data.mattermostUsername || '');
  return { success: true, user: newUser };
}

// 管理者向け: 従業員情報を更新する
function updateEmployee(data) {
  var user = getCurrentUser();
  if (!user || user.role !== 'admin') return { error: 'Unauthorized' };

  if (!data.id || !data.name || !data.email || !data.role) {
    return { error: '必須フィールドが不足しています' };
  }

  var existingUser = getUserById(data.id);
  if (!existingUser) return { error: '従業員が見つかりません' };

  // 部署名 → ID 変換
  var deptIds  = [];
  var allDepts = getAllDepartments();
  if (data.departments && Array.isArray(data.departments) && data.departments.length > 0) {
    data.departments.forEach(function(deptName) {
      var dept = allDepts.find(function(d) { return d.name === deptName; });
      if (dept) deptIds.push(dept.id);
    });
  } else if (data.department) {
    var dept = allDepts.find(function(d) { return d.name === data.department; });
    if (dept) deptIds.push(dept.id);
  }

  var updates = {
    name:                data.name,
    email:               data.email,
    role:                data.role,
    department_id:       deptIds.length > 0 ? JSON.stringify(deptIds) : '',
    mattermost_username: data.mattermostUsername || '',
    updated_at:          _now(),
  };

  // パスワード処理
  if (data.isGwsAuthOnly) {
    // GWS Auth のみに設定
    updates.password_hash = 'GWS_AUTH_ONLY';
  } else if (data.password && data.password.trim() !== '') {
    // 新しいパスワードが指定された場合のみ更新
    updates.password_hash = hashPassword(data.password);
  }
  // それ以外（isGwsAuthOnly=false かつ password が空）の場合は既存のパスワードを維持

  var success = _updateRow(SHEET_USERS, data.id, updates, USER_H);
  if (success) {
    _invalidateCache(CACHE_KEY_USERS);
    return { success: true };
  }
  return { error: '更新に失敗しました' };
}

// 管理者向け: 従業員の有効/無効を切り替える
function toggleEmployeeStatus(userId, active) {
  var user = getCurrentUser();
  if (!user || user.role !== 'admin') return { error: 'Unauthorized' };
  setUserActive(userId, active);
  return { success: true };
}
