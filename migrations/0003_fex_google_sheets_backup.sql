ALTER TABLE student_submissions ADD COLUMN backup_status TEXT NOT NULL DEFAULT 'pending'
  CHECK (backup_status IN ('pending','synced','failed'));
ALTER TABLE student_submissions ADD COLUMN backup_synced_at TEXT;
ALTER TABLE student_submissions ADD COLUMN backup_error TEXT;
