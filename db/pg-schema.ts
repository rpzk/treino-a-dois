import { sql } from "drizzle-orm";
import {
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import type { State } from "../lib/training.ts";

/** Postgres schema that owns every FitCore table (shared cluster with HealthCore). */
export const fitcore = pgSchema("fitcore");

/**
 * Stage-1 storage: one row per (tenant, patient) holding the whole training
 * `State` as jsonb. `revision` is the optimistic-lock counter.
 * Mirrored by the checked-in SQL in `drizzle/pg/0000_fitcore_profiles.sql`.
 */
export const profiles = fitcore.table(
  "profiles",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantSchema: text("tenant_schema").notNull(),
    patientFhirId: text("patient_fhir_id").notNull(),
    displayName: text("display_name"),
    revision: integer("revision").notNull().default(0),
    state: jsonb("state").$type<State>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("profiles_tenant_patient_uidx").on(
      table.tenantSchema,
      table.patientFhirId,
    ),
  ],
);

export type ProfileRow = typeof profiles.$inferSelect;
