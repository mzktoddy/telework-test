// ============================================================
//  Code.gs — エントリーポイント・ルーティング・テンプレートヘルパー
//
//  導入手順: SPREADSHEET_ID に Google スプレッドシートの ID を設定する
//            （空白のシートを作成→ URL から ID をコピー）
// ============================================================
const scriptProperties = PropertiesService.getScriptProperties();
const SPREADSHEET_ID = scriptProperties.getProperty('SPREADSHEET_ID');//
const REDMINE_URL = scriptProperties.getProperty('REDMINE_URL');
const API_KEY = scriptProperties.getProperty('API_KEY');//
const MATTERMOST_WEBHOOK_URL = scriptProperties.getProperty('MATTERMOST_WEBHOOK_URL');//
const EXPORT_FOLDER_ID = scriptProperties.getProperty('EXPORT_FOLDER_ID'); // Google Drive フォルダID（エクスポート先）

// ── エントリーポイント ──────────────────────────────────────────
//
//  認証フロー:
//    getCurrentUser() は loginUser() / loginWithGoogle() がログイン時に
//    書き込んだキャッシュのみを参照する。Session.getActiveUser() は呼び出さないため、
//    未認証のアクセスは常にログインページに遷移する。
//
//  ログアウトフロー:
//    logoutUser() がキャッシュを削除し、?page=login へ遷移する。
//    認証チェックより前に処理するため、古いキャッシュが残存していても
//    ログインページが必ず表示される。
function doGet(e) {
  var page = (e && e.parameter && e.parameter.page) ? e.parameter.page : '';

  // 明示的にログインが要求された場合は常にログインページを表示する（ログアウト後も含む）
  if (page === 'login') {
    return renderPage('Login', null);
  }

  // キャッシュのみで認証を確認する（GWS セッションのフォールバックなし）
  var user = getCurrentUser();
  if (!user) {
    // 認証後にリダイレクトできるよう要求ページをログイン画面に渡す
    return renderPage('Login', null, page);
  }

  // ページ指定なし → デフォルトはダッシュボードを表示する
  if (!page) {
    return renderPage('Dashboard', user);
  }

  // ロールベースのアクセス制御を適用して各ページへルーティングする
  return _routePage(page, user);
}

// ── ロールベースのアクセス制御を適用してページへルーティングする ────────
function _routePage(page, user) {
  // ページごとのアクセスルール：ページ名 → 許可ロールの配列（空配列 = 全ロール許可）
  var pageAccess = {
    'dashboard':     [],  // 全ロール許可
    'reports':       [],  // 全ロール許可
    'task_report':   [],  // 全ロール許可
    'calendar':      [],  // 全ロール許可
    'approve':       ['reviewer', 'manager', 'admin'],
    'employees':     ['admin'],
    'admin_history': ['admin']
  };

  // ルーティング対象のページかどうか確認する
  if (!pageAccess.hasOwnProperty(page)) {
    return renderPage('Dashboard', user);  // 未知のページ → ダッシュボードへ遷移
  }

  // ロールによるアクセス権限を確認する
  var allowedRoles = pageAccess[page];
  var hasAccess = allowedRoles.length === 0 || allowedRoles.indexOf(user.role) >= 0;

  if (!hasAccess) {
    return renderPage('Dashboard', user);  // アクセス権限なし → ダッシュボードへ遷移
  }

  // テンプレート名を生成する（スネークケース → パスカルケース）
  var templateName = page.split('_').map(function(word) {
    return word.charAt(0).toUpperCase() + word.slice(1);
  }).join('');

  return renderPage(templateName, user);
}

// ── テンプレートレンダラー ────────────────────────────────────
function renderPage(templateName, user, redirectPage) {
  var tmpl = HtmlService.createTemplateFromFile(templateName);
  // JSON はダブルクォートを使用するため、HTML 属性のシングルクォートで安全に埋め込むことができる
  tmpl.user         = user ? JSON.stringify(user) : 'null';
  tmpl.scriptUrl    = ScriptApp.getService().getUrl();
  tmpl.redirectPage = redirectPage || ''; // 元々要求されたページを渡す
  return tmpl
    .evaluate()
    .setTitle('在宅勤務報告システム')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ── テンプレートインクルードヘルパー ───────────────────────────────
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ── Google ドライブの画像を base64 変換して取得する（現在未使用） ────
// function getImageAsBase64(fileId) {
//   try {
//     // Google ドライブからファイルを取得する
//     var fileId = '1aCQV8AlI7ssdAlLCHOOk-HNnZsK1Jr1D'; 
//     var file = DriveApp.getFileById(fileId);
    
//     // Blob（ファイル内容）を取得する
//     var blob = file.getBlob();
    
//     // MIME タイプを取得する（例: image/png、image/jpeg）
//     var mimeType = blob.getContentType();
    
//     // base64 に変換する
//     var base64Data = Utilities.base64Encode(blob.getBytes());
    
//     // データ URI として返す
//     return 'data:' + mimeType + ';base64,' + base64Data;
//   } catch (error) {
//     Logger.log('画像取得エラー: ' + error.toString());
//     return null;
//   }
// }

// ── ログイン中ユーザーに割り当てられた Redmine オープンチケットを取得する ─
// 戦略: ログインユーザーのメールアドレスから Redmine ユーザー ID を特定し、
// そのユーザーに割り当てられたオープンチケットを取得する。
// API_KEY は共有の管理者キーのため、assigned_to_id=me は使用できない。

function getOpenTicketsByEmail(email) {
  // ステップ1: メールアドレスから Redmine ユーザーを検索する
  const userId = getUserIdByEmail(email);
  
  if (!userId) {
    Logger.log('該当ユーザーが見つかりません: ' + email);
    return [];
  }

  Logger.log('ユーザー ID を導出しました: ' + userId);

  // ステップ2: そのユーザーのオープンチケットを取得する
  const issues = getOpenIssuesByUserId(userId);
  return issues;
}

// ─── メールアドレスから Redmine ユーザー ID を検索する ───
function getUserIdByEmail(email) {
  const url = `${REDMINE_URL}/users.json?limit=100`;

  const response = UrlFetchApp.fetch(url, {
    method: "GET",
    headers: {
      "X-Redmine-API-Key": API_KEY
    },
    muteHttpExceptions: true
  });

  const data = JSON.parse(response.getContentText());

  // メールアドレスが一致するユーザーを検索する
  const matched = data.users.find(user => user.mail === email);
  
  return matched ? matched.id : null;
}

// ─── Redmine ユーザー ID に割り当てられたオープンチケットを取得する ───
function getOpenIssuesByUserId(userId) {
  const todayJST = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  Logger.log('検索対象日時（JST）: ' + todayJST);


  let allIssues = [];
  let offset = 0;
  const limit = 100;
  let totalCount = null;

  do {
    const url = `${REDMINE_URL}/issues.json`
      + `?assigned_to_id=${userId}`
      + `&status_id=open`
      + `&created_on=%3C%3D${todayJST}`
      + `&limit=${limit}`
      + `&offset=${offset}`;

    const response = UrlFetchApp.fetch(url, {
      method: "GET",
      headers: {
        "X-Redmine-API-Key": API_KEY
      },
      muteHttpExceptions: true
    });

    const data = JSON.parse(response.getContentText());

    if (totalCount === null) {
      totalCount = data.total_count;
      Logger.log('オープンチケットの合計件数: ' + totalCount);
    }

    allIssues = allIssues.concat(data.issues);
    offset += limit;

  } while (offset < totalCount);

  return allIssues;
}

// ── Reports.html の syncRedmine() から呼び出されるクライアント向け Redmine 同期関数 ─
// 戻り値:
//   [{id, subject, project, tracker, status, priority, dueDate}, ...]
//   { error: '<メッセージ>' }  認証・検索失敗時
function getRedmineTasks() {
  var user = getCurrentUser();
  if (!user) return { error: '未認証' };

  var userId = getUserIdByEmail(user.email);
  if (!userId) {
    Logger.log('Redmine user not found for email: ' + user.email);
    return { error: 'Redmineアカウントが見つかりません（メール: ' + user.email + '）' };
  }

  var issues = getOpenIssuesByUserId(userId);
  return issues.map(function (issue) {
    return {
      id:       issue.id,
      subject:  issue.subject,
      project:  issue.project  ? issue.project.name  : '',
      tracker:  issue.tracker  ? issue.tracker.name  : '',
      status:   issue.status   ? issue.status.name   : '',
      priority: issue.priority ? issue.priority.name : '',
      dueDate:  issue.due_date || '',
    };
  });
}

// ── 指定日にユーザーが記録した Redmine 作業実績（タイムエントリ）を取得する ─
// 記録内容: 作業ごとの合計時間と進捗率（%）
function getRedmineTimeEntries(dateStr) {
  //const todayJST = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy-MM-dd");
  var user = getCurrentUser();
  if (!user) return { error: '未認証' };

  var redmineUserId = getUserIdByEmail(user.email);
  if (!redmineUserId) {
    return { error: 'Redmineアカウントが見つかりません（メール: ' + user.email + '）' };
  }

  // 該当日に記録されたタイムエントリを取得する
  var allEntries = [];
  var offset = 0;
  var limit = 100;
  var totalCount = null;

  do {
    var url = REDMINE_URL + '/time_entries.json'
      + '?user_id=' + redmineUserId
      + '&from=' + dateStr
      + '&to=' + dateStr
      + '&limit=' + limit
      + '&offset=' + offset;

    var response = UrlFetchApp.fetch(url, {
      method: 'GET',
      headers: { 'X-Redmine-API-Key': API_KEY },
      muteHttpExceptions: true
    });

    var data = JSON.parse(response.getContentText());
    if (totalCount === null) totalCount = data.total_count || 0;
    allEntries = allEntries.concat(data.time_entries || []);
    offset += limit;
  } while (offset < totalCount);

  // チケットごとに時間を集計する
  var issueMap = {};
  allEntries.forEach(function (entry) {
    if (!entry.issue) return;
    var iid = entry.issue.id;
    if (!issueMap[iid]) {
      issueMap[iid] = { id: iid, hours: 0, activity: '', comments: [] };
    }
    issueMap[iid].hours += entry.hours || 0;
    if (entry.activity) issueMap[iid].activity = entry.activity.name;
    if (entry.comments) issueMap[iid].comments.push(entry.comments);
  });

  // 各チケットの詳細情報（タイトル・プロジェクト・進捗率）を取得する
  var result = [];
  var issueIds = Object.keys(issueMap);
  for (var i = 0; i < issueIds.length; i++) {
    var iid = issueIds[i];
    try {
      var iResp = UrlFetchApp.fetch(REDMINE_URL + '/issues/' + iid + '.json', {
        method: 'GET',
        headers: { 'X-Redmine-API-Key': API_KEY },
        muteHttpExceptions: true
      });
      var iData = JSON.parse(iResp.getContentText());
      var issue = iData.issue || {};
      result.push({
        id:        parseInt(iid),
        subject:   issue.subject || '',
        project:   issue.project  ? issue.project.name  : '',
        tracker:   issue.tracker  ? issue.tracker.name  : '',
        status:    issue.status   ? issue.status.name   : '',
        priority:  issue.priority ? issue.priority.name : '',
        progress:  issue.done_ratio || 0,
        hours:     Math.round(issueMap[iid].hours * 100) / 100,
        activity:  issueMap[iid].activity,
        comments:  issueMap[iid].comments,
      });
    } catch (e) {
      result.push({
        id: parseInt(iid), subject: '(取得失敗)', project: '', tracker: '',
        status: '', priority: '', progress: 0,
        hours: Math.round(issueMap[iid].hours * 100) / 100,
        activity: issueMap[iid].activity, comments: issueMap[iid].comments,
      });
    }
  }

  return result;
}

// function main() {
//   const email = "kaiden@mamiya-its.co.jp";  // ← 必要に応じて変更する
//   const issues = getOpenTicketsByEmail(email);

//   issues.forEach(issue => {
//     Logger.log(`#${issue.id} | ${issue.subject} | ${issue.status.name} | ${issue.created_on}`);
//   });
// }



/**
 * Mattermost へ在宅勤務申請書の承認通知を送信する
 * @param {Object} notificationData - 通知内容
 * @param {string} notificationData.reportType - 'telework' または 'task'
 * @param {string} notificationData.reportDate - 申請日（YYYY-MM-DD）
 * @param {string} notificationData.weekTitle - 週タイトル（例：'第14週'）— 在宅勤務申請書のみ使用
 * @param {string} notificationData.employeeName - 申請者氏名
 * @param {string} notificationData.employeeEmail - 申請者メールアドレス（メンション用）
 * @param {string} notificationData.approverName - 承認者氏名
 * @param {string} notificationData.decision - 'approved' または 'rejected'
 * @param {string} notificationData.reportUrl - 申請内容を確認する URL
 * @param {string} channel - Mattermost チャンネル（任意）
 */
function sendMattermostMessage(notificationData, channel) {
  try {
    var date = new Date(notificationData.reportDate);
    var year = Utilities.formatDate(date, "Asia/Tokyo", "yyyy");
    
    // mattermost_username が登録済みの場合はそれを使用し、なければメールアドレスから導出する
    var mattermostUsername = (notificationData.mattermostUsername && notificationData.mattermostUsername.trim())
      ? notificationData.mattermostUsername.replace(/^@/, '') // 先頭の @ は削除する
      : (notificationData.employeeEmail ? notificationData.employeeEmail.split('@')[0].replace('.', '-') : 'user');
    
    // 承認ステータスの表示ラベルを決定する
    var statusText = notificationData.decision === 'approved' ? '承認' : 
                     notificationData.decision === 'reviewed' ? '照査' : '差戻';
    
    // システム URL（実際のシステム URL に必要に応じて変更してください）
    var systemUrl = notificationData.reportUrl || ScriptApp.getService().getUrl();
    
    // 申請種別に応じてメッセージヘッダーを生成する
    var messageHeader;
    if (notificationData.reportType === 'telework') {
      // 在宅勤務申請書の場合: 「2026年 第14週 在宅勤務許可申請書についてのお知らせ」
      messageHeader = year + '年 ' + notificationData.weekTitle + ' 在宅勤務許可申請書についてのお知らせ';
    } else {
      // 日報（作業報告書）の場合: 「2026/03/27（金） 在宅勤務報告書についてのお知らせ」
      var weekdays = ['日', '月', '火', '水', '木', '金', '土'];
      var formattedDate = Utilities.formatDate(date, "Asia/Tokyo", "yyyy/MM/dd") + 
                         '（' + weekdays[date.getDay()] + '）';
      messageHeader = formattedDate + ' 在宅勤務報告書についてのお知らせ';
    }
    
    // 通知メッセージを組み立てる
    var message =  messageHeader + '\n\n';
    message += '@' + mattermostUsername + '\n';
    message += '**' + notificationData.approverName + '** により **' + statusText + '** されました。\n';
    message += '[内容をご確認ください](' + systemUrl + ')';
    
    var payload = {
      text: message,
      channel: channel || '1st-systems',
      username: '日報管理システム                              ',
      icon_emoji: ':mop:',
    };

    var options = {
      method: 'POST',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    var response = UrlFetchApp.fetch(MATTERMOST_WEBHOOK_URL, options);
    var statusCode = response.getResponseCode();

    if (statusCode === 200) {
      Logger.log('✅ Mattermost notification sent successfully');
      return { success: true };
    } else {
      Logger.log('❌ Mattermost notification failed: ' + statusCode + ' | ' + response.getContentText());
      return { success: false, error: 'HTTPエラー: ' + statusCode };
    }
  } catch (error) {
    Logger.log('❌ Error sending Mattermost notification: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Mattermost 通知の動作確認用テスト関数
 * GAS エディタから実行して通知の僕挙を検証する
 */
function testMattermostNotification() {
  // 在宅勤務申請書の通知テスト
  Logger.log('在宅勤務申請書の通知テストを開始...');
  var teleworkData = {
    reportType: 'telework',
    reportDate: '2026-03-27',
    weekTitle: '第14週',
    employeeName: 'ズーコ',
    employeeEmail: 'zuko@mamiya-its.co.jp',
    approverName: '海田',
    decision: 'approved',
    reportUrl: ScriptApp.getService().getUrl() + '?page=reports',
  };
  
  var result1 = sendMattermostMessage(teleworkData, '1st-systems');
  
  if (result1.success) {
    Logger.log('✅ 在宅勤務申請書の通知を送信しました！');
  } else {
    Logger.log('❌ 在宅勤務申請書の通知送信に失敗しました: ' + result1.error);
  }
  
  // 日報（作業報告書）の通知テスト
  Logger.log('日報の通知テストを開始...');
  var taskData = {
    reportType: 'task',
    reportDate: '2026-03-27',
    employeeName: 'ズーコ',
    employeeEmail: 'zuko@mamiya-its.co.jp',
    approverName: '海田',
    decision: 'approved',
    reportUrl: ScriptApp.getService().getUrl() + '?page=task_report',
  };
  
  var result2 = sendMattermostMessage(taskData, '1st-systems');
  
  if (result2.success) {
    Logger.log('✅ 日報の通知を送信しました！');
  } else {
    Logger.log('❌ 日報の通知送信に失敗しました: ' + result2.error);
  }
  
  return { telework: result1, task: result2 };
}

function getUserList() {
  const url = `${REDMINE_URL}/users.json?limit=100`;
  
  const response = UrlFetchApp.fetch(url, {
    method: "GET",
    headers: {
      "X-Redmine-API-Key": API_KEY
    }
  });

  const data = JSON.parse(response.getContentText());
  
  data.users.forEach(user => {
    Logger.log(`ID: ${user.id} | Login: ${user.login} | Name: ${user.firstname} ${user.lastname} | mail: ${user.mail}`);
  });
}


// ── Open-Meteo で東京の天気予報を取得する ────────────────────
// 今日から 7 日間の天気予報を返す（日本時間ベース）。
// Dashboard.html から google.script.run 経由で呼び出す。
function getTokyoWeather() {
  var url =
    'https://api.open-meteo.com/v1/forecast' +
    '?latitude=35.6762&longitude=139.6503' +
    '&daily=weather_code,temperature_2m_max' +
    '&timezone=Asia%2FTokyo&forecast_days=7';

  try {
    var res  = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    var json = JSON.parse(res.getContentText());

    // Open-Meteo は今日からの日次データを配列で返す — そのまま使用する
    var days = [];
    for (var i = 0; i < 7; i++) {
      days.push({
        date: json.daily.time[i] || '',
        code: json.daily.weather_code[i] !== undefined ? json.daily.weather_code[i] : null,
        temp: json.daily.temperature_2m_max[i] !== undefined
          ? Math.round(json.daily.temperature_2m_max[i]) : null,
      });
    }
    return days;
  } catch (e) {
    return { error: e.toString() };
  }
}

// ============================================================
//  日次未処理通知スケジューラー
//
//  初期設定: GAS エディタから setupDailyTrigger() を一度実行する。
//            毎日 9:00（JST）に起動する時刻トリガーが登録される。
//            土日は自動スキップする。
//
//  ロジック:
//    ・ 照査者 → 担当部署の従業員から提出された「提出済み」申請について通知。
//    ・ 承認者 → 担当部署の従業員から提出された「照査承認済み」申請について通知。
//  在宅勤務許可申請書（telework_reports）と
//  在宅勤務報告書（task_reports）の両方を確認する。
// ============================================================

function sendDailyPendingNotifications() {
  // 日本時間（JST）の曜日を確認する
  var now    = new Date();
  var jstNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  var dow    = jstNow.getDay(); // 0=Sun … 6=Sat
  if (dow === 0 || dow === 6) {
    Logger.log('土日のためスキップします');
    return;
  }

  var WEEKDAYS_JP = ['日', '月', '火', '水', '木', '金', '土'];
  var todayLabel  = Utilities.formatDate(jstNow, 'Asia/Tokyo', 'yyyy/MM/dd') +
                   '（' + WEEKDAYS_JP[dow] + '）';

  // キャッシュをバイパスしてシートから直接データを読み込む（最新データを確保するため）
  var allUsers = _sheetToObjects(getSheet(SHEET_USERS))
    .map(function(u) {
      u.is_active = (u.is_active === true || u.is_active === 'TRUE' || u.is_active === 1);
      return u;
    })
    .filter(function(u) { return u.is_active; });
  
  var allReports     = _sheetToObjects(getSheet(SHEET_REPORTS));
  var allTaskReports = _sheetToObjects(getSheet(SHEET_TASK_REPORTS));
  var systemUrl      = ScriptApp.getService().getUrl();

  // ── Helpers ──────────────────────────────────────────────
  function getDeptIds(user) {
    if (!user.department_id) return [];
    try {
      var parsed = JSON.parse(user.department_id);
      return Array.isArray(parsed) ? parsed : [String(user.department_id)];
    } catch (e) { return [String(user.department_id)]; }
  }

  function getEmpIdsForDepts(deptIds) {
    return allUsers
      .filter(function(u) {
        if (u.role !== 'employee') return false;
        var ud = getDeptIds(u);
        return ud.some(function(d) { return deptIds.indexOf(d) >= 0; });
      })
      .map(function(u) { return u.id; });
  }

  // Mattermost @メンション: mattermost_username を優先し、なければメールアドレスの @ 前の部分を使用する
  function getMention(user) {
    // mattermost_username が登録済みの場合はそれを使用
    if (user.mattermost_username && user.mattermost_username.trim() !== '') {
      return user.mattermost_username;
    }
    // なければメールアドレスから導出する
    return user.email ? user.email.split('@')[0].replace(/\./g, '-') : (user.name || 'user');
  }

  // ユーザーごとに Mattermost Webhook メッセージを送信する
  function notify(user, header, rows) {
    if (!rows.length) return;
    var mention = getMention(user);
    //var mention = "myintzuko"
    
    // @ がすでに含まれている場合は追加しない
    var mentionText = mention.indexOf('@') === 0 ? mention : '@' + mention;

    // Markdown テーブル
    var table = '| 書類 | 件数 |\n| :--- | ---: |\n';
    rows.forEach(function(r) { table += '| ' + r.label + ' | ' + r.count + ' 件 |\n'; });

    var text = todayLabel + header + '\n\n' +
               mentionText + '\n\n' +
               table;

    try {
      UrlFetchApp.fetch(MATTERMOST_WEBHOOK_URL, {
        method:           'POST',
        contentType:      'application/json',
        payload:          JSON.stringify({
          text:        text,
          channel:     '1st-systems',
          username:    '日報管理システム',
          icon_emoji:  ':mop:',
        }),
        muteHttpExceptions: true,
      });
      Logger.log(mentionText + ' へ通知しました');
    } catch (e) {
      Logger.log(mentionText + ' への通知に失敗しました: ' + e.toString());
    }
  }

  // ── 照査者への通知: 'submitted'（提出済み）の申請 ─────────────
  allUsers.filter(function(u) { return u.role === 'reviewer'; })
    .forEach(function(reviewer) {
      var deptIds = getDeptIds(reviewer);
      if (!deptIds.length) return;
      // 親部署を除く子部署のみを対象にする
      var childDeptIds = getChildDepartmentsOnly(deptIds);
      if (!childDeptIds.length) return;
      var empIds  = getEmpIdsForDepts(childDeptIds);
      if (!empIds.length) return;

      var pendingTelework = allReports.filter(function(r) {
        return r.status === 'submitted' && empIds.indexOf(r.employee_id) >= 0;
      });
      var pendingTask = allTaskReports.filter(function(r) {
        return r.status === 'submitted' && empIds.indexOf(r.employee_id) >= 0;
      });

      var rows = [];
      if (pendingTelework.length) rows.push({ label: '在宅勤務許可申請書', count: pendingTelework.length });
      if (pendingTask.length)     rows.push({ label: '在宅勤務報告書',     count: pendingTask.length });

      notify(reviewer, '照査依頼が届いています。', rows);
    });

  // ── 承認者への通知: 'reviewer_approved'（照査承認済み）の申請 ───
  allUsers.filter(function(u) { return u.role === 'manager'; })
    .forEach(function(manager) {
      var deptIds = getDeptIds(manager);
      if (!deptIds.length) return;
      // 親部署を除く子部署のみを対象にする
      var childDeptIds = getChildDepartmentsOnly(deptIds);
      if (!childDeptIds.length) return;
      var empIds  = getEmpIdsForDepts(childDeptIds);
      if (!empIds.length) return;

      var pendingTelework = allReports.filter(function(r) {
        return r.status === 'reviewed' && empIds.indexOf(r.employee_id) >= 0;
      });
      var pendingTask = allTaskReports.filter(function(r) {
        return r.status === 'reviewed' && empIds.indexOf(r.employee_id) >= 0;
      });

      var rows = [];
      if (pendingTelework.length) rows.push({ label: '在宅勤務許可申請書', count: pendingTelework.length });
      if (pendingTask.length)     rows.push({ label: '在宅勤務報告書',     count: pendingTask.length });

      notify(manager, '承認依頼が届いています。', rows);
    });

  Logger.log('sendDailyPendingNotifications: 完了');
}

// ── 日次トリガーを登録する（GAS エディタから一度実行） ─────────────
// 平日の毎日 9:00（JST）に発火する。土日のスキップは sendDailyPendingNotifications() 内で処理する。
function setupDailyTrigger() {
  // 重複登録を防ぐため既存のトリガーを削除する
  const days = [
    ScriptApp.WeekDay.MONDAY,
    ScriptApp.WeekDay.TUESDAY,
    ScriptApp.WeekDay.WEDNESDAY,
    ScriptApp.WeekDay.THURSDAY,
    ScriptApp.WeekDay.FRIDAY
  ];
  
  days.forEach(day => {
    ScriptApp.newTrigger("sendDailyPendingNotifications") // 実行する関数名
      .timeBased()
      .onWeekDay(day)
      .atHour(9) // 発火時刻を指定（0～23）
      .inTimezone('Asia/Tokyo')
      .create();
  });
  // ScriptApp.newTrigger('sendDailyPendingNotifications')
  //   .timeBased()
  //   .everyDays(1)
  //   .atHour(9)          // 発火時刻（9 AM）
  //   .inTimezone('Asia/Tokyo')
  //   .create();

  Logger.log('✅ 日次トリガーを登録しました: 平日毎日 9:00（JST）');
  return '✅ トリガー登録完了';
}

// ── Remove the daily trigger ─────────────────────────────────
function removeDailyTrigger() {
  var removed = 0;
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'sendDailyPendingNotifications') {
      ScriptApp.deleteTrigger(t);
      removed++;
    }
  });
  Logger.log('削除したトリガー数: ' + removed);
  return 'トリガー ' + removed + ' 件を削除しました';
}

/**
 * 現在のエクスポートフォルダ設定を確認する
 */
function checkExportFolder() {
  var folderId = PropertiesService.getScriptProperties().getProperty('EXPORT_FOLDER_ID');
  
  if (!folderId) {
    var message = 'エクスポートフォルダが設定されていません。\nsetupExportFolder() を実行して設定してください。';
    Logger.log(message);
    SpreadsheetApp.getUi().alert('未設定', message, SpreadsheetApp.getUi().ButtonSet.OK);
    return message;
  }
  
  try {
    var folder = DriveApp.getFolderById(folderId);
    var message = '現在のエクスポートフォルダ:\n' +
                  'フォルダ名: ' + folder.getName() + '\n' +
                  'フォルダID: ' + folderId + '\n' +
                  'URL: ' + folder.getUrl();
    Logger.log(message);
    SpreadsheetApp.getUi().alert('設定確認', message, SpreadsheetApp.getUi().ButtonSet.OK);
    return message;
  } catch (e) {
    var errorMsg = 'エラー: 設定されているフォルダが見つかりません。\nフォルダが削除されたか、アクセス権限がありません。';
    Logger.log(errorMsg);
    SpreadsheetApp.getUi().alert('エラー', errorMsg, SpreadsheetApp.getUi().ButtonSet.OK);
    return errorMsg;
  }
}
