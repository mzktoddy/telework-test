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
var SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
var CACHE_TTL_S    = 21600;               // 6 hours — CacheService hard limit

function getCurrentUser() {
  var cache = CacheService.getUserCache();

  // Fast path: still in cache
  var cached = cache.get('gasUser');
  if (cached) {
    try { return JSON.parse(cached); } catch (e) {}
  }

  // Slow path: cache expired — check UserProperties (survives cache eviction)
  var props = PropertiesService.getUserProperties();
  var stored = props.getProperty('gasUser');
  if (!stored) return null;

  var session;
  try { session = JSON.parse(stored); } catch (e) { props.deleteProperty('gasUser'); return null; }

  // Validate 24-hour window
  if (!session.loginTime || (Date.now() - session.loginTime) > SESSION_TTL_MS) {
    props.deleteProperty('gasUser');
    return null;
  }

  // Repopulate cache so next call is fast again
  var user = { id: session.id, email: session.email, name: session.name,
               role: session.role, department_id: session.department_id };
  try { cache.put('gasUser', JSON.stringify(user), CACHE_TTL_S); } catch (e) {}
  return user;
}

// ── Called from Google Workspace button in Login.html ────────
//  Uses the active Google session — no password required.
function loginWithGoogle(redirectPage) {
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

    return _buildSession(user, redirectPage);
  } catch (err) {
    return { error: 'ログインエラー: ' + err.message };
  }
}

// ── Called from email+password form in Login.html ─────────────
//  If the GWS session email matches the typed email, password is
//  not required (GWS identity is used as proof). Otherwise the
//  SHA-256 password hash is checked.
function loginUser(email, password, redirectPage) {
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
      return _buildSession(user, redirectPage);
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

    return _buildSession(user, redirectPage);
  } catch (err) {
    return { error: 'ログインエラー: ' + err.message };
  }
}

// ── Shared: write cache and build redirect response ─────────────
//  Redirects to the originally requested page, or dashboard if none specified.
//  The cache is required for getCurrentUser() to confirm authentication.
function _buildSession(user, redirectPage) {
  var info = {
    id:            user.id,
    email:         user.email,
    name:          user.name,
    role:          user.role,
    department_id: user.department_id,
  };
  // Persist for up to 24 hours using UserProperties (survives cache eviction)
  var sessionInfo = { id: info.id, email: info.email, name: info.name,
                      role: info.role, department_id: info.department_id,
                      loginTime: Date.now() };
  PropertiesService.getUserProperties().setProperty('gasUser', JSON.stringify(sessionInfo));

  // Also populate fast-path cache (max 6 h)
  try { CacheService.getUserCache().put('gasUser', JSON.stringify(info), CACHE_TTL_S); } catch (e) {}

  // Redirect to originally requested page, or dashboard as default
  var page = redirectPage || 'dashboard';
  return {
    success:     true,
    redirectUrl: ScriptApp.getService().getUrl() + '?page=' + page,
  };
}

// ── Called from Sidebar logout button ────────────────────────
function logoutUser() {
  CacheService.getUserCache().remove('gasUser');
  PropertiesService.getUserProperties().deleteProperty('gasUser');
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
