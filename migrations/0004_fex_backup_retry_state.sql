ALTER TABLE student_submissions ADD COLUMN backup_attempt_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE student_submissions ADD COLUMN backup_next_attempt_at TEXT;
ALTER TABLE student_submissions ADD COLUMN backup_claim_token TEXT;
ALTER TABLE student_submissions ADD COLUMN backup_claim_until TEXT;
CREATE INDEX IF NOT EXISTS idx_submission_backup_retry ON student_submissions(backup_status,backup_next_attempt_at,backup_claim_until);
