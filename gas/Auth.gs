// ============================================================
//  Auth.gs — Google Workspace 認証・パスワードフォールバック
//
//  パスワード認証ルール（loginUser）：
//  1. ブラウザのアクティブな Google Workspace セッションのメールアドレスが
//     入力されたメールアドレスと一致する場合 → パスワード不要
//     （Google Workspace の身元情報を証明として使用）
//  2. usersシートに password_hash が設定されている場合
//     → 平文パスワードを入力すると SHA-256 ハッシュと照合する
//  3. password_hash = 'GWS_AUTH_ONLY' かつ GWS セッションが一致しない場合
//     → 「Google Workspace でサインイン」ボタンを使用する必要がある
//
//  初期設定: エディタのコンソールから hashPassword('パスワード') を実行し
//            取得したハッシュを users シートに保存してください
// ============================================================
// ── アクティブな Google Workspace セッションのメールアドレスを返す ─
//    ログイン画面でパスワード入力欄の表示・非表示を切り替える際に使用する
function getGwsSessionEmail() {
  try { return Session.getActiveUser().getEmail() || ''; } catch (e) { return ''; }
}
// ── doGet() およびユーザー情報が必要なサーバー関数から呼び出す ─
//    loginUser() / loginWithGoogle() がログイン時に書き込んだ
//    キャッシュのみを参照する。Session.getActiveUser() は呼び出さないため、
//    キャッシュが存在しない場合は null を返す（未認証扱い）
var SESSION_TTL_MS = 24 * 60 * 60 * 1000; // セッション有効期限（24時間・ミリ秒）
var CACHE_TTL_S    = 21600;               // キャッシュ有効期限（6時間・秒）CacheService の上限

function getCurrentUser() {
  var cache = CacheService.getUserCache();

  // 高速パス: キャッシュが有効な場合はそのまま返す
  var cached = cache.get('gasUser');
  if (cached) {
    try { return JSON.parse(cached); } catch (e) {}
  }

  // 低速パス: キャッシュ期限切れ → UserProperties を確認する（キャッシュが破棄されても残存）
  var props = PropertiesService.getUserProperties();
  var stored = props.getProperty('gasUser');
  if (!stored) return null;

  var session;
  try { session = JSON.parse(stored); } catch (e) { props.deleteProperty('gasUser'); return null; }

  // 24時間の有効期限を確認する
  if (!session.loginTime || (Date.now() - session.loginTime) > SESSION_TTL_MS) {
    props.deleteProperty('gasUser');
    return null;
  }

  // 次回の呼び出しを高速化するためキャッシュを再投入する
  var user = { id: session.id, email: session.email, name: session.name,
               role: session.role, department_id: session.department_id };
  try { cache.put('gasUser', JSON.stringify(user), CACHE_TTL_S); } catch (e) {}
  return user;
}

// ── Login.html の「Google Workspace でサインイン」ボタンから呼び出す ─
//    アクティブな Google セッションを使用するためパスワード不要
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

// ── Login.html のメールアドレス＋パスワード入力フォームから呼び出す ─
//    入力メールアドレスが GWS セッションのメールアドレスと一致する場合は
//    パスワード不要（Google Workspace の身元情報を証明として使用）
//    一致しない場合は SHA-256 ハッシュによるパスワード照合を行う
function loginUser(email, password, redirectPage) {
  try {
    if (!email) return { error: 'メールアドレスを入力してください。' };

    var user = getUserByEmail(email);
    if (!user)           return { error: 'このメールアドレスは登録されていません。' };
    if (!user.is_active) return { error: 'アカウントが無効です。管理者にお問い合わせください。' };

    // Google Workspace セッションのメールアドレスと入力内容を照合する
    var sessionEmail = '';
    try { sessionEmail = Session.getActiveUser().getEmail(); } catch (e) {}
    var gwsMatch = sessionEmail &&
      sessionEmail.toLowerCase() === email.toLowerCase();

    if (gwsMatch) {
      // GWS の身元情報で確認済み — パスワード不要
      return _buildSession(user, redirectPage);
    }

    // GWS セッションが一致しない場合 — パスワード認証へ進む
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

// ── loginUser / loginWithGoogle 共通: セッション書き込みとリダイレクト応答を返す ─
//    認証後は要求されたページ（なければダッシュボード）へリダイレクトする
//    getCurrentUser() が認証済みかどうかを確認するためにキャッシュが必要
function _buildSession(user, redirectPage) {
  var info = {
    id:            user.id,
    email:         user.email,
    name:          user.name,
    role:          user.role,
    department_id: user.department_id,
  };
  // UserProperties に最大24時間保持する（キャッシュが破棄されても残存）
  var sessionInfo = { id: info.id, email: info.email, name: info.name,
                      role: info.role, department_id: info.department_id,
                      loginTime: Date.now() };
  PropertiesService.getUserProperties().setProperty('gasUser', JSON.stringify(sessionInfo));

  // 高速パス用キャッシュにも保存する（最大6時間）
  try { CacheService.getUserCache().put('gasUser', JSON.stringify(info), CACHE_TTL_S); } catch (e) {}

  // 要求されたページ、なければダッシュボードへリダイレクトする
  var page = redirectPage || 'dashboard';
  return {
    success:     true,
    redirectUrl: ScriptApp.getService().getUrl() + '?page=' + page,
  };
}

// ── サイドバーのログアウトボタンから呼び出す ────────────────
function logoutUser() {
  CacheService.getUserCache().remove('gasUser');
  PropertiesService.getUserProperties().deleteProperty('gasUser');
  return { redirectUrl: ScriptApp.getService().getUrl() + '?page=login' };
}

// ── パスワードユーティリティ ─────────────────────────────────
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

// 平文パスワードを保存する前にハッシュ化する（GAS エディタのコンソールから一度だけ実行）
function hashPassword(plain) { return computeSha256(plain); }
