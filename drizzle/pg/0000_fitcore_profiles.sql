CREATE SCHEMA IF NOT EXISTS fitcore;

CREATE TABLE IF NOT EXISTS fitcore.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_schema text NOT NULL,
  patient_fhir_id text NOT NULL,
  display_name text,
  revision integer NOT NULL DEFAULT 0,
  state jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profiles_tenant_patient_uidx UNIQUE (tenant_schema, patient_fhir_id)
);
