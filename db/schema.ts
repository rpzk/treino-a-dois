import { sqliteTable, text, integer, uniqueIndex } from "drizzle-orm/sqlite-core";

export const training = sqliteTable(
  "training",
  {
    profile: text("profile").primaryKey(),
    data: text("data").notNull(),
    revision: integer("revision").notNull().default(0),
    healthcorePatientId: text("healthcore_patient_id"),
  },
  (table) => ({
    healthcorePatientIdUnique: uniqueIndex("training_healthcore_patient_id_uidx").on(
      table.healthcorePatientId,
    ),
  }),
);
