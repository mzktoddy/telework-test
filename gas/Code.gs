// ============================================================
//  Code.gs — Main entry point, routing, template helpers
//
//  STEP 1: Set SPREADSHEET_ID to your Google Spreadsheet ID.
//          (Create a blank sheet → copy the ID from the URL)
// ============================================================

var SPREADSHEET_ID = '1yJMqIrqETSMCObKWyMLcUzV7cjSTEDAKDajVZfQOdSY'; // ← Paste your Spreadsheet ID here
var REDMINE_URL = 'https://pm.fs-revolution.info';
var API_KEY = '5a50bf5242d0d4f2d9bcfa174b59fbffb9944ab2';
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

  // No page param → render the user's role-default page
  if (!page) {
    return _renderDefault(user);
  }

  // Role-based access control
  if (page === 'reports') {
    return renderPage('Reports', user);
  }

  if (page === 'approve') {
    if (user.role === 'reviewer' || user.role === 'manager' || user.role === 'admin') {
      return renderPage('Approve', user);
    }
    return _renderDefault(user); // not authorised → their own default
  }

  if (page === 'employees') {
    if (user.role === 'admin') {
      return renderPage('Employees', user);
    }
    return _renderDefault(user); // not authorised → their own default
  }

  // Unknown page → role default
  return _renderDefault(user);
}

// ── Render the correct template for a user's role ─────────────
function _renderDefault(user) {
  var p = getDefaultPage(user.role); // returns 'reports' | 'approve' | 'employees'
  if (p === 'approve')   return renderPage('Approve',   user);
  if (p === 'employees') return renderPage('Employees', user);
  return renderPage('Reports', user);
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
    .setTitle('テレワーク・プロ')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ── Template include helper ──────────────────────────────────
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ── Role → default page mapping (also used by Auth.gs) ──────
function getDefaultPage(role) {
  if (role === 'reviewer' || role === 'manager') return 'approve';
  if (role === 'admin') return 'employees';
  return 'reports';
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
function _getRedmineTasks() {
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

function main() {
  const email = "k-kimura@mamiya-its.co.jp";  // ← change this
  const issues = getOpenTicketsByEmail(email);

  issues.forEach(issue => {
    Logger.log(`#${issue.id} | ${issue.subject} | ${issue.status.name} | ${issue.created_on}`);
  });
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
