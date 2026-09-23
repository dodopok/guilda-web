CREATE TABLE "church_logos" (
	"church_id" uuid PRIMARY KEY NOT NULL,
	"mime" text NOT NULL,
	"data_base64" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "churches" ADD COLUMN "accent_color" text DEFAULT '#2c5a41' NOT NULL;--> statement-breakpoint
ALTER TABLE "churches" ADD COLUMN "setup_completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "church_logos" ADD CONSTRAINT "church_logos_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "churches" ADD CONSTRAINT "churches_accent_color" CHECK ("churches"."accent_color" ~ '^#[0-9a-f]{6}$');--> statement-breakpoint
-- Igrejas que já têm funções cadastradas não passam pela configuração inicial.
UPDATE "churches" SET "setup_completed_at" = now() WHERE EXISTS (SELECT 1 FROM "duties" d WHERE d."church_id" = "churches"."id");
