CREATE TABLE IF NOT EXISTS retail_student_progress (
  student_sub TEXT NOT NULL,
  course_id TEXT NOT NULL CHECK (course_id = 'retail-business-english'),
  progress_json TEXT NOT NULL CHECK (json_valid(progress_json)),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (student_sub, course_id)
) WITHOUT ROWID;
