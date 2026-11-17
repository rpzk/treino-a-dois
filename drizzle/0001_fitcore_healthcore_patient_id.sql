-- FitCore Part 1: nullable unique link to HealthCore patient_fhir_id.
-- Keep profile PKs lucas/natalia; set this column with scripts/link-profile-to-patient.mjs.
ALTER TABLE `training` ADD `healthcore_patient_id` text;
CREATE UNIQUE INDEX `training_healthcore_patient_id_uidx` ON `training` (`healthcore_patient_id`);
