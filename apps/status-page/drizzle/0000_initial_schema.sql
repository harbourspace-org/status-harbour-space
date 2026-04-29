CREATE TYPE "public"."component_status" AS ENUM('operational', 'performance_issues', 'partial_outage', 'major_outage', 'under_maintenance');--> statement-breakpoint
CREATE TYPE "public"."incident_status" AS ENUM('investigating', 'identified', 'monitoring', 'resolved');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agents" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"region" varchar(32) NOT NULL,
	"registered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "component_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "components" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer,
	"name" text NOT NULL,
	"slug" varchar(64) NOT NULL,
	"description" text,
	"probe_url" text NOT NULL,
	"expected_status" integer DEFAULT 200 NOT NULL,
	"severity_when_down" "component_status" DEFAULT 'major_outage' NOT NULL,
	"is_external" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "components_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "incident_components" (
	"incident_id" integer NOT NULL,
	"component_id" integer NOT NULL,
	CONSTRAINT "incident_components_incident_id_component_id_pk" PRIMARY KEY("incident_id","component_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "incident_updates" (
	"id" serial PRIMARY KEY NOT NULL,
	"incident_id" integer NOT NULL,
	"status" "incident_status" NOT NULL,
	"message" text NOT NULL,
	"posted_by" text,
	"posted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "incidents" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"current_status" "incident_status" DEFAULT 'investigating' NOT NULL,
	"severity" "component_status" NOT NULL,
	"is_auto_created" boolean DEFAULT false NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "probes" (
	"id" serial PRIMARY KEY NOT NULL,
	"component_id" integer NOT NULL,
	"agent_id" varchar(64) NOT NULL,
	"ok" boolean NOT NULL,
	"status_code" integer,
	"latency_ms" integer,
	"error" text,
	"observed_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "schedule_components" (
	"schedule_id" integer NOT NULL,
	"component_id" integer NOT NULL,
	CONSTRAINT "schedule_components_schedule_id_component_id_pk" PRIMARY KEY("schedule_id","component_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "schedules" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"scheduled_start" timestamp with time zone NOT NULL,
	"scheduled_end" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subscribers" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"component_id" integer,
	"confirmed_at" timestamp with time zone,
	"unsubscribe_token" uuid DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "components" ADD CONSTRAINT "components_group_id_component_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."component_groups"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "incident_components" ADD CONSTRAINT "incident_components_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "incident_components" ADD CONSTRAINT "incident_components_component_id_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."components"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "incident_updates" ADD CONSTRAINT "incident_updates_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "probes" ADD CONSTRAINT "probes_component_id_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."components"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "probes" ADD CONSTRAINT "probes_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "schedule_components" ADD CONSTRAINT "schedule_components_schedule_id_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedules"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "schedule_components" ADD CONSTRAINT "schedule_components_component_id_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."components"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subscribers" ADD CONSTRAINT "subscribers_component_id_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."components"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "incident_updates_incident_posted_at_idx" ON "incident_updates" USING btree ("incident_id","posted_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "probes_component_observed_at_idx" ON "probes" USING btree ("component_id","observed_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "probes_agent_observed_at_idx" ON "probes" USING btree ("agent_id","observed_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscribers_email_idx" ON "subscribers" USING btree ("email");