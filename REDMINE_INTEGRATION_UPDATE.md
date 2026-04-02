# Redmine Integration Update

## Overview
Updated the telework system to properly retrieve and manage Redmine tasks with a checkbox-based interface.

## Changes Made

### 1. Sheets.gs - `getRedmineTasks()` Function
**Location**: Lines 553+

**Updates**:
- Enhanced to fetch open issues from Redmine API assigned to the current user
- Filters out closed/resolved issues
- Filters based on due date (includes issues without due date or due >= today)
- Returns enriched task data including:
  - `id` - Issue ID
  - `subject` - Issue title
  - `status` - Current status
  - `project` - Project name
  - `priority` - Priority level
  - `dueDate` - Due date (if set)
- Reads Redmine credentials from Code.gs constants or Script Properties
- Increased limit from 50 to 100 issues
- Better error handling and logging

### 2. Reports.html - UI Updates

#### State Management
- Added `availableTasks` object to cache fetched Redmine tasks by day index
- This allows checkboxes to reference the full task data

#### Redmine Task Display
**New `renderRedmineTasks()` function**:
- **From Saved Data Mode**: Displays previously saved tasks with green checkmarks (read-only)
- **Fresh Sync Mode**: Displays interactive checkboxes for task selection
- Shows detailed task information:
  - Issue number and subject
  - Project name
  - Status and priority
  - Due date

#### Task Selection
**New `toggleRedmineTask()` function**:
- Handles checkbox changes
- Adds/removes tasks from `dayData[idx].redmineTasks`
- Maintains selection state

#### Sync Button
**Updated `syncRedmine()` function**:
- Stores fetched tasks in `availableTasks[idx]`
- Renders tasks as clickable checkboxes
- Shows "no tasks" message if Redmine returns empty
- Button text changes to "Redmineタスクを再読み込み" after first sync

#### Detail Panel
**Updated `openDetailPanel()` function**:
- Detects if day has saved tasks
- If saved tasks exist: displays them as confirmed selections (green badges)
- If no saved tasks: button shows "Redmineと同期" to invite user to sync
- Users click sync to fetch available tasks, then check the ones they'll work on

## User Workflow

### For New Telework Day:
1. User selects a day from the calendar
2. Clicks "Redmineと同期" button
3. System fetches open Redmine issues assigned to user
4. Tasks display as checkboxes with full details
5. User checks tasks they plan to work on that day
6. Clicks "保存" to save as draft
7. Selected tasks are saved to the reports table as JSON

### For Existing Report:
1. User selects a previously saved day
2. Saved tasks display with green checkmarks (read-only view)
3. No need to sync again - data comes from database
4. User can click "Redmineタスクを再読み込み" to fetch fresh data and reselect

### For Week Submission:
1. User clicks "申請" button at bottom
2. All saved draft days (with their selected Redmine tasks) are submitted
3. Status changes to "申請中"
4. Redmine task data is preserved in each day record

## Database Schema
The `redmine_tasks` column in the reports table stores JSON array:
```json
[
  {
    "id": 12345,
    "subject": "Fix login bug",
    "status": "In Progress",
    "project": "CRM System",
    "priority": "High",
    "dueDate": "2026-04-15"
  }
]
```

## Configuration
Redmine credentials are read from:
1. **Code.gs** constants (preferred):
   - `REDMINE_URL` - Base URL of Redmine instance
   - `API_KEY` - User's API key
2. **Script Properties** (fallback):
   - `REDMINE_URL`
   - `REDMINE_API_KEY`

Current configuration in Code.gs:
```javascript
var REDMINE_URL = 'https://pm.fs-revolution.info';
var API_KEY = '5a50bf5242d0d4f2d9bcfa174b59fbffb9944ab2';
```

## Benefits
1. ✅ Users see current open Redmine issues
2. ✅ Checkbox interface for easy selection
3. ✅ Saved selections persist and don't require re-sync
4. ✅ Rich task information (project, priority, due date)
5. ✅ Better filtering (excludes closed/resolved issues)
6. ✅ Efficient - only syncs when user clicks button
7. ✅ Works with existing approval workflow

## Testing Checklist
- [ ] Verify Redmine API credentials are set
- [ ] Test syncing tasks for a new day
- [ ] Test checking/unchecking tasks
- [ ] Test saving day with selected tasks
- [ ] Test reopening saved day shows selected tasks
- [ ] Test re-syncing updates available task list
- [ ] Test week submission preserves all task data
- [ ] Test with user who has no Redmine issues
- [ ] Test with Redmine API error/timeout
