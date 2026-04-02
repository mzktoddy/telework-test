// ============================================================
//  Auth.gs — Google Workspace authentication + password fallback
//
//  PASSWORD ACCEPTANCE RULES (loginUser):
//  1. If the browser's active Google Workspace session email matches
//     the typed email  →  no password needed (GWS identity = proof).
//  2. If the user has a password_hash in the users sheet
//     →  type the plain-text password; it is SHA-256 hashed and compared.
//  3. If password_hash = 'GWS_AUTH_ONLY' and no GWS session match
//     →  user must click the "Google Workspaceでサインイン" button.
//
//  SETUP: Run hashPassword('yourplaintext') from the editor console
//         to get the hash to store in the users sheet.
// ============================================================
// ── Returns the email of the active Google Workspace session ─
//    Used by Login.html to auto-detect whether to show the password field.
function getGwsSessionEmail() {
  try { return Session.getActiveUser().getEmail() || ''; } catch (e) { return ''; }
}
// ── Called by doGet() and any server function that needs the identity ─
//    Reads only from the 30-min user cache written by loginUser() /
//    loginWithGoogle(). Does NOT call Session.getActiveUser(), so the
//    cache must already exist (set at login time).
function getCurrentUser() {
  var cache = CacheService.getUserCache();
  var cached = cache.get('gasUser');
  if (!cached) return null;
  try { return JSON.parse(cached); } catch (e) { cache.remove('gasUser'); return null; }
}

// ── Called from Google Workspace button in Login.html ────────
//  Uses the active Google session — no password required.
function loginWithGoogle() {
  try {
    var sessionEmail = '';
    try { sessionEmail = Session.getActiveUser().getEmail(); } catch (e) {}

    if (!sessionEmail) {
      return {
        error: 'Google Workspaceセッションが確認できません。' +
               'Googleアカウントにログイン済みであることを確認してから再試行してください。',
      };
    }

    var user = getUserByEmail(sessionEmail);
    if (!user) {
      return {
        error: 'このGoogle Workspaceアカウント（' + sessionEmail + '）は' +
               'システムに登録されていません。管理者にお問い合わせください。',
      };
    }
    if (!user.is_active) {
      return { error: 'アカウントが無効です。管理者にお問い合わせください。' };
    }

    return _buildSession(user);
  } catch (err) {
    return { error: 'ログインエラー: ' + err.message };
  }
}

// ── Called from email+password form in Login.html ─────────────
//  If the GWS session email matches the typed email, password is
//  not required (GWS identity is used as proof). Otherwise the
//  SHA-256 password hash is checked.
function loginUser(email, password) {
  try {
    if (!email) return { error: 'メールアドレスを入力してください。' };

    var user = getUserByEmail(email);
    if (!user)           return { error: 'このメールアドレスは登録されていません。' };
    if (!user.is_active) return { error: 'アカウントが無効です。管理者にお問い合わせください。' };

    // Check if an active Google Workspace session matches the typed email
    var sessionEmail = '';
    try { sessionEmail = Session.getActiveUser().getEmail(); } catch (e) {}
    var gwsMatch = sessionEmail &&
      sessionEmail.toLowerCase() === email.toLowerCase();

    if (gwsMatch) {
      // GWS identity confirmed — no password needed
      return _buildSession(user);
    }

    // No GWS match — require password
    if (user.password_hash === 'GWS_AUTH_ONLY') {
      return {
        error: 'このアカウントはGoogle Workspace認証が必要です。' +
               '「Google Workspaceでサインイン」ボタンをお使いください。',
      };
    }
    if (!password) {
      return { error: 'パスワードを入力してください。' };
    }
    if (!checkPassword(password, user.password_hash)) {
      return { error: 'パスワードが正しくありません。' };
    }

    return _buildSession(user);
  } catch (err) {
    return { error: 'ログインエラー: ' + err.message };
  }
}

// ── Shared: write cache and build redirect response ─────────────
//  Includes the explicit ?page= so doGet can route directly
//  without relying on _renderDefault. The cache is still required
//  for getCurrentUser() to confirm the user is authenticated.
function _buildSession(user) {
  var info = {
    id:            user.id,
    email:         user.email,
    name:          user.name,
    role:          user.role,
    department_id: user.department_id,
  };
  CacheService.getUserCache().put('gasUser', JSON.stringify(info), 1800);
  // getDefaultPage() is defined in Code.gs and shared globally.
  var page = getDefaultPage(user.role); // 'reports' | 'approve' | 'employees'
  return {
    success:     true,
    redirectUrl: ScriptApp.getService().getUrl() + '?page=' + page,
  };
}

// ── Called from Sidebar logout button ────────────────────────
function logoutUser() {
  CacheService.getUserCache().remove('gasUser');
  return { redirectUrl: ScriptApp.getService().getUrl() + '?page=login' };
}

// ── Password helpers ─────────────────────────────────────────
function checkPassword(plain, hash) {
  if (!hash || hash === 'GWS_AUTH_ONLY') return false;
  return computeSha256(plain) === hash;
}

function computeSha256(input) {
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, input, Utilities.Charset.UTF_8
  );
  return bytes.map(function (b) {
    return ('0' + (b < 0 ? b + 256 : b).toString(16)).slice(-2);
  }).join('');
}

// Utility: hash a plain password before storing (run once from GAS console)
function hashPassword(plain) { return computeSha256(plain); }
