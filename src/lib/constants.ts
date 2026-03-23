export const USER_ROLES = {
  ADMIN: "admin",
  MANAGER: "manager",
  REVIEWER: "reviewer",
  EMPLOYEE: "employee",
} as const;

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "管理者",
  manager: "マネージャー",
  reviewer: "審査者",
  employee: "従業員",
};

export const REPORT_STATUSES = {
  DRAFT: "draft",
  SUBMITTED: "submitted",
  REVIEWER_APPROVED: "reviewer_approved",
  APPROVED: "approved",
  REJECTED: "rejected",
} as const;

export type ReportStatus = (typeof REPORT_STATUSES)[keyof typeof REPORT_STATUSES];

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  draft: "下書き",
  submitted: "提出済み",
  reviewer_approved: "審査承認",
  approved: "最終承認",
  rejected: "却下",
};

export const APPROVAL_DECISIONS = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
} as const;

export type ApprovalDecision = (typeof APPROVAL_DECISIONS)[keyof typeof APPROVAL_DECISIONS];

export const APPROVAL_LEVELS = {
  REVIEWER: 1,
  MANAGER: 2,
} as const;
