ALTER TABLE `training` ADD `healthcore_patient_id` text;
CREATE UNIQUE INDEX `training_healthcore_patient_id_uidx` ON `training` (`healthcore_patient_id`);
