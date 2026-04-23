# Agent Instructions: Telework System (Google Apps Script)

## Project Overview

This workspace contains a **telework (在宅勤務) reporting system** with two deployment targets:
1. **Next.js application** (primary): See [README.md](../README.md) and [plan.md](../plan.md)
2. **Google Apps Script (GAS)** application: Legacy/alternative deployment in `gas/` folder

This file focuses on the **GAS application** architecture and conventions.

## GAS Application Architecture

### Core Files

- **[gas/Code.gs](../gas/Code.gs)**: Main entry point, routing, template rendering, Redmine/Mattermost integration
- **[gas/Auth.gs](../gas/Auth.gs)**: Authentication (Google Workspace + password fallback), session management
- **[gas/Sheets.gs](../gas/Sheets.gs)**: Data access layer (Google Sheets as database)
- **[gas/*.html](../gas/)**: UI templates (Login, Dashboard, Reports, Approve, Employees, AdminHistory, Calendar, TaskReport)

### Data Model

Uses **Google Sheets** as database with sheets mirroring Drizzle schema:
- `departments`: id, name, created_at
- `users`: id, email, password_hash, name, role, department_id, is_active, created_at, updated_at
- `telework_reports`: id, employee_id, report_type, start_date, end_date, tasks, status, etc.
- `approvals`: id, report_id, approver_id, level, decision, comment, decided_at, created_at
- `task_reports`: id, employee_id, report_date, day_short, important_issues, next_day_plan, status, etc.

### Role-Based Access Control

Four roles with different default pages and permissions:
- **employee**: View/submit own reports → `Reports.html`
- **reviewer**: Review pending reports → `Approve.html`
- **manager**: Approve reviewed reports → `Approve.html`
- **admin**: Full access to dashboard and employee management → `Dashboard.html`

Access control enforced in `doGet()` function in [gas/Code.gs](../gas/Code.gs).

## Development Workflow

### Initial Setup

1. **Set `SPREADSHEET_ID`** in [gas/Code.gs](../gas/Code.gs#L7) to your Google Spreadsheet ID
2. **Run `setupSheets()`** once from GAS editor to create all sheets with headers and seed data
3. **Configure integrations** (optional):
   - `REDMINE_URL` and `API_KEY` in [gas/Code.gs](../gas/Code.gs) for Redmine integration
   - `MATTERMOST_WEBHOOK_URL` for notifications

### Authentication System

Hybrid authentication supporting both Google Workspace and password-based login:

- **Google Workspace auth**: Uses `Session.getActiveUser()` for seamless login (no password needed)
- **Password auth**: SHA-256 hashed passwords stored in `users` sheet
- **Special value**: `password_hash = 'GWS_AUTH_ONLY'` forces Google Workspace-only auth
- **Session cache**: 30-minute user cache via `CacheService.getUserCache()`

**Important**: `getCurrentUser()` reads ONLY from cache, never from `Session.getActiveUser()`, ensuring explicit login required.

### Client-Server Communication

HTML templates call server-side functions via `google.script.run`:

```javascript
// Client-side (in HTML)
google.script.run
  .withSuccessHandler(onSuccess)
  .withFailureHandler(onError)
  .serverFunctionName(arg1, arg2);
```

Server functions are defined in `.gs` files and automatically exposed.

### Template Rendering

Templates use GAS HTML templating with scriptlets:

```html
<!-- Inject JSON-encoded user data -->
<div id="gasVars" data-user='<?!= user ?>' data-url="<?= scriptUrl ?>"></div>

<!-- Include another file -->
<?!= include('SharedHeader') ?>
```

- `<?= ... ?>`: Auto-escaped output
- `<?!= ... ?>`: Raw output (use for JSON/HTML)
- Template variables set in `renderPage()` function

## Code Conventions

### JavaScript Style

- **No TypeScript**: Pure JavaScript (Google Apps Script ES5+)
- **Global variables**: Configuration constants at top of `Code.gs`
- **Function naming**: 
  - Public API functions: camelCase (`getAllReports`, `createUser`)
  - Private helpers: underscore prefix (`_renderDefault`, `_sheetToObjects`)
- **Error handling**: Return `{ error: 'message' }` objects for client-side display

### Date Handling

Google Sheets auto-converts date strings to Date objects. Always normalize:

```javascript
// Columns that hold YYYY-MM-DD values
var _DATE_COLS = ['start_date', 'end_date', 'request_date', 'decided_at', 'report_date'];

// Convert Date objects back to YYYY-MM-DD strings
function _dateStr(val) {
  if (val instanceof Date) {
    return val.getFullYear() + '-' +
      String(val.getMonth() + 1).padStart(2, '0') + '-' +
      String(val.getDate()).padStart(2, '0');
  }
  return String(val);
}
```

### UI/Styling

- **Framework**: Tailwind CSS via CDN (`https://cdn.tailwindcss.com`)
- **Language**: Japanese (日本語) for all UI text
- **Font**: Noto Sans JP
- **Charts**: Chart.js for dashboard visualizations
- **Design**: Slate color scheme with indigo/blue accents

## External Integrations

### Redmine Integration

Functions in [gas/Code.gs](../gas/Code.gs):
- `getOpenTicketsByEmail(email)`: Fetch user's open issues
- `getRedmineTasks()`: Get all open issues for telework reports
- `getRedmineTimeEntries(dateStr)`: Fetch time entries for specific date

**API Authentication**: `X-Redmine-API-Key` header with `API_KEY` constant.

### Mattermost Integration

Function: `sendMattermostMessage(notificationData, channel)` 
- Sends formatted notifications for report approvals
- Webhook URL: `MATTERMOST_WEBHOOK_URL` constant

### Weather API

Function: `getTokyoWeather()` - Fetches Tokyo weather data for dashboard display.

## Common Tasks

### Adding a New Page

1. Create `NewPage.html` in `gas/` folder
2. Add route in `doGet()` function in [gas/Code.gs](../gas/Code.gs)
3. Add navigation link in sidebar (check existing HTML files)
4. Add role-based access control if needed

### Adding a Server Function

1. Define function in appropriate `.gs` file (Code.gs for general, Sheets.gs for data access)
2. Use from client with `google.script.run.yourFunctionName()`
3. Return JSON-serializable objects (no Date objects directly)

### Modifying Database Schema

1. Update sheet structure in `setupSheets()` in [gas/Sheets.gs](../gas/Sheets.gs)
2. Update corresponding CRUD functions
3. Run `setupSheets()` on a new spreadsheet or manually update existing sheets
4. Keep schema in sync with Drizzle schema in `src/db/schema/`

## Testing

- **Manual testing**: Deploy as web app (GAS editor → Deploy → Test deployments)
- **Logging**: Use `Logger.log()` for server-side debugging (View → Logs in GAS editor)
- **Client logging**: Use `console.log()` in browser DevTools

## Deployment

1. Open GAS editor (paste all `.gs` and `.html` files)
2. Deploy → New deployment
3. Execute as: User accessing the web app
4. Who has access: Anyone (or specific domain)
5. Copy Web app URL for distribution

## Known Limitations

- **No TypeScript**: GAS doesn't support TypeScript compilation
- **No npm packages**: Can only use GAS built-in services + CDN libraries
- **No async/await**: Must use callbacks for `google.script.run`
- **Cache timeout**: User sessions expire after 30 minutes (CacheService limit)
- **Sheet performance**: Large datasets may require optimization (consider pagination)

## Related Documentation

- [README.md](../README.md) - Next.js deployment instructions
- [plan.md](../plan.md) - Original project architecture plan
- [gas/# Code Citations.md](../gas/# Code Citations.md) - Code attribution notes
