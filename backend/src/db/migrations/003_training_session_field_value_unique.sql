-- Add unique constraint on (session_exercise_id, field_id) so ON CONFLICT upserts work
ALTER TABLE training_session_field_values
  ADD CONSTRAINT training_session_field_values_se_field_unique
  UNIQUE (session_exercise_id, field_id);
