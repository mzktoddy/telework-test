-- Seed data for departments
INSERT INTO departments (id, name, created_at) VALUES
  ('dept-eng-001', '技術部', datetime('now')),
  ('dept-sales-001', '営業部', datetime('now'));

--> statement-breakpoint

-- Seed data for users
-- Password: password123
-- Hashed with bcryptjs at cost 10
INSERT INTO users (
  id,
  email,
  password_hash,
  name,
  role,
  department_id,
  is_active,
  created_at,
  updated_at
) VALUES
  (
    'user-admin-001',
    'admin@telework.local',
    '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcg7b3XeKeUxWQ2SLsEQNN3/npu',
    'システム管理者',
    'admin',
    'dept-eng-001',
    1,
    datetime('now'),
    datetime('now')
  ),
  (
    'user-manager-001',
    'manager@telework.local',
    '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcg7b3XeKeUxWQ2SLsEQNN3/npu',
    '管理 太郎',
    'manager',
    'dept-eng-001',
    1,
    datetime('now'),
    datetime('now')
  ),
  (
    'user-emp-001',
    'employee1@telework.local',
    '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcg7b3XeKeUxWQ2SLsEQNN3/npu',
    '従業員 一郎',
    'employee',
    'dept-eng-001',
    1,
    datetime('now'),
    datetime('now')
  ),
  (
    'user-emp-002',
    'employee2@telework.local',
    '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcg7b3XeKeUxWQ2SLsEQNN3/npu',
    '従業員 次郎',
    'employee',
    'dept-sales-001',
    1,
    datetime('now'),
    datetime('now')
  );
