-- Add student names to login attempts for HSC 27 direct entry.
ALTER TABLE login_attempts ADD COLUMN student_name TEXT;
