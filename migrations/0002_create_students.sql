CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  ten_thanh TEXT,
  ho_ten TEXT NOT NULL,
  lop TEXT,
  full_name TEXT NOT NULL,
  normalized_ho_ten TEXT NOT NULL,
  normalized_full_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_students_normalized_ho_ten
ON students(normalized_ho_ten);

CREATE INDEX IF NOT EXISTS idx_students_normalized_full_name
ON students(normalized_full_name);

CREATE INDEX IF NOT EXISTS idx_students_lop
ON students(lop);
