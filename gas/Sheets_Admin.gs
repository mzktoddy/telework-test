// =============================================================================
// Sheets_Admin.gs — 管理者機能
// 管理者向けの履歴表示・エクスポート・ダッシュボード・週集計などを定義する
// =============================================================================

// ── 管理者履歴 ───────────────────────────────────────────────

// 全在宅勤務申請を従業員名・部署名付きで返す（管理者専用）
function getAdminTeleworkReports() {
  var user = getCurrentUser();
  if (!user || user.role !== 'admin') return { error: 'Unauthorized' };

  var reports = getAllReports();
  var users   = getAllUsers();
  var depts   = getAllDepartments();

  return reports.map(function(r) {
    var emp  = users.find(function(u) { return u.id === r.employee_id; }) || null;
    var dept = (emp && emp.department_id)
      ? depts.find(function(d) { return d.id === emp.department_id; })
      : null;
    return {
      id:            r.id,
      employee_id:   r.employee_id,
      employee_name: emp  ? emp.name  : '不明',
      department:    dept ? dept.name : '未設定',
      report_type:   r.report_type  || '',
      request_date:  r.request_date || '',
      week_title:    r.week_title   || '',
      start_date:    r.start_date   || '',
      end_date:      r.end_date     || '',
      work_type:     r.work_type    || '',
      day_short:     r.day_short    || '',
      notes:         r.notes        || '',
      redmine_tasks: r.redmine_tasks || '[]',
      status:        r.status       || '',
      created_at:    r.created_at   || '',
    };
  });
}

// 全日報を従業員名・部署名付きで返す（管理者専用）
function getAdminTaskReports() {
  var user = getCurrentUser();
  if (!user || user.role !== 'admin') return { error: 'Unauthorized' };

  var reports = _sheetToObjects(getSheet(SHEET_TASK_REPORTS));
  var users   = getAllUsers();
  var depts   = getAllDepartments();

  return reports.map(function(r) {
    var emp        = users.find(function(u) { return u.id === r.employee_id; }) || null;
    var empDeptIds = _parseDeptIds(emp ? emp.department_id : '');
    var deptNames  = empDeptIds.map(function(id) {
      var d = depts.find(function(dept) { return dept.id === id; });
      return d ? d.name : null;
    }).filter(Boolean);

    return {
      id:               r.id,
      employee_id:      r.employee_id,
      employee_name:    emp  ? emp.name  : '不明',
      department:       deptNames.length > 0 ? deptNames.join(', ') : '未設定',
      department_id:    emp  ? (emp.department_id || '') : '',
      report_date:      r.report_date      || '',
      day_short:        r.day_short        || '',
      important_issues: r.important_issues || '',
      next_day_plan:    r.next_day_plan    || '',
      redmine_tasks:    r.redmine_tasks    || '[]',
      status:           r.status           || '',
      created_at:       r.created_at       || '',
    };
  });
}

// 在宅勤務申請を日付範囲・ページネーション付きで返す（管理者専用）
// options: { startDate, endDate, page, pageSize, status, employeeId, employeeName, weekSundayKey }
function getAdminTeleworkReportsPaginated(options) {
  var user = getCurrentUser();
  if (!user || user.role !== 'admin') return { error: 'Unauthorized' };

  options = options || {};
  var reports = getReportsInDateRange(options.startDate, options.endDate, options.employeeId);

  // 下書きは表示しない
  reports = reports.filter(function(r) { return r.status !== 'draft'; });

  var users = getAllUsers();
  var depts = getAllDepartments();
  var userMap = {};
  users.forEach(function(u) { userMap[u.id] = u; });
  var deptMap = {};
  depts.forEach(function(d) { deptMap[d.id] = d; });

  // request_date の実際の日付範囲でさらに絞り込む
  // （start_date でのフィルタだと週またぎの日付が漏れる場合があるため）
  if (options.startDate || options.endDate) {
    var reqStart = options.startDate ? new Date(options.startDate) : null;
    var reqEnd   = options.endDate   ? new Date(options.endDate)   : null;
    if (reqEnd) reqEnd.setHours(23, 59, 59, 999);
    reports = reports.filter(function(r) {
      if (!r.request_date) return true;
      var reqDate = new Date(r.request_date);
      if (reqStart && reqDate < reqStart) return false;
      if (reqEnd   && reqDate > reqEnd)   return false;
      return true;
    });
  }

  // ステータスフィルタ
  if (options.status) {
    reports = reports.filter(function(r) { return r.status === options.status; });
  }

  // 週フィルタ（日曜〜土曜）
  if (options.weekSundayKey) {
    var weekSunday   = new Date(options.weekSundayKey);
    var weekSaturday = new Date(weekSunday);
    weekSaturday.setDate(weekSunday.getDate() + 6);
    weekSaturday.setHours(23, 59, 59, 999);
    reports = reports.filter(function(r) {
      if (!r.request_date) return false;
      var d = new Date(r.request_date);
      return d >= weekSunday && d <= weekSaturday;
    });
  }

  var mapped = reports.map(function(r) {
    var emp  = userMap[r.employee_id] || null;
    var dept = (emp && emp.department_id) ? deptMap[emp.department_id] : null;
    return {
      id:                  r.id,
      employee_id:         r.employee_id,
      employee_name:       emp  ? emp.name  : '不明',
      employee_name_lower: emp  ? emp.name.toLowerCase() : '',
      department:          dept ? dept.name : '未設定',
      report_type:         r.report_type  || '',
      request_date:        r.request_date || '',
      week_title:          r.week_title   || '',
      start_date:          r.start_date   || '',
      end_date:            r.end_date     || '',
      work_type:           r.work_type    || '',
      day_short:           r.day_short    || '',
      notes:               r.notes        || '',
      redmine_tasks:       r.redmine_tasks || '[]',
      status:              r.status       || '',
      created_at:          r.created_at   || '',
    };
  });

  // 従業員名検索
  if (options.employeeName && options.employeeName.trim()) {
    var searchTerm = options.employeeName.trim().toLowerCase();
    mapped = mapped.filter(function(r) {
      return r.employee_name_lower.indexOf(searchTerm) !== -1;
    });
  }

  mapped.forEach(function(r) { delete r.employee_name_lower; });
  mapped.sort(function(a, b) {
    return new Date(b.start_date).getTime() - new Date(a.start_date).getTime();
  });

  return _paginate(mapped, options.page, options.pageSize);
}

// 日報を日付範囲・ページネーション付きで返す（管理者専用）
// options: { startDate, endDate, page, pageSize, status, employeeId, employeeName, weekSundayKey }
function getAdminTaskReportsPaginated(options) {
  var user = getCurrentUser();
  if (!user || user.role !== 'admin') return { error: 'Unauthorized' };

  options = options || {};
  var reports = getTaskReportsInDateRange(options.startDate, options.endDate, options.employeeId);

  // 下書きは表示しない
  reports = reports.filter(function(r) { return r.status !== 'draft'; });

  var users = getAllUsers();
  var depts = getAllDepartments();
  var userMap = {};
  users.forEach(function(u) { userMap[u.id] = u; });
  var deptMap = {};
  depts.forEach(function(d) { deptMap[d.id] = d; });

  // ステータスフィルタ
  if (options.status) {
    reports = reports.filter(function(r) { return r.status === options.status; });
  }

  // 週フィルタ（日曜〜土曜）
  if (options.weekSundayKey) {
    var weekSunday   = new Date(options.weekSundayKey);
    var weekSaturday = new Date(weekSunday);
    weekSaturday.setDate(weekSunday.getDate() + 6);
    weekSaturday.setHours(23, 59, 59, 999);
    reports = reports.filter(function(r) {
      if (!r.report_date) return false;
      var d = new Date(r.report_date);
      return d >= weekSunday && d <= weekSaturday;
    });
  }

  var mapped = reports.map(function(r) {
    var emp        = userMap[r.employee_id] || null;
    var empDeptIds = _parseDeptIds(emp ? emp.department_id : '');
    var deptNames  = empDeptIds.map(function(id) {
      var d = deptMap[id];
      return d ? d.name : null;
    }).filter(Boolean);

    return {
      id:                  r.id,
      employee_id:         r.employee_id,
      employee_name:       emp  ? emp.name  : '不明',
      employee_name_lower: emp  ? emp.name.toLowerCase() : '',
      department:          deptNames.length > 0 ? deptNames.join(', ') : '未設定',
      department_id:       emp  ? (emp.department_id || '') : '',
      report_date:         r.report_date      || '',
      day_short:           r.day_short        || '',
      important_issues:    r.important_issues || '',
      next_day_plan:       r.next_day_plan    || '',
      redmine_tasks:       r.redmine_tasks    || '[]',
      status:              r.status           || '',
      created_at:          r.created_at       || '',
    };
  });

  // 従業員名検索
  if (options.employeeName && options.employeeName.trim()) {
    var searchTerm = options.employeeName.trim().toLowerCase();
    mapped = mapped.filter(function(r) {
      return r.employee_name_lower.indexOf(searchTerm) !== -1;
    });
  }

  mapped.forEach(function(r) { delete r.employee_name_lower; });
  mapped.sort(function(a, b) {
    return new Date(b.report_date).getTime() - new Date(a.report_date).getTime();
  });

  return _paginate(mapped, options.page, options.pageSize);
}

// 日付範囲内で利用可能な週の一覧を返す（管理者履歴画面の週選択用）
// options: { startDate, endDate, reportType }
function getAvailableWeeksForDateRange(options) {
  var user = getCurrentUser();
  if (!user || user.role !== 'admin') return { error: 'Unauthorized' };

  options = options || {};
  var reportType = options.reportType || 'telework';

  // 日付範囲を解決（デフォルト: 直近1ヶ月）
  var today     = new Date();
  today.setHours(0, 0, 0, 0);
  var endDate   = options.endDate   ? new Date(options.endDate)   : new Date(today);
  endDate.setHours(0, 0, 0, 0);
  var startDate = options.startDate ? new Date(options.startDate) : (function() {
    var d = new Date(today);
    d.setMonth(d.getMonth() - 1);
    return d;
  })();
  startDate.setHours(0, 0, 0, 0);

  // スクリプトキャッシュで5分間保持
  var startKey = _formatDateKey(startDate);
  var endKey   = _formatDateKey(endDate);
  var cacheKey = 'weeks_' + reportType + '_' + startKey + '_' + endKey;
  var cache    = CacheService.getScriptCache();
  var cached   = cache.get(cacheKey);
  if (cached) {
    try { return JSON.parse(cached); } catch (e) {}
  }

  // startDate の直前の日曜日から週単位でループ
  var dow = startDate.getDay();
  var cur = new Date(startDate);
  cur.setDate(startDate.getDate() - dow);
  cur.setHours(0, 0, 0, 0);

  var weeks = [];
  while (cur <= endDate) {
    var sun = new Date(cur);
    var sat = new Date(cur);
    sat.setDate(cur.getDate() + 6);

    // ISO 週番号を算出
    var utcD   = new Date(Date.UTC(sun.getFullYear(), sun.getMonth(), sun.getDate()));
    var utcDay = utcD.getUTCDay() || 7;
    utcD.setUTCDate(utcD.getUTCDate() + 4 - utcDay);
    var yearStart = new Date(Date.UTC(utcD.getUTCFullYear(), 0, 1));
    var weekNum   = Math.ceil(((utcD - yearStart) / 86400000 + 1) / 7);

    var sunStr = _formatDateKey(sun);
    var satStr = _formatDateKey(sat);

    weeks.push({
      sundayKey: sunStr,
      label:     '第' + weekNum + '週 ' + sunStr + '（日）〜' + satStr + '（土）',
      timestamp: sun.getTime(),
    });

    cur.setDate(cur.getDate() + 7);
  }

  // 新しい週順（降順）にソート
  weeks.sort(function(a, b) { return b.timestamp - a.timestamp; });

  try { cache.put(cacheKey, JSON.stringify(weeks), 300); } catch (e) {}
  return weeks;
}

// ── 削除（管理者） ────────────────────────────────────────────

// 在宅勤務申請を管理者権限で削除する
function adminDeleteTeleworkReport(id) {
  var user = getCurrentUser();
  if (!user || user.role !== 'admin') return { error: 'Unauthorized' };
  _deleteAssociatedApprovals(id);
  var result = _deleteRowById(SHEET_REPORTS, id);
  _invalidateCache(CACHE_KEY_REPORTS);
  return result;
}

// 在宅勤務申請を一括削除する（レースコンディション対策）
function adminBulkDeleteTeleworkReports(ids) {
  var user = getCurrentUser();
  if (!user || user.role !== 'admin') return { error: 'Unauthorized' };
  if (!ids || ids.length === 0) return { success: true, deleted: 0, failed: 0 };
  
  var deleted = 0;
  var failed = 0;
  
  // IDs配列をコピーして処理
  var idsToProcess = ids.slice();
  
  idsToProcess.forEach(function(id) {
    try {
      _deleteAssociatedApprovals(id);
      var result = _deleteRowById(SHEET_REPORTS, id);
      if (result) {
        deleted++;
      } else {
        failed++;
      }
    } catch (e) {
      Logger.log('Error deleting report ' + id + ': ' + e);
      failed++;
    }
  });
  
  _invalidateCache(CACHE_KEY_REPORTS);
  return { success: true, deleted: deleted, failed: failed };
}

// 日報を管理者権限で削除する
function adminDeleteTaskReport(id) {
  var user = getCurrentUser();
  if (!user || user.role !== 'admin') return { error: 'Unauthorized' };
  _deleteAssociatedApprovals(id);
  var result = _deleteRowById(SHEET_TASK_REPORTS, id);
  _invalidateCache(CACHE_KEY_TASK_REPORTS);
  return result;
}

// 日報を一括削除する（レースコンディション対策）
function adminBulkDeleteTaskReports(ids) {
  var user = getCurrentUser();
  if (!user || user.role !== 'admin') return { error: 'Unauthorized' };
  if (!ids || ids.length === 0) return { success: true, deleted: 0, failed: 0 };
  
  var deleted = 0;
  var failed = 0;
  
  // IDs配列をコピーして処理
  var idsToProcess = ids.slice();
  
  idsToProcess.forEach(function(id) {
    try {
      _deleteAssociatedApprovals(id);
      var result = _deleteRowById(SHEET_TASK_REPORTS, id);
      if (result) {
        deleted++;
      } else {
        failed++;
      }
    } catch (e) {
      Logger.log('Error deleting task report ' + id + ': ' + e);
      failed++;
    }
  });
  
  _invalidateCache(CACHE_KEY_TASK_REPORTS);
  return { success: true, deleted: deleted, failed: failed };
}

// ── エクスポート ──────────────────────────────────────────────

// オブジェクト配列をスプレッドシート内の新規シートにエクスポートする
function adminExportToSheet(rows, sheetTitle) {
  var user = getCurrentUser();
  if (!user || user.role !== 'admin') return { error: 'Unauthorized' };
  if (!rows || rows.length === 0) return { error: 'データがありません' };

  var ss   = getSpreadsheet();
  var name = sheetTitle || ('エクスポート_' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd_HH-mm'));

  // 同名シートが存在する場合は削除して再作成
  var existing = ss.getSheetByName(name);
  if (existing) ss.deleteSheet(existing);

  var sheet   = ss.insertSheet(name);
  var headers = Object.keys(rows[0]);
  sheet.getRange(1, 1, 1, headers.length)
       .setValues([headers])
       .setFontWeight('bold')
       .setBackground('#1e293b')
       .setFontColor('#ffffff');

  var dataRows = rows.map(function(r) {
    return headers.map(function(h) { return r[h] !== undefined ? r[h] : ''; });
  });
  sheet.getRange(2, 1, dataRows.length, headers.length).setValues(dataRows);
  SpreadsheetApp.flush();

  return { success: true, sheetName: name };
}

// フィルタ条件に一致するレコードを Google Drive の新規スプレッドシートにエクスポートする
// options: { reportType, startDate, endDate, status, employeeId, employeeName, weekSundayKey, folderId }
function adminExportFiltered(options) {
  var user = getCurrentUser();
  if (!user || user.role !== 'admin') return { error: 'Unauthorized' };

  options = options || {};
  var reportType = options.reportType || 'telework';

  // 画面に表示されているフィルタ条件をすべて引き継いでデータを取得する
  var filterOptions = {
    startDate:    options.startDate    || null,
    endDate:      options.endDate      || null,
    status:       options.status       || null,
    employeeId:   options.employeeId   || null,
    employeeName: options.employeeName || null,
    weekSundayKey: options.weekSundayKey || null,
    page:         1,
    pageSize:     10000,
  };

  var rows;
  if (reportType === 'task') {
    rows = getAdminTaskReportsPaginated(filterOptions).items;
  } else {
    rows = getAdminTeleworkReportsPaginated(filterOptions).items;
  }

  // 下書きを除外
  rows = rows.filter(function(r) { return r.status !== 'draft'; });

  if (rows.length === 0) return { error: 'エクスポートするデータがありません' };

  // 新規スプレッドシートを作成
  var timestamp  = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd_HH-mm');
  var typeLabel  = reportType === 'task' ? '日報' : '在宅勤務申請';
  var ssName     = typeLabel + '_エクスポート_' + timestamp;
  var newSS      = SpreadsheetApp.create(ssName);
  var sheet      = newSS.getActiveSheet();
  sheet.setName(typeLabel);

  var headers  = Object.keys(rows[0]);
  sheet.getRange(1, 1, 1, headers.length)
       .setValues([headers])
       .setFontWeight('bold')
       .setBackground('#1e293b')
       .setFontColor('#ffffff');

  var dataRows = rows.map(function(r) {
    return headers.map(function(h) { return r[h] !== undefined ? r[h] : ''; });
  });
  sheet.getRange(2, 1, dataRows.length, headers.length).setValues(dataRows);

  // 指定フォルダに移動する（未指定の場合はマイドライブ直下）
  var file = DriveApp.getFileById(newSS.getId());
  if (options.folderId) {
    try {
      var folder = DriveApp.getFolderById(options.folderId);
      folder.addFile(file);
      DriveApp.getRootFolder().removeFile(file);
    } catch (e) {
      Logger.log('フォルダ移動エラー: ' + e.toString());
    }
  }

  SpreadsheetApp.flush();
  return { success: true, url: newSS.getUrl(), name: ssName };
}

// 新規スプレッドシートにエクスポートする（adminExportFiltered の旧バージョン互換）
// dataType: 'telework' | 'task', dateFrom・dateTo: YYYY-MM-DD
function adminExportToNewSpreadsheet(dataType, dateFrom, dateTo) {
  var user = getCurrentUser();
  if (!user || user.role !== 'admin') return { error: 'Unauthorized' };

  var rows;
  if (dataType === 'task') {
    rows = getAdminTaskReports();
  } else {
    rows = getAdminTeleworkReports();
  }

  // 下書きを除外
  rows = rows.filter(function(r) { return r.status !== 'draft'; });

  // 日付範囲フィルタ
  if (dateFrom || dateTo) {
    var from = dateFrom ? new Date(dateFrom) : null;
    var to   = dateTo   ? new Date(dateTo)   : null;
    if (to) to.setHours(23, 59, 59, 999);
    rows = rows.filter(function(r) {
      var dateField = r.request_date || r.report_date;
      if (!dateField) return true;
      var d = new Date(dateField);
      if (from && d < from) return false;
      if (to   && d > to)   return false;
      return true;
    });
  }

  if (rows.length === 0) return { error: 'エクスポートするデータがありません' };

  var timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd_HH-mm');
  var typeLabel = dataType === 'task' ? '日報' : '在宅勤務申請';
  var ssName    = typeLabel + '_エクスポート_' + timestamp;
  var newSS     = SpreadsheetApp.create(ssName);
  var sheet     = newSS.getActiveSheet();
  sheet.setName(typeLabel);

  var headers = Object.keys(rows[0]);
  sheet.getRange(1, 1, 1, headers.length)
       .setValues([headers])
       .setFontWeight('bold')
       .setBackground('#1e293b')
       .setFontColor('#ffffff');

  var dataRows = rows.map(function(r) {
    return headers.map(function(h) { return r[h] !== undefined ? r[h] : ''; });
  });
  sheet.getRange(2, 1, dataRows.length, headers.length).setValues(dataRows);
  SpreadsheetApp.flush();

  return { success: true, url: newSS.getUrl(), name: ssName };
}

// ── ダッシュボード ────────────────────────────────────────────

// 管理者ダッシュボード用: 当週（月〜金）の在宅勤務・日報状況を返す
function getAdminDashboardData() {
  var user = getCurrentUser();
  if (!user || user.role !== 'admin') return { error: 'Unauthorized' };

  var weekDays = _getCurrentWeekDays();

  var totalEmployees = getAllUsers().filter(function(u) {
    return u.role === 'employee' && u.is_active;
  }).length;

  // 在宅勤務・出社の日別集計（承認済みのみ）
  var allReports = getAllReports();
  var teleworkData = weekDays.map(function(date) {
    var dayRows = allReports.filter(function(r) {
      return _dateStr(r.request_date) === date && r.status === 'approved';
    });
    return {
      date:     date,
      telework: dayRows.filter(function(r) { return r.work_type === '在宅勤務'; }).length,
      office:   dayRows.filter(function(r) { return r.work_type === '出社'; }).length,
    };
  });

  // 日報提出数の日別集計（下書き除く）
  var taskReports = _sheetToObjects(getSheet(SHEET_TASK_REPORTS));
  var reportData  = weekDays.map(function(date) {
    var submitted = taskReports.filter(function(r) {
      return _dateStr(r.report_date) === date && r.status !== 'draft';
    }).length;
    return {
      date:      date,
      submitted: submitted,
      missing:   Math.max(0, totalEmployees - submitted),
    };
  });

  return {
    weekDays:       weekDays,
    totalEmployees: totalEmployees,
    teleworkData:   teleworkData,
    reportData:     reportData,
  };
}

// 部署ダッシュボード用: 当週の在宅勤務・日報状況を返す（非管理者用）
// admin の場合は getAdminDashboardData に委譲する
function getDepartmentDashboardData() {
  var user = getCurrentUser();
  if (!user) return { error: 'Unauthorized' };

  if (user.role === 'admin') return getAdminDashboardData();

  var userDeptIds  = _parseDeptIds(user.department_id);
  if (userDeptIds.length === 0) return { error: 'ユーザーに部門が割り当てられていません' };

  var childDeptIds = getChildDepartmentsOnly(userDeptIds);
  if (childDeptIds.length === 0) return { error: 'ユーザーに子部門が割り当てられていません' };

  var weekDays   = _getCurrentWeekDays();

  // 対象部署の有効従業員
  var deptUsers  = getUsersByDepartments(childDeptIds).filter(function(u) {
    return u.role === 'employee' && u.is_active;
  });
  var deptUserIds    = deptUsers.map(function(u) { return u.id; });
  var totalEmployees = deptUsers.length;

  // 在宅勤務・出社の日別集計（承認済みのみ）
  var allReports   = getAllReports();
  var teleworkData = weekDays.map(function(date) {
    var dayRows = allReports.filter(function(r) {
      return _dateStr(r.request_date) === date &&
             r.status === 'approved' &&
             deptUserIds.indexOf(r.employee_id) >= 0;
    });
    return {
      date:     date,
      telework: dayRows.filter(function(r) { return r.work_type === '在宅勤務'; }).length,
      office:   dayRows.filter(function(r) { return r.work_type === '出社'; }).length,
    };
  });

  // 日報提出数の日別集計（部署内従業員のみ）
  var taskReports = _sheetToObjects(getSheet(SHEET_TASK_REPORTS));
  var reportData  = weekDays.map(function(date) {
    var submitted = taskReports.filter(function(r) {
      return _dateStr(r.report_date) === date &&
             r.status !== 'draft' &&
             deptUserIds.indexOf(r.employee_id) >= 0;
    }).length;
    return {
      date:      date,
      submitted: submitted,
      missing:   Math.max(0, totalEmployees - submitted),
    };
  });

  return {
    weekDays:       weekDays,
    totalEmployees: totalEmployees,
    teleworkData:   teleworkData,
    reportData:     reportData,
  };
}

// ── プライベートヘルパー ──────────────────────────────────────

// 当週の月〜金の日付文字列配列を返す
function _getCurrentWeekDays() {
  var today  = new Date();
  var dow    = today.getDay();
  var offset = dow === 0 ? -6 : 1 - dow;
  var monday = new Date(today);
  monday.setDate(today.getDate() + offset);
  monday.setHours(0, 0, 0, 0);

  var days = [];
  for (var i = 0; i < 5; i++) {
    var d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push(_dateStr(d));
  }
  return days;
}

// Date オブジェクトを YYYY-MM-DD 文字列に変換する（週キー生成用）
function _formatDateKey(date) {
  return date.getFullYear() + '-' +
    String(date.getMonth() + 1).padStart(2, '0') + '-' +
    String(date.getDate()).padStart(2, '0');
}
