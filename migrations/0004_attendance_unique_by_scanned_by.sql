DROP INDEX IF EXISTS idx_attendance_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_unique
ON attendance_records(student_id, session, date(timestamp), COALESCE(scanned_by, ''));
