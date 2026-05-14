# GAS Performance Optimization Plan for 100 Employees

## TL;DR

Optimize the Google Apps Script + Sheets application to handle **100 concurrent users** with **<2 second response times**. Implement server-side caching, lookup maps, batch operations, and concurrent access protection.

---

## Current State Analysis

| Issue | Impact | Root Cause |
|-------|--------|------------|
| 5 full table scans per page load | 3-5 second latency | No caching, cascading getAllX() calls |
| Linear searches O(n) | CPU bottleneck | getUserById() loops through 100+ users |
| No concurrent write protection | Data corruption risk | Multiple users writing simultaneously |
| 26,000+ rows per year | Growing latency | No pagination or date filtering |

**Expected Data Volumes (100 employees):**
- users: ~100 rows (stable)
- departments: ~20 rows (stable)
- telework_reports: ~26,000 rows/year
- task_reports: ~26,000 rows/year
- approvals: ~52,000 rows/year

---

## Implementation Phases

### Phase 1: Server-Side Caching ✅ IMPLEMENTED
- [x] Add caching layer with 5-minute TTL
- [x] Cache getAllUsers(), getAllDepartments(), getAllReports(), getAllTaskReports(), getAllApprovals()
- [x] Add cache invalidation on data changes
- [x] Add lookup maps for O(1) user/department access
- [x] **FIX**: Clear ALL lookup maps (including _approvalsByReportMap) on ANY cache invalidation
- [x] **FIX**: Add missing _invalidateCache() calls to saveDayDraft(), submitWeekReport(), updateUserProfile()

### Phase 2: Batch Operations ✅ IMPLEMENTED
- [x] Replace row-by-row updates with batch setValues()
- [x] Optimize cascading reads in getPendingReports()
- [x] Batch user lookups in report lists
- [x] Add O(1) approval lookup map by report_id

### Phase 3: Concurrent Access Protection ✅ IMPLEMENTED
- [x] Add LockService for write operations (30-second timeout)
- [x] Add duplicate submission prevention with status checks
- [x] Wrap critical functions: submitTaskReport, reviewTaskReportAction, approveTaskReportAction, rejectTaskReportAction, deleteTeleworkDay, deleteTaskDay

### Phase 4: Data Volume Management ✅ IMPLEMENTED
- [x] Add date-range filtering for reports (default: last 3 months)
- [x] Add pagination helper for large datasets (default: 50 items/page)
- [x] Add paginated admin report functions with filters

### Phase 5: Client-Side Optimizations (TODO)
- [ ] Add sessionStorage caching
- [ ] Debounce saveDayDraft()

---

## Expected Performance After Optimization

| Metric | Before | After |
|--------|--------|-------|
| Page load time | 3-5 seconds | <2 seconds |
| getUserById() | 500ms (O(n)) | 1ms (O(1)) |
| getApprovalsByReport() | O(n) scan | O(1) map lookup |
| _updateRow() | N setValue() calls | 1 setValues() call |
| Concurrent users supported | 10-15 | 50-100 |
| Write conflicts | Possible | Protected by LockService |
| Duplicate submissions | Possible | Prevented by status checks |
| Load 26,000 reports | 5+ seconds | 1-2 seconds (filtered) |
| Admin history page | All records | Paginated (50/page) |

---

## Files Modified

- `gas/Sheets.gs` - Caching layer, lookup maps, batch operations, LockService, duplicate prevention
- `gas/Code.gs` - Server functions optimization
- `gas/Reports.html` - Client-side debouncing (Phase 5)

---

## Implementation Details

### Phase 2: Batch Operations

**`_updateRow()` Optimization:**
```javascript
// Before: Multiple setValue() calls in loop
headers.forEach(function (h, c) {
  if (updates[h] !== undefined) sheet.getRange(i + 1, c + 1).setValue(updates[h]);
});

// After: Single setValues() call
var newRow = data[i].slice();
headers.forEach(function (h, c) {
  if (updates[h] !== undefined) newRow[c] = updates[h];
});
sheet.getRange(i + 1, 1, 1, headers.length).setValues([newRow]);
```

**`_updateRowsBatch()` for Bulk Operations:**
```javascript
function _updateRowsBatch(sheetName, updates, headers) {
  // Batch update multiple rows in single setValues() call
  // Returns count of rows updated
}
```

**Approval Lookup Map:**
```javascript
function _buildApprovalMap() {
  // Groups approvals by report_id for O(1) access
  _approvalsByReportMap = {};
  approvals.forEach(function(a) {
    if (!_approvalsByReportMap[a.report_id]) {
      _approvalsByReportMap[a.report_id] = [];
    }
    _approvalsByReportMap[a.report_id].push(a);
  });
}

function getApprovalsByReportFast(reportId) {
  _buildApprovalMap();
  return _approvalsByReportMap[reportId] || [];
}
```

### Phase 3: Concurrent Access Protection

**LockService Wrapper:**
```javascript
function _withLock(lockName, fn) {
  var lock = LockService.getScriptLock();
  var acquired = lock.tryLock(30000); // 30 second timeout
  if (!acquired) {
    return { error: 'サーバーが混み合っています。' };
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}
```

**Duplicate Submission Prevention:**
```javascript
function _checkDuplicateSubmission(sheetName, criteria, headers, excludeStatuses) {
  // Returns existing record if duplicate found
  // excludeStatuses: ['draft', 'rejected'] - don't count these as duplicates
}
```

**Protected Functions:**
- `submitTaskReport()` - Prevents double-submission
- `reviewTaskReportAction()` - Prevents concurrent review
- `approveTaskReportAction()` - Prevents concurrent approval
- `rejectTaskReportAction()` - Prevents concurrent rejection
- `deleteTeleworkDay()` - Prevents concurrent deletion
- `deleteTaskDay()` - Prevents concurrent deletion

### Phase 4: Data Volume Management

**Date Range Filtering:**
```javascript
// Default to last 3 months for performance
var DEFAULT_MONTHS_BACK = 3;

function getReportsInDateRange(startDate, endDate, employeeId) {
  // Returns reports within date range, filtered by employee if specified
  // Defaults: startDate = 3 months ago, endDate = today
}

function getTaskReportsInDateRange(startDate, endDate, employeeId) {
  // Same for task reports
}
```

**Pagination Helper:**
```javascript
function _paginate(data, page, pageSize) {
  // Returns: { items, page, pageSize, totalPages, totalItems, hasMore }
  // Default pageSize: 50
}
```

**Paginated Admin API Functions:**
- `getAdminTeleworkReportsPaginated(options)` - Admin view with filters
- `getAdminTaskReportsPaginated(options)` - Admin view with filters

Options: `{ startDate, endDate, page, pageSize, status, employeeId }`

**Expected Impact:**
| Scenario | Before | After |
|----------|--------|-------|
| Load 26,000 reports | 5+ seconds | 1-2 seconds (3-month filter) |
| Admin history page | All records loaded | 50 per page, filtered |