import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { departments } from "./departments";

export const userRoles = ["employee", "reviewer", "manager", "admin"] as const;
export type UserRole = (typeof userRoles)[number];

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    name: text("name").notNull(),
    role: text("role").$type<UserRole>().notNull(),
    departmentId: text("department_id").references(() => departments.id, {
      onDelete: "set null",
    }),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    usersEmailIdx: uniqueIndex("users_email_idx").on(table.email),
    usersRoleIdx: index("users_role_idx").on(table.role),
    usersDepartmentIdx: index("users_department_idx").on(table.departmentId),
    usersRoleCheck: check(
      "users_role_check",
      sql`${table.role} IN ('employee', 'reviewer', 'manager', 'admin')`
    ),
  })
);
