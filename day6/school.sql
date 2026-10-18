-- Day 6: School database (SQLite)
-- Run this whole file in sqliteonline.com (choose SQLite).

PRAGMA foreign_keys = ON;

-- Start clean so the file can be run again without errors
DROP TABLE IF EXISTS enrolments;
DROP TABLE IF EXISTS courses;
DROP TABLE IF EXISTS students;

-- 1. TABLES --------------------------------------------------------

CREATE TABLE students (
    student_id  INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name  TEXT NOT NULL,
    last_name   TEXT NOT NULL,
    email       TEXT NOT NULL UNIQUE
);

CREATE TABLE courses (
    course_id   INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT NOT NULL,
    credits     INTEGER NOT NULL
);

CREATE TABLE enrolments (
    enrolment_id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id   INTEGER NOT NULL,
    course_id    INTEGER NOT NULL,
    grade        TEXT,
    FOREIGN KEY (student_id) REFERENCES students(student_id),
    FOREIGN KEY (course_id)  REFERENCES courses(course_id),
    UNIQUE (student_id, course_id)   -- same student cannot join the same course twice
);

-- 2. SAMPLE DATA ---------------------------------------------------

INSERT INTO students (first_name, last_name, email) VALUES
    ('Amina',  'Wanjiru', 'amina.wanjiru@school.test'),
    ('Brian',  'Kipkoech','brian.kipkoech@school.test'),
    ('Cynthia','Otieno',  'cynthia.otieno@school.test'),
    ('David',  'Mwangi',  'david.mwangi@school.test');

INSERT INTO courses (title, credits) VALUES
    ('Mathematics', 4),
    ('English',     3),
    ('Computer Science', 4);

INSERT INTO enrolments (student_id, course_id, grade) VALUES
    (1, 1, 'A'),
    (1, 3, 'B'),
    (2, 1, 'B'),
    (2, 2, 'C'),
    (3, 3, 'A'),
    (3, 1, NULL);

-- 3. QUERIES -------------------------------------------------------

-- Query 1: all courses for one student (by name)
SELECT c.title, e.grade
FROM students s
JOIN enrolments e ON e.student_id = s.student_id
JOIN courses c    ON c.course_id  = e.course_id
WHERE s.first_name = 'Amina' AND s.last_name = 'Wanjiru';

-- Query 2: all students on one course
SELECT s.first_name, s.last_name, e.grade
FROM courses c
JOIN enrolments e ON e.course_id  = c.course_id
JOIN students s   ON s.student_id = e.student_id
WHERE c.title = 'Mathematics';

-- Query 3: number of students per course
SELECT c.title, COUNT(e.enrolment_id) AS number_of_students
FROM courses c
LEFT JOIN enrolments e ON e.course_id = c.course_id
GROUP BY c.course_id, c.title;

-- Query 4: students who have no enrolments
SELECT s.first_name, s.last_name, s.email
FROM students s
LEFT JOIN enrolments e ON e.student_id = s.student_id
WHERE e.enrolment_id IS NULL;

-- Query 5: update one enrolment's grade (Cynthia's Mathematics grade)
UPDATE enrolments
SET grade = 'B'
WHERE student_id = (SELECT student_id FROM students WHERE email = 'cynthia.otieno@school.test')
  AND course_id  = (SELECT course_id FROM courses WHERE title = 'Mathematics');

-- Check the update worked
SELECT s.first_name, c.title, e.grade
FROM enrolments e
JOIN students s ON s.student_id = e.student_id
JOIN courses c  ON c.course_id  = e.course_id
WHERE s.email = 'cynthia.otieno@school.test';
