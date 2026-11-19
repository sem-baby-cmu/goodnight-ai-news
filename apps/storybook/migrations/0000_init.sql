CREATE TABLE `asset` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `asset_key_uq` ON `asset` (`key`);--> statement-breakpoint
CREATE TABLE `asset_version` (
	`id` text PRIMARY KEY NOT NULL,
	`asset_id` text NOT NULL,
	`version` integer NOT NULL,
	`renderer` text NOT NULL,
	`manifest` text NOT NULL,
	`r2_prefix` text NOT NULL,
	`active` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `asset`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `asset_version_uq` ON `asset_version` (`asset_id`,`version`);--> statement-breakpoint
CREATE UNIQUE INDEX `asset_version_active_uq` ON `asset_version` (`asset_id`) WHERE active = 1;--> statement-breakpoint
CREATE TABLE `call_log` (
	`call_id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`step` text NOT NULL,
	`page_id` text DEFAULT '' NOT NULL,
	`purpose` text NOT NULL,
	`result` text,
	`r2_key` text,
	`basis` text NOT NULL,
	`model` text NOT NULL,
	`usage` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `run`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `call_log_run_idx` ON `call_log` (`run_id`,`step`);--> statement-breakpoint
CREATE TABLE `release` (
	`id` text PRIMARY KEY NOT NULL,
	`story_id` text NOT NULL,
	`number` integer NOT NULL,
	`manifest_key` text NOT NULL,
	`snapshot` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`story_id`) REFERENCES `story`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `release_story_number_uq` ON `release` (`story_id`,`number`);--> statement-breakpoint
CREATE TABLE `revision` (
	`id` text PRIMARY KEY NOT NULL,
	`story_id` text NOT NULL,
	`kind` text NOT NULL,
	`page_id` text DEFAULT '' NOT NULL,
	`content` text,
	`r2_key` text,
	`basis` text NOT NULL,
	`asset_versions` text,
	`origin` text NOT NULL,
	`call_id` text,
	`status` text NOT NULL,
	`error` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`story_id`) REFERENCES `story`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`call_id`) REFERENCES `call_log`(`call_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `revision_call_uq` ON `revision` (`call_id`,`kind`,`page_id`);--> statement-breakpoint
CREATE INDEX `revision_story_idx` ON `revision` (`story_id`,`kind`,`page_id`);--> statement-breakpoint
CREATE TABLE `run` (
	`id` text PRIMARY KEY NOT NULL,
	`story_id` text NOT NULL,
	`scope` text NOT NULL,
	`status` text NOT NULL,
	`basis` text,
	`registry` text,
	`workflow_instance_id` text,
	`error` text,
	`created_at` text NOT NULL,
	`finished_at` text,
	FOREIGN KEY (`story_id`) REFERENCES `story`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `run_story_idx` ON `run` (`story_id`);--> statement-breakpoint
CREATE TABLE `story` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text,
	`status` text NOT NULL,
	`heads` text NOT NULL,
	`heads_version` integer DEFAULT 0 NOT NULL,
	`published_release_id` text,
	`created_at` text NOT NULL
);
