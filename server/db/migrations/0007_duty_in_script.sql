ALTER TABLE "duties" ADD COLUMN "in_script" boolean DEFAULT true NOT NULL;--> statement-breakpoint
-- Aparece no roteiro: leitura, sermão, presidência e louvor, e as demais funções do mesmo
-- ministério que leitura, sermão ou presidência (ex.: Liturgia). Apoio fica só na escala.
UPDATE "duties" d SET "in_script" = (
  d."kind" <> 'general'
  OR EXISTS (SELECT 1 FROM "duties" x WHERE x."church_id" = d."church_id" AND x."ministry_id" = d."ministry_id" AND x."kind" IN ('reading', 'sermon', 'presiding'))
);
