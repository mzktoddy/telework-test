import { sql } from "drizzle-orm";
import { check, index, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { users } from "./users";

export const reportTypes = ["daily", "weekly"] as const;
export const reportStatuses = [
  "draft",
  "submitted",
  "reviewer_approved",
  "approved",
  "rejected",
] as const;

export type ReportType = (typeof reportTypes)[number];
export type ReportStatus = (typeof reportStatuses)[number];

export const teleworkReports = sqliteTable(
  "telework_reports",
  {
    id: text("id").primaryKey(),
    employeeId: text("employee_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reportType: text("report_type").$type<ReportType>().notNull(),
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    tasks: text("tasks").notNull(),
    status: text("status").$type<ReportStatus>().notNull().default("draft"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    reportsEmployeeStartIdx: index("reports_employee_start_idx").on(
      table.employeeId,
      table.startDate
    ),
    reportsStatusUpdatedIdx: index("reports_status_updated_idx").on(
      table.status,
      table.updatedAt
    ),
    reportsStatusCheck: check(
      "reports_status_check",
      sql`${table.status} IN ('draft', 'submitted', 'reviewer_approved', 'approved', 'rejected')`
    ),
  })
);
