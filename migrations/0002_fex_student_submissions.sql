CREATE TABLE IF NOT EXISTS student_submissions (
  submission_id TEXT PRIMARY KEY,
  learner_id TEXT NOT NULL REFERENCES learners(learner_id) ON DELETE CASCADE,
  course_id TEXT NOT NULL,
  submission_type TEXT NOT NULL CHECK (submission_type IN ('writing','ielts','assessment')),
  title TEXT NOT NULL,
  prompt TEXT NOT NULL DEFAULT '',
  response_text TEXT NOT NULL,
  score TEXT,
  result_label TEXT,
  word_count INTEGER NOT NULL DEFAULT 0,
  time_spent TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  submitted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_student_submissions_learner
  ON student_submissions(learner_id, course_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_student_submissions_type
  ON student_submissions(course_id, submission_type, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_student_submissions_recent
  ON student_submissions(submitted_at DESC);
