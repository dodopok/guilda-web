CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"login" text NOT NULL,
	"password_hash" text,
	"display_name" text NOT NULL,
	"is_platform_admin" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"failed_login_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"password_changed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_login_unique" UNIQUE("login")
);
--> statement-breakpoint
CREATE TABLE "assignment_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"assignment_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"decision" text NOT NULL,
	"channel" text NOT NULL,
	"note" text,
	"recorded_by_account_id" uuid,
	"schedule_version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"slot_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"status_changed_at" timestamp with time zone,
	"exceptional" boolean DEFAULT false NOT NULL,
	"exception_reason" text,
	"exception_by_account_id" uuid,
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_by_account_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assignments_church_id_uq" UNIQUE("church_id","id"),
	CONSTRAINT "assignments_slot_person_uq" UNIQUE("slot_id","person_id")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid,
	"actor_account_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purpose" text NOT NULL,
	"token_hash" text NOT NULL,
	"church_id" uuid,
	"person_id" uuid,
	"account_id" uuid,
	"created_by_account_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "availability_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"month" text NOT NULL,
	"send_at" timestamp with time zone NOT NULL,
	"deadline_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"sent_at" timestamp with time zone,
	"created_by_account_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "availability_requests_uq" UNIQUE("church_id","month"),
	CONSTRAINT "availability_requests_church_id_uq" UNIQUE("church_id","id"),
	CONSTRAINT "availability_requests_deadline" CHECK ("availability_requests"."deadline_at" > "availability_requests"."send_at")
);
--> statement-breakpoint
CREATE TABLE "availability_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"source" text NOT NULL,
	"note" text,
	"recorded_by_account_id" uuid,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "availability_responses_uq" UNIQUE("request_id","person_id")
);
--> statement-breakpoint
CREATE TABLE "churches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"timezone" text DEFAULT 'America/Sao_Paulo' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"default_location" text,
	"reminder_enabled" boolean DEFAULT false NOT NULL,
	"reminder_weekday" integer DEFAULT 4 NOT NULL,
	"reminder_time" text DEFAULT '19:00' NOT NULL,
	"reminder_window_days" integer DEFAULT 7 NOT NULL,
	"reminder_config_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmation_deadline_hours" integer DEFAULT 48 NOT NULL,
	"liturgical_prayer_book" text DEFAULT 'loc_2027' NOT NULL,
	"liturgical_reading_type" text DEFAULT 'complementary' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "churches_slug_unique" UNIQUE("slug"),
	CONSTRAINT "churches_reminder_weekday" CHECK ("churches"."reminder_weekday" between 0 and 6),
	CONSTRAINT "churches_reminder_time" CHECK ("churches"."reminder_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
	CONSTRAINT "churches_slug" CHECK ("churches"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
--> statement-breakpoint
CREATE TABLE "consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"channel" text DEFAULT 'whatsapp' NOT NULL,
	"purpose" text DEFAULT 'service_messages' NOT NULL,
	"status" text NOT NULL,
	"granted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"source" text NOT NULL,
	"evidence_note" text,
	"recorded_by_account_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consents_person_channel_uq" UNIQUE("church_id","person_id","channel","purpose")
);
--> statement-breakpoint
CREATE TABLE "duties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"ministry_id" uuid NOT NULL,
	"name" text NOT NULL,
	"instructions" text,
	"arrival_minutes_before" integer,
	"kind" text DEFAULT 'general' NOT NULL,
	"receives_music_notice" boolean DEFAULT false NOT NULL,
	"default_required_count" integer DEFAULT 1 NOT NULL,
	"include_by_default" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "duties_church_id_uq" UNIQUE("church_id","id"),
	CONSTRAINT "duties_church_ministry_name_uq" UNIQUE("church_id","ministry_id","name"),
	CONSTRAINT "duties_required_count" CHECK ("duties"."default_required_count" between 1 and 50)
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"source_key" text NOT NULL,
	"month" text NOT NULL,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_account_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "import_batches_uq" UNIQUE("church_id","source_key")
);
--> statement-breakpoint
CREATE TABLE "liturgical_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"date" date NOT NULL,
	"prayer_book" text NOT NULL,
	"source" text NOT NULL,
	"request_path" text,
	"payload" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "liturgical_snapshots_church_id_uq" UNIQUE("church_id","id")
);
--> statement-breakpoint
CREATE TABLE "liturgy_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'regular' NOT NULL,
	"description" text,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "liturgy_templates_church_id_uq" UNIQUE("church_id","id")
);
--> statement-breakpoint
CREATE TABLE "message_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"message_id" uuid,
	"event_key" text NOT NULL,
	"type" text NOT NULL,
	"status" text,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_events_uq" UNIQUE("church_id","event_key")
);
--> statement-breakpoint
CREATE TABLE "ministries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ministries_church_id_uq" UNIQUE("church_id","id"),
	CONSTRAINT "ministries_church_name_uq" UNIQUE("church_id","name")
);
--> statement-breakpoint
CREATE TABLE "outbound_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"kind" text NOT NULL,
	"person_id" uuid,
	"to_phone" text,
	"params" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"secret_params_enc" text,
	"preview" text NOT NULL,
	"status" text NOT NULL,
	"blocked_reason" text,
	"provider" text,
	"provider_message_id" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	CONSTRAINT "outbound_messages_idem_uq" UNIQUE("church_id","idempotency_key"),
	CONSTRAINT "outbound_messages_church_id_uq" UNIQUE("church_id","id")
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"account_id" uuid,
	"display_name" text NOT NULL,
	"name_key" text NOT NULL,
	"phone_e164" text,
	"roles" text[] DEFAULT ARRAY['participant']::text[] NOT NULL,
	"rest_exempt" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "people_church_id_uq" UNIQUE("church_id","id")
);
--> statement-breakpoint
CREATE TABLE "person_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"alias_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "person_aliases_uq" UNIQUE("church_id","alias_key")
);
--> statement-breakpoint
CREATE TABLE "qualifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"duty_id" uuid NOT NULL,
	"valid_from" date,
	"valid_until" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "qualifications_uq" UNIQUE("church_id","person_id","duty_id")
);
--> statement-breakpoint
CREATE TABLE "reminder_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"kind" text NOT NULL,
	"items" jsonb NOT NULL,
	"items_hash" text NOT NULL,
	"message_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reminder_deliveries_seq_uq" UNIQUE("run_id","person_id","seq")
);
--> statement-breakpoint
CREATE TABLE "reminder_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"window_end" timestamp with time zone NOT NULL,
	"trigger" text DEFAULT 'schedule' NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "reminder_runs_uq" UNIQUE("church_id","scheduled_for"),
	CONSTRAINT "reminder_runs_church_id_uq" UNIQUE("church_id","id")
);
--> statement-breakpoint
CREATE TABLE "schedule_months" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"month" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"published_at" timestamp with time zone,
	"published_by_account_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schedule_months_uq" UNIQUE("church_id","month"),
	CONSTRAINT "schedule_months_church_id_uq" UNIQUE("church_id","id")
);
--> statement-breakpoint
CREATE TABLE "schedule_publications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"schedule_month_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"kind" text NOT NULL,
	"published_by_account_id" uuid,
	"notify_now" boolean DEFAULT false NOT NULL,
	"justification" text,
	"alerts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schedule_publications_uq" UNIQUE("schedule_month_id","version")
);
--> statement-breakpoint
CREATE TABLE "script_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"script_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"text_source" text DEFAULT 'church' NOT NULL,
	"duty_id" uuid,
	"person_id" uuid,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "script_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"script_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"content" jsonb NOT NULL,
	"published_by_account_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "script_versions_uq" UNIQUE("script_id","version")
);
--> statement-breakpoint
CREATE TABLE "service_scripts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"template_id" uuid,
	"status" text DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"title" text NOT NULL,
	"liturgical_snapshot_id" uuid,
	"liturgy" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"pastoral_note" text,
	"music_chooser" text DEFAULT 'preacher' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"published_by_account_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_scripts_service_uq" UNIQUE("church_id","service_id"),
	CONSTRAINT "service_scripts_church_id_uq" UNIQUE("church_id","id")
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"local_date" date NOT NULL,
	"month" text NOT NULL,
	"title" text NOT NULL,
	"location" text,
	"kind" text DEFAULT 'regular' NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "services_church_id_uq" UNIQUE("church_id","id"),
	CONSTRAINT "services_month" CHECK ("services"."month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
	CONSTRAINT "services_ends_after_start" CHECK ("services"."ends_at" > "services"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"account_id" uuid NOT NULL,
	"client" text DEFAULT 'web' NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"duty_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"required_count" integer DEFAULT 1 NOT NULL,
	"arrival_at" timestamp with time zone,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "slots_church_id_uq" UNIQUE("church_id","id"),
	CONSTRAINT "slots_required_count" CHECK ("slots"."required_count" between 1 and 50)
);
--> statement-breakpoint
CREATE TABLE "songs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"title" text NOT NULL,
	"author" text,
	"musical_key" text,
	"link" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "songs_church_id_uq" UNIQUE("church_id","id")
);
--> statement-breakpoint
CREATE TABLE "swap_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"assignment_id" uuid NOT NULL,
	"from_person_id" uuid NOT NULL,
	"candidate_person_id" uuid NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	CONSTRAINT "swap_requests_church_id_uq" UNIQUE("church_id","id")
);
--> statement-breakpoint
CREATE TABLE "template_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"text_source" text DEFAULT 'church' NOT NULL,
	"duty_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unavailabilities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"source" text NOT NULL,
	"recorded_by_account_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unavailabilities_uq" UNIQUE("person_id","service_id")
);
--> statement-breakpoint
CREATE TABLE "whatsapp_channels" (
	"church_id" uuid PRIMARY KEY NOT NULL,
	"mode" text DEFAULT 'disabled' NOT NULL,
	"phone_number_id" text,
	"business_account_id" text,
	"display_phone_last4" text,
	"access_token_enc" text,
	"app_secret_enc" text,
	"webhook_verify_token_hash" text,
	"coexistence_status" text DEFAULT 'not_verified' NOT NULL,
	"coexistence_note" text,
	"coexistence_verified_at" timestamp with time zone,
	"coexistence_verified_by_account_id" uuid,
	"test_mode" boolean DEFAULT true NOT NULL,
	"test_recipients" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"templates" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assignment_responses" ADD CONSTRAINT "assignment_responses_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_responses" ADD CONSTRAINT "assignment_responses_recorded_by_account_id_accounts_id_fk" FOREIGN KEY ("recorded_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_responses" ADD CONSTRAINT "assignment_responses_church_id_assignment_id_assignments_church_id_id_fk" FOREIGN KEY ("church_id","assignment_id") REFERENCES "public"."assignments"("church_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_responses" ADD CONSTRAINT "assignment_responses_church_id_person_id_people_church_id_id_fk" FOREIGN KEY ("church_id","person_id") REFERENCES "public"."people"("church_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_exception_by_account_id_accounts_id_fk" FOREIGN KEY ("exception_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_created_by_account_id_accounts_id_fk" FOREIGN KEY ("created_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_church_id_slot_id_slots_church_id_id_fk" FOREIGN KEY ("church_id","slot_id") REFERENCES "public"."slots"("church_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_church_id_person_id_people_church_id_id_fk" FOREIGN KEY ("church_id","person_id") REFERENCES "public"."people"("church_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_account_id_accounts_id_fk" FOREIGN KEY ("actor_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_created_by_account_id_accounts_id_fk" FOREIGN KEY ("created_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_church_id_person_id_people_church_id_id_fk" FOREIGN KEY ("church_id","person_id") REFERENCES "public"."people"("church_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_requests" ADD CONSTRAINT "availability_requests_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_requests" ADD CONSTRAINT "availability_requests_created_by_account_id_accounts_id_fk" FOREIGN KEY ("created_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_responses" ADD CONSTRAINT "availability_responses_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_responses" ADD CONSTRAINT "availability_responses_recorded_by_account_id_accounts_id_fk" FOREIGN KEY ("recorded_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_responses" ADD CONSTRAINT "availability_responses_church_id_request_id_availability_requests_church_id_id_fk" FOREIGN KEY ("church_id","request_id") REFERENCES "public"."availability_requests"("church_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_responses" ADD CONSTRAINT "availability_responses_church_id_person_id_people_church_id_id_fk" FOREIGN KEY ("church_id","person_id") REFERENCES "public"."people"("church_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_recorded_by_account_id_accounts_id_fk" FOREIGN KEY ("recorded_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_church_id_person_id_people_church_id_id_fk" FOREIGN KEY ("church_id","person_id") REFERENCES "public"."people"("church_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duties" ADD CONSTRAINT "duties_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duties" ADD CONSTRAINT "duties_church_id_ministry_id_ministries_church_id_id_fk" FOREIGN KEY ("church_id","ministry_id") REFERENCES "public"."ministries"("church_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_created_by_account_id_accounts_id_fk" FOREIGN KEY ("created_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liturgical_snapshots" ADD CONSTRAINT "liturgical_snapshots_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liturgy_templates" ADD CONSTRAINT "liturgy_templates_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_events" ADD CONSTRAINT "message_events_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ministries" ADD CONSTRAINT "ministries_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_messages" ADD CONSTRAINT "outbound_messages_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_messages" ADD CONSTRAINT "outbound_messages_church_id_person_id_people_church_id_id_fk" FOREIGN KEY ("church_id","person_id") REFERENCES "public"."people"("church_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_aliases" ADD CONSTRAINT "person_aliases_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_aliases" ADD CONSTRAINT "person_aliases_church_id_person_id_people_church_id_id_fk" FOREIGN KEY ("church_id","person_id") REFERENCES "public"."people"("church_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualifications" ADD CONSTRAINT "qualifications_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualifications" ADD CONSTRAINT "qualifications_church_id_person_id_people_church_id_id_fk" FOREIGN KEY ("church_id","person_id") REFERENCES "public"."people"("church_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualifications" ADD CONSTRAINT "qualifications_church_id_duty_id_duties_church_id_id_fk" FOREIGN KEY ("church_id","duty_id") REFERENCES "public"."duties"("church_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_deliveries" ADD CONSTRAINT "reminder_deliveries_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_deliveries" ADD CONSTRAINT "reminder_deliveries_church_id_run_id_reminder_runs_church_id_id_fk" FOREIGN KEY ("church_id","run_id") REFERENCES "public"."reminder_runs"("church_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_deliveries" ADD CONSTRAINT "reminder_deliveries_church_id_person_id_people_church_id_id_fk" FOREIGN KEY ("church_id","person_id") REFERENCES "public"."people"("church_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_runs" ADD CONSTRAINT "reminder_runs_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_months" ADD CONSTRAINT "schedule_months_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_months" ADD CONSTRAINT "schedule_months_published_by_account_id_accounts_id_fk" FOREIGN KEY ("published_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_publications" ADD CONSTRAINT "schedule_publications_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_publications" ADD CONSTRAINT "schedule_publications_published_by_account_id_accounts_id_fk" FOREIGN KEY ("published_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_publications" ADD CONSTRAINT "schedule_publications_church_id_schedule_month_id_schedule_months_church_id_id_fk" FOREIGN KEY ("church_id","schedule_month_id") REFERENCES "public"."schedule_months"("church_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "script_blocks" ADD CONSTRAINT "script_blocks_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "script_blocks" ADD CONSTRAINT "script_blocks_church_id_script_id_service_scripts_church_id_id_fk" FOREIGN KEY ("church_id","script_id") REFERENCES "public"."service_scripts"("church_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "script_blocks" ADD CONSTRAINT "script_blocks_church_id_duty_id_duties_church_id_id_fk" FOREIGN KEY ("church_id","duty_id") REFERENCES "public"."duties"("church_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "script_blocks" ADD CONSTRAINT "script_blocks_church_id_person_id_people_church_id_id_fk" FOREIGN KEY ("church_id","person_id") REFERENCES "public"."people"("church_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "script_versions" ADD CONSTRAINT "script_versions_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "script_versions" ADD CONSTRAINT "script_versions_published_by_account_id_accounts_id_fk" FOREIGN KEY ("published_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "script_versions" ADD CONSTRAINT "script_versions_church_id_script_id_service_scripts_church_id_id_fk" FOREIGN KEY ("church_id","script_id") REFERENCES "public"."service_scripts"("church_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_scripts" ADD CONSTRAINT "service_scripts_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_scripts" ADD CONSTRAINT "service_scripts_published_by_account_id_accounts_id_fk" FOREIGN KEY ("published_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_scripts" ADD CONSTRAINT "service_scripts_church_id_service_id_services_church_id_id_fk" FOREIGN KEY ("church_id","service_id") REFERENCES "public"."services"("church_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_scripts" ADD CONSTRAINT "service_scripts_church_id_template_id_liturgy_templates_church_id_id_fk" FOREIGN KEY ("church_id","template_id") REFERENCES "public"."liturgy_templates"("church_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_scripts" ADD CONSTRAINT "service_scripts_church_id_liturgical_snapshot_id_liturgical_snapshots_church_id_id_fk" FOREIGN KEY ("church_id","liturgical_snapshot_id") REFERENCES "public"."liturgical_snapshots"("church_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slots" ADD CONSTRAINT "slots_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slots" ADD CONSTRAINT "slots_church_id_service_id_services_church_id_id_fk" FOREIGN KEY ("church_id","service_id") REFERENCES "public"."services"("church_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slots" ADD CONSTRAINT "slots_church_id_duty_id_duties_church_id_id_fk" FOREIGN KEY ("church_id","duty_id") REFERENCES "public"."duties"("church_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "songs" ADD CONSTRAINT "songs_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swap_requests" ADD CONSTRAINT "swap_requests_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swap_requests" ADD CONSTRAINT "swap_requests_church_id_assignment_id_assignments_church_id_id_fk" FOREIGN KEY ("church_id","assignment_id") REFERENCES "public"."assignments"("church_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swap_requests" ADD CONSTRAINT "swap_requests_church_id_from_person_id_people_church_id_id_fk" FOREIGN KEY ("church_id","from_person_id") REFERENCES "public"."people"("church_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swap_requests" ADD CONSTRAINT "swap_requests_church_id_candidate_person_id_people_church_id_id_fk" FOREIGN KEY ("church_id","candidate_person_id") REFERENCES "public"."people"("church_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_blocks" ADD CONSTRAINT "template_blocks_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_blocks" ADD CONSTRAINT "template_blocks_church_id_template_id_liturgy_templates_church_id_id_fk" FOREIGN KEY ("church_id","template_id") REFERENCES "public"."liturgy_templates"("church_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_blocks" ADD CONSTRAINT "template_blocks_church_id_duty_id_duties_church_id_id_fk" FOREIGN KEY ("church_id","duty_id") REFERENCES "public"."duties"("church_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unavailabilities" ADD CONSTRAINT "unavailabilities_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unavailabilities" ADD CONSTRAINT "unavailabilities_recorded_by_account_id_accounts_id_fk" FOREIGN KEY ("recorded_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unavailabilities" ADD CONSTRAINT "unavailabilities_church_id_person_id_people_church_id_id_fk" FOREIGN KEY ("church_id","person_id") REFERENCES "public"."people"("church_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unavailabilities" ADD CONSTRAINT "unavailabilities_church_id_service_id_services_church_id_id_fk" FOREIGN KEY ("church_id","service_id") REFERENCES "public"."services"("church_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_channels" ADD CONSTRAINT "whatsapp_channels_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_channels" ADD CONSTRAINT "whatsapp_channels_coexistence_verified_by_account_id_accounts_id_fk" FOREIGN KEY ("coexistence_verified_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assignment_responses_assignment_idx" ON "assignment_responses" USING btree ("assignment_id");--> statement-breakpoint
CREATE INDEX "assignments_person_idx" ON "assignments" USING btree ("church_id","person_id");--> statement-breakpoint
CREATE INDEX "audit_log_church_idx" ON "audit_log" USING btree ("church_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "auth_tokens_person_idx" ON "auth_tokens" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "liturgical_snapshots_date_idx" ON "liturgical_snapshots" USING btree ("church_id","date");--> statement-breakpoint
CREATE INDEX "message_events_message_idx" ON "message_events" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "outbound_messages_queue_idx" ON "outbound_messages" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE UNIQUE INDEX "outbound_messages_provider_id_uq" ON "outbound_messages" USING btree ("provider_message_id") WHERE "outbound_messages"."provider_message_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "people_church_account_uq" ON "people" USING btree ("church_id","account_id") WHERE "people"."account_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "people_church_phone_uq" ON "people" USING btree ("church_id","phone_e164") WHERE "people"."phone_e164" is not null;--> statement-breakpoint
CREATE INDEX "people_church_idx" ON "people" USING btree ("church_id");--> statement-breakpoint
CREATE INDEX "script_blocks_script_idx" ON "script_blocks" USING btree ("script_id");--> statement-breakpoint
CREATE INDEX "services_church_month_idx" ON "services" USING btree ("church_id","month");--> statement-breakpoint
CREATE INDEX "services_church_starts_idx" ON "services" USING btree ("church_id","starts_at");--> statement-breakpoint
CREATE INDEX "sessions_account_idx" ON "sessions" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "slots_service_idx" ON "slots" USING btree ("service_id");--> statement-breakpoint
CREATE UNIQUE INDEX "swap_requests_open_uq" ON "swap_requests" USING btree ("assignment_id","candidate_person_id") WHERE "swap_requests"."status" = 'proposed';--> statement-breakpoint
CREATE INDEX "template_blocks_template_idx" ON "template_blocks" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "unavailabilities_service_idx" ON "unavailabilities" USING btree ("service_id");