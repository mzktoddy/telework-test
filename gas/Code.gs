// ============================================================
//  Code.gs — Main entry point, routing, template helpers
//
//  STEP 1: Set SPREADSHEET_ID to your Google Spreadsheet ID.
//          (Create a blank sheet → copy the ID from the URL)
// ============================================================

var SPREADSHEET_ID = '1yJMqIrqETSMCObKWyMLcUzV7cjSTEDAKDajVZfQOdSY'; // ← Paste your Spreadsheet ID here
var REDMINE_URL = 'https://pm.fs-revolution.info';
var API_KEY = '5a50bf5242d0d4f2d9bcfa174b59fbffb9944ab2';
const MATTERMOST_WEBHOOK_URL = "https://ch.fs-revolution.info/hooks/m14yxj45r3dzxr6hd13bnx4w5a";

// ── Entry point ──────────────────────────────────────────────
//
//  Auth flow:
//    getCurrentUser() reads ONLY from the 30-min cache (set by
//    loginUser / loginWithGoogle in Auth.gs). It never calls
//    Session.getActiveUser(), so unauthenticated visits always
//    land on the Login page.
//
//  Logout flow:
//    logoutUser() clears the cache then sends ?page=login.
//    We handle that BEFORE the auth check so the Login page is
//    always shown even if a stale cache entry survives.
function doGet(e) {
  var page = (e && e.parameter && e.parameter.page) ? e.parameter.page : '';

  // Always show Login when explicitly requested (e.g. after logout)
  if (page === 'login') {
    return renderPage('Login', null);
  }

  // Cache-only auth check — no GWS session fallback
  var user = getCurrentUser();
  if (!user) {
    return renderPage('Login', null);
  }

  // No page param → default to dashboard
  if (!page) {
    return renderPage('Dashboard', user);
  }

  // Route to appropriate page with role-based access control
  return _routePage(page, user);
}

// ── Route to page with role-based access control ─────────────
function _routePage(page, user) {
  // Define page access rules: page -> allowed roles (empty array = all roles)
  var pageAccess = {
    'dashboard':     [],  // All roles
    'reports':       [],  // All roles
    'task_report':   [],  // All roles
    'calendar':      [],  // All roles
    'approve':       ['reviewer', 'manager', 'admin'],
    'employees':     ['admin'],
    'admin_history': ['admin']
  };

  // Check if page exists in routing
  if (!pageAccess.hasOwnProperty(page)) {
    return renderPage('Dashboard', user);  // Unknown page → dashboard
  }

  // Check role-based access
  var allowedRoles = pageAccess[page];
  var hasAccess = allowedRoles.length === 0 || allowedRoles.indexOf(user.role) >= 0;

  if (!hasAccess) {
    return renderPage('Dashboard', user);  // No access → dashboard
  }

  // Capitalize first letter for template name
  var templateName = page.split('_').map(function(word) {
    return word.charAt(0).toUpperCase() + word.slice(1);
  }).join('');

  return renderPage(templateName, user);
}

// ── Template renderer ────────────────────────────────────────
function renderPage(templateName, user) {
  var tmpl = HtmlService.createTemplateFromFile(templateName);
  // Encode to be safe inside a single-quoted HTML attribute
  // (JSON uses double quotes, so single-quote wrapping in the HTML is safe)
  tmpl.user      = user ? JSON.stringify(user) : 'null';
  tmpl.scriptUrl = ScriptApp.getService().getUrl();
  return tmpl
    .evaluate()
    .setTitle('在宅勤務報告システム')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ── Template include helper ──────────────────────────────────
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ── Get image from Google Drive and convert to base64 ────────
function getImageAsBase64(fileId) {
  try {
    // Get the file from Google Drive
    var fileId = '1aCQV8AlI7ssdAlLCHOOk-HNnZsK1Jr1D'; 
    var file = DriveApp.getFileById(fileId);
    
    // Get the blob (file content)
    var blob = file.getBlob();
    
    // Get the MIME type (e.g., image/png, image/jpeg)
    var mimeType = blob.getContentType();
    
    // Convert to base64
    var base64Data = Utilities.base64Encode(blob.getBytes());
    
    // Return as data URI
    return 'data:' + mimeType + ';base64,' + base64Data;
  } catch (error) {
    Logger.log('Error getting image: ' + error.toString());
    return null;
  }
}

// ── Fetch open Redmine issues assigned to current user ────────
// Strategy: Look up the Redmine user ID by the logged-in user's email,
// then query open issues assigned to that user.
// The API_KEY is a shared admin key, so assigned_to_id=me won't work.

function getOpenTicketsByEmail(email) {
  // Step 1: Find user by email
  const userId = getUserIdByEmail(email);
  
  if (!userId) {
    Logger.log("User not found for email: " + email);
    return [];
  }

  Logger.log("Found user ID: " + userId);

  // Step 2: Get open issues for that user
  const issues = getOpenIssuesByUserId(userId);
  return issues;
}

// --- Find user ID by email ---
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

  // Search for matching email
  const matched = data.users.find(user => user.mail === email);
  
  return matched ? matched.id : null;
}

// --- Get open issues by user ID ---
function getOpenIssuesByUserId(userId) {
  const todayJST = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy-MM-dd");
  Logger.log("Searching issues until (JST): " + todayJST);


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
      Logger.log("Total open issues: " + totalCount);
    }

    allIssues = allIssues.concat(data.issues);
    offset += limit;

  } while (offset < totalCount);

  return allIssues;
}

// ── Client-facing Redmine sync function ──────────────────────
// Called by Reports.html syncRedmine(). Returns either:
//   [{id, subject, project, tracker, status, priority, dueDate}, ...]
//   { error: '<message>' }  on auth / lookup failure
function getRedmineTasks() {
  var user = getCurrentUser();
  if (!user) return { error: 'Unauthorized' };

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

// ── Fetch Redmine time entries updated on a given date for a user ──
// Returns issues where the user logged time on the given date,
// with hours worked and progress percentage.
function getRedmineTimeEntries(dateStr) {
  //const todayJST = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy-MM-dd");
  var user = getCurrentUser();
  if (!user) return { error: 'Unauthorized' };

  var redmineUserId = getUserIdByEmail(user.email);
  if (!redmineUserId) {
    return { error: 'Redmineアカウントが見つかりません（メール: ' + user.email + '）' };
  }

  // Fetch time entries for this user on the given date
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

  // Group by issue and sum hours
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

  // Fetch issue details (subject, project, done_ratio) for each
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

function main() {
  const email = "k-kimura@mamiya-its.co.jp";  // ← change this
  const issues = getOpenTicketsByEmail(email);

  issues.forEach(issue => {
    Logger.log(`#${issue.id} | ${issue.subject} | ${issue.status.name} | ${issue.created_on}`);
  });
}



/**
 * Send a telework report approval notification to Mattermost
 * @param {Object} notificationData - Notification details
 * @param {string} notificationData.reportType - 'telework' or 'task'
 * @param {string} notificationData.reportDate - Report date (YYYY-MM-DD)
 * @param {string} notificationData.weekTitle - Week title (e.g., '第14週') for telework reports
 * @param {string} notificationData.employeeName - Employee name
 * @param {string} notificationData.employeeEmail - Employee email (for mentioning)
 * @param {string} notificationData.approverName - Approver's name
 * @param {string} notificationData.decision - 'approved' or 'rejected'
 * @param {string} notificationData.reportUrl - URL to view the report
 * @param {string} channel - Mattermost channel (optional)
 */
function sendMattermostMessage(notificationData, channel) {
  try {
    var date = new Date(notificationData.reportDate);
    var year = Utilities.formatDate(date, "Asia/Tokyo", "yyyy");
    
    // Extract username from email for mention (e.g., "y.toki@example.com" -> "y.toki")
    var mattermostUsername = notificationData.employeeEmail ? 
                            notificationData.employeeEmail.split('@')[0].replace('.', '-') : 
                            'user';
    var mattermostUsername　= 'myintzuko';
    
    // Determine status message
    var statusText = notificationData.decision === 'approved' ? '承認' : 
                     notificationData.decision === 'reviewed' ? '照査' : '却下';
    
    // System URL (you may need to update this to your actual system URL)
    var systemUrl = notificationData.reportUrl || ScriptApp.getService().getUrl();
    
    // Format message header based on report type
    var messageHeader;
    if (notificationData.reportType === 'telework') {
      // Telework report: "2026年 第14週 在宅勤務許可申請書についてのお知らせ"
      messageHeader = year + '年 ' + notificationData.weekTitle + ' 在宅勤務許可申請書についてのお知らせ';
    } else {
      // Task report: "2026/03/27（金） 在宅勤務報告書についてのお知らせ"
      var weekdays = ['日', '月', '火', '水', '木', '金', '土'];
      var formattedDate = Utilities.formatDate(date, "Asia/Tokyo", "yyyy/MM/dd") + 
                         '（' + weekdays[date.getDay()] + '）';
      messageHeader = formattedDate + ' 在宅勤務報告書についてのお知らせ';
    }
    
    // Format message with proper structure
    var message =  messageHeader + '\n\n';
    message += '@' + mattermostUsername + '\n';
    message += '**' + notificationData.approverName + '** により **' + statusText + '** されました。\n';
    message += '[内容をご確認ください](' + systemUrl + ')';
    
    var payload = {
      text: message,
      // channel: channel || 'daily-report',
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
 * Test function to verify Mattermost notifications are working
 * Run this from the Google Apps Script editor to test the notification
 */
function testMattermostNotification() {
  // Test telework report notification
  Logger.log('Testing telework report notification...');
  var teleworkData = {
    reportType: 'telework',
    reportDate: '2026-03-27',
    weekTitle: '第14週',
    employeeName: 'ズーコ',
    employeeEmail: 'ite001702@athuman.com',
    approverName: '海田',
    decision: 'approved',
    reportUrl: ScriptApp.getService().getUrl() + '?page=reports',
  };
  
  var result1 = sendMattermostMessage(teleworkData, 'daily-report');
  
  if (result1.success) {
    Logger.log('✅ Telework report notification sent successfully!');
  } else {
    Logger.log('❌ Telework report notification failed: ' + result1.error);
  }
  
  // Test task report notification
  Logger.log('Testing task report notification...');
  var taskData = {
    reportType: 'task',
    reportDate: '2026-03-27',
    employeeName: 'ズーコ',
    employeeEmail: 'ite001702@athuman.com',
    approverName: '海田',
    decision: 'approved',
    reportUrl: ScriptApp.getService().getUrl() + '?page=task_report',
  };
  
  var result2 = sendMattermostMessage(taskData, 'daily-report');
  
  if (result2.success) {
    Logger.log('✅ Task report notification sent successfully!');
  } else {
    Logger.log('❌ Task report notification failed: ' + result2.error);
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

function getChannelById() {
  channelId = '79s78jijg3yjxcdsxt9q33shha'
  const url = `${MATTERMOST_WEBHOOK_URL}/api/v4/channels/${channelId}`;

  const options = {
    method: "GET",
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const data = JSON.parse(response.getContentText());
    return JSON.parse(response.getContentText());
  } catch(e) {
    return null;
  }
}

// ── Tokyo weather forecast via Open-Meteo ────────────────────
// Returns 7 days starting from today (Japan time).
// Called from Dashboard.html via google.script.run.
function getTokyoWeather() {
  var url =
    'https://api.open-meteo.com/v1/forecast' +
    '?latitude=35.6762&longitude=139.6503' +
    '&daily=weather_code,temperature_2m_max' +
    '&timezone=Asia%2FTokyo&forecast_days=7';

  try {
    var res  = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    var json = JSON.parse(res.getContentText());

    // Open-Meteo returns daily arrays starting from today — use directly
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
//  Daily Pending Notification Scheduler
//
//  SETUP: Run setupDailyTrigger() ONCE from the GAS editor.
//         This installs a time-driven trigger that fires every
//         day at 9 AM JST. Weekend days are skipped automatically.
//
//  LOGIC:
//    • Reviewers  → notified about 'submitted' reports from
//                   employees in their departments.
//    • Managers   → notified about 'reviewer_approved' reports
//                   from employees in their departments.
//  Both telework_reports (在宅勤務許可申請書) and
//  task_reports (在宅勤務報告書) are checked separately.
// ============================================================

function sendDailyPendingNotifications() {
  // Determine current weekday in Japan Standard Time
  var now    = new Date();
  var jstNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  var dow    = jstNow.getDay(); // 0=Sun … 6=Sat
  if (dow === 0 || dow === 6) {
    Logger.log('Skipping: weekend');
    return;
  }

  var WEEKDAYS_JP = ['日', '月', '火', '水', '木', '金', '土'];
  var todayLabel  = Utilities.formatDate(jstNow, 'Asia/Tokyo', 'yyyy/MM/dd') +
                   '（' + WEEKDAYS_JP[dow] + '）';

  var allUsers       = getAllUsers().filter(function(u) { return u.is_active; });
  var allReports     = getAllReports();
  var allTaskReports = getAllTaskReports();
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

  // Mattermost @mention: use the part before @ in their email
  function getMention(user) {
    return user.email ? user.email.split('@')[0].replace(/\./g, '-') : (user.name || 'user');
  }

  // Send one Mattermost webhook message per user
  function notify(user, header, rows) {
    if (!rows.length) return;
    var mention = getMention(user);

    // Markdown table
    var table = '| 書類 | 件数 |\n| :--- | ---: |\n';
    rows.forEach(function(r) { table += '| ' + r.label + ' | ' + r.count + ' 件 |\n'; });

    var text = todayLabel + header + '\n\n' +
               '@' + mention + '\n\n' +
               table + '\n' +
               '[内容を確認する](' + systemUrl + '?page=approve)';

    try {
      UrlFetchApp.fetch(MATTERMOST_WEBHOOK_URL, {
        method:           'POST',
        contentType:      'application/json',
        payload:          JSON.stringify({
          text:        text,
          channel:     'daily-report',
          username:    '日報管理システム',
          icon_emoji:  ':bell:',
        }),
        muteHttpExceptions: true,
      });
      Logger.log('Notified @' + mention);
    } catch (e) {
      Logger.log('Failed to notify @' + mention + ': ' + e.toString());
    }
  }

  // ── Notify reviewers: 'submitted' reports ────────────────
  allUsers.filter(function(u) { return u.role === 'reviewer'; })
    .forEach(function(reviewer) {
      var deptIds = getDeptIds(reviewer);
      if (!deptIds.length) return;
      var empIds  = getEmpIdsForDepts(deptIds);
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

  // ── Notify managers: 'reviewer_approved' reports ─────────
  allUsers.filter(function(u) { return u.role === 'manager'; })
    .forEach(function(manager) {
      var deptIds = getDeptIds(manager);
      if (!deptIds.length) return;
      var empIds  = getEmpIdsForDepts(deptIds);
      if (!empIds.length) return;

      var pendingTelework = allReports.filter(function(r) {
        return r.status === 'reviewer_approved' && empIds.indexOf(r.employee_id) >= 0;
      });
      var pendingTask = allTaskReports.filter(function(r) {
        return r.status === 'reviewer_approved' && empIds.indexOf(r.employee_id) >= 0;
      });

      var rows = [];
      if (pendingTelework.length) rows.push({ label: '在宅勤務許可申請書', count: pendingTelework.length });
      if (pendingTask.length)     rows.push({ label: '在宅勤務報告書',     count: pendingTask.length });

      notify(manager, '承認依頼が届いています。', rows);
    });

  Logger.log('sendDailyPendingNotifications: done');
}

// ── Install the daily trigger (run once from GAS editor) ─────
// Fires every day at 9 AM Asia/Tokyo; weekend skip is handled
// inside sendDailyPendingNotifications().
function setupDailyTrigger() {
  // Remove any existing trigger to avoid duplicates
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'sendDailyPendingNotifications') {
      ScriptApp.deleteTrigger(t);
    }
  });

  ScriptApp.newTrigger('sendDailyPendingNotifications')
    .timeBased()
    .everyDays(1)
    .atHour(9)          // 9 AM in the project timezone
    .inTimezone('Asia/Tokyo')
    .create();

  Logger.log('✅ Daily trigger installed: 9 AM JST weekdays');
  return '✅ Trigger installed';
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
  Logger.log('Removed ' + removed + ' trigger(s)');
  return 'Removed ' + removed + ' trigger(s)';
}
