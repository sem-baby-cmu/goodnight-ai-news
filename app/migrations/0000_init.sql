CREATE TABLE `artifact` (
	`id` text PRIMARY KEY NOT NULL,
	`story_id` text NOT NULL,
	`stage` text NOT NULL,
	`version` integer NOT NULL,
	`generation_id` text NOT NULL,
	`input_ids` text,
	`input_hash` text,
	`payload` text,
	`r2_prefix` text,
	`author` text NOT NULL,
	`model` text,
	`prompt_version` text,
	`cost_usd` real,
	`checks` text,
	`status` text NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`story_id`) REFERENCES `story`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `artifact_story_stage_version` ON `artifact` (`story_id`,`stage`,`version`);--> statement-breakpoint
CREATE UNIQUE INDEX `artifact_generation_id` ON `artifact` (`generation_id`);--> statement-breakpoint
CREATE TABLE `news_item` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`source_url` text NOT NULL,
	`source_title` text NOT NULL,
	`full_text` text,
	`claims` text,
	`confidence` real,
	`first_rating` text,
	`status` text DEFAULT 'new' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `review` (
	`id` text PRIMARY KEY NOT NULL,
	`artifact_id` text NOT NULL,
	`reviewer` text NOT NULL,
	`action` text NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`artifact_id`) REFERENCES `artifact`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `story` (
	`id` text PRIMARY KEY NOT NULL,
	`news_item_id` text NOT NULL,
	`publish_date` text,
	`status` text DEFAULT 'drafting' NOT NULL,
	`published_package_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`news_item_id`) REFERENCES `news_item`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `story_package` (
	`id` text PRIMARY KEY NOT NULL,
	`story_id` text NOT NULL,
	`version` integer NOT NULL,
	`manifest` text NOT NULL,
	`input_ids` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`approved_by` text,
	`approved_at` text,
	FOREIGN KEY (`story_id`) REFERENCES `story`(`id`) ON UPDATE no action ON DELETE no action
);
