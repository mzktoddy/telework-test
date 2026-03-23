import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { teleworkReports } from "./reports";
import { users } from "./users";

export const approvalDecisions = ["pending", "approved", "rejected"] as const;
export type ApprovalDecision = (typeof approvalDecisions)[number];

export const approvals = sqliteTable(
  "approvals",
  {
    id: text("id").primaryKey(),
    reportId: text("report_id")
      .notNull()
      .references(() => teleworkReports.id, { onDelete: "cascade" }),
    approverId: text("approver_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    level: integer("level").notNull(),
    decision: text("decision").$type<ApprovalDecision>().notNull().default("pending"),
    comment: text("comment"),
    decidedAt: text("decided_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    approvalsReportLevelIdx: uniqueIndex("approvals_report_level_idx").on(
      table.reportId,
      table.level
    ),
    approvalsReportLevelDecisionIdx: index("approvals_report_level_decision_idx").on(
      table.reportId,
      table.level,
      table.decision
    ),
    approvalsApproverDecisionCreatedIdx: index("approvals_approver_decision_created_idx").on(
      table.approverId,
      table.decision,
      table.createdAt
    ),
    approvalsLevelCheck: check("approvals_level_check", sql`${table.level} IN (1, 2)`),
    approvalsDecisionCheck: check(
      "approvals_decision_check",
      sql`${table.decision} IN ('pending', 'approved', 'rejected')`
    ),
  })
);
