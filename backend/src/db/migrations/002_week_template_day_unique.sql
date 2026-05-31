-- Add unique constraint on (template_id, weekday) so ON CONFLICT works for upserts
ALTER TABLE week_template_days
  ADD CONSTRAINT week_template_days_template_weekday_unique
  UNIQUE (template_id, weekday);
