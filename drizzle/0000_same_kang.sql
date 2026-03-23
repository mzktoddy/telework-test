CREATE TABLE `departments` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `departments_name_idx` ON `departments` (`name`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`department_id` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "users_role_check" CHECK("users"."role" IN ('employee', 'reviewer', 'manager', 'admin'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_idx` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `users_role_idx` ON `users` (`role`);--> statement-breakpoint
CREATE INDEX `users_department_idx` ON `users` (`department_id`);--> statement-breakpoint
CREATE TABLE `telework_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`report_type` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`tasks` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "reports_status_check" CHECK("telework_reports"."status" IN ('draft', 'submitted', 'reviewer_approved', 'approved', 'rejected'))
);
--> statement-breakpoint
CREATE INDEX `reports_employee_start_idx` ON `telework_reports` (`employee_id`,`start_date`);--> statement-breakpoint
CREATE INDEX `reports_status_updated_idx` ON `telework_reports` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `approvals` (
	`id` text PRIMARY KEY NOT NULL,
	`report_id` text NOT NULL,
	`approver_id` text NOT NULL,
	`level` integer NOT NULL,
	`decision` text DEFAULT 'pending' NOT NULL,
	`comment` text,
	`decided_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`report_id`) REFERENCES `telework_reports`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`approver_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "approvals_level_check" CHECK("approvals"."level" IN (1, 2)),
	CONSTRAINT "approvals_decision_check" CHECK("approvals"."decision" IN ('pending', 'approved', 'rejected'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `approvals_report_level_idx` ON `approvals` (`report_id`,`level`);--> statement-breakpoint
CREATE INDEX `approvals_report_level_decision_idx` ON `approvals` (`report_id`,`level`,`decision`);--> statement-breakpoint
CREATE INDEX `approvals_approver_decision_created_idx` ON `approvals` (`approver_id`,`decision`,`created_at`);