DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.expenses e
    JOIN public.members m ON m.id = e.payer_id
    WHERE m.household_id <> e.household_id
  ) OR EXISTS (
    SELECT 1 FROM public.expenses e
    JOIN public.categories c ON c.id = e.category_id
    WHERE c.household_id <> e.household_id
  ) OR EXISTS (
    SELECT 1 FROM public.expense_shares s
    JOIN public.expenses e ON e.id = s.expense_id
    JOIN public.members m ON m.id = s.member_id
    WHERE m.household_id <> e.household_id
  ) OR EXISTS (
    SELECT 1 FROM public.expenses e
    LEFT JOIN public.expense_shares s ON s.expense_id = e.id
    GROUP BY e.id, e.amount_minor
    HAVING coalesce(sum(s.share_minor), 0) <> e.amount_minor
  ) THEN
    RAISE EXCEPTION 'Tenant or expense-share integrity check failed';
  END IF;
END $$;--> statement-breakpoint

ALTER TABLE "expense_shares" DROP CONSTRAINT "expense_shares_expense_id_expenses_id_fk";--> statement-breakpoint
ALTER TABLE "expense_shares" DROP CONSTRAINT "expense_shares_member_id_members_id_fk";--> statement-breakpoint
ALTER TABLE "expenses" DROP CONSTRAINT "expenses_category_id_categories_id_fk";--> statement-breakpoint
ALTER TABLE "expenses" DROP CONSTRAINT "expenses_payer_id_members_id_fk";--> statement-breakpoint

ALTER TABLE "expense_shares" ADD COLUMN "household_id" uuid;--> statement-breakpoint
UPDATE "expense_shares" s
SET "household_id" = e."household_id"
FROM "expenses" e
WHERE e."id" = s."expense_id";--> statement-breakpoint
ALTER TABLE "expense_shares" ALTER COLUMN "household_id" SET NOT NULL;--> statement-breakpoint

ALTER TABLE "expenses" ADD COLUMN "source_key" text;--> statement-breakpoint
UPDATE "expenses" e
SET "source_key" = 'message:' || h."tg_chat_id" || ':' || e."tg_message_id"
FROM "households" h
WHERE h."id" = e."household_id" AND e."tg_message_id" IS NOT NULL;--> statement-breakpoint

CREATE UNIQUE INDEX "categories_id_household_idx" ON "categories" USING btree ("id","household_id");--> statement-breakpoint
CREATE UNIQUE INDEX "expenses_id_household_idx" ON "expenses" USING btree ("id","household_id");--> statement-breakpoint
CREATE UNIQUE INDEX "members_id_household_idx" ON "members" USING btree ("id","household_id");--> statement-breakpoint
CREATE UNIQUE INDEX "expenses_household_source_idx" ON "expenses" USING btree ("household_id","source_key") WHERE "expenses"."source_key" is not null;--> statement-breakpoint

ALTER TABLE "expense_shares" ADD CONSTRAINT "expense_shares_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_shares" ADD CONSTRAINT "expense_shares_expense_household_fk" FOREIGN KEY ("expense_id","household_id") REFERENCES "public"."expenses"("id","household_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_shares" ADD CONSTRAINT "expense_shares_member_household_fk" FOREIGN KEY ("member_id","household_id") REFERENCES "public"."members"("id","household_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_payer_household_fk" FOREIGN KEY ("payer_id","household_id") REFERENCES "public"."members"("id","household_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_household_fk" FOREIGN KEY ("category_id","household_id") REFERENCES "public"."categories"("id","household_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.expense_shares ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.households ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
    AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
    REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
    REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
  END IF;
END $$;
