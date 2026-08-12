DROP INDEX "categories_lower_name_idx";--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "household_id" uuid;--> statement-breakpoint
-- Backfill: clone the former global categories into every existing household,
-- move expenses to their household's clone, then remove the global rows.
INSERT INTO "categories" ("household_id", "name", "aliases", "emoji", "position", "is_archived", "created_at")
SELECT h."id", c."name", c."aliases", c."emoji", c."position", c."is_archived", c."created_at"
FROM "categories" c CROSS JOIN "households" h
WHERE c."household_id" IS NULL;--> statement-breakpoint
UPDATE "expenses" e
SET "category_id" = repl."id"
FROM "categories" old, "categories" repl
WHERE e."category_id" = old."id"
  AND old."household_id" IS NULL
  AND repl."household_id" = e."household_id"
  AND lower(repl."name") = lower(old."name");--> statement-breakpoint
DELETE FROM "categories" WHERE "household_id" IS NULL;--> statement-breakpoint
ALTER TABLE "categories" ALTER COLUMN "household_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "categories_household_lower_name_idx" ON "categories" USING btree ("household_id",lower("name"));
