# School Database Design

## The tables

**students** stores one row for each person who studies at the school. It holds a unique `student_id` (the primary key), first name, last name and email. The email is `UNIQUE`, so two students can never share one, and every column is `NOT NULL` because a student record is useless without them.

**courses** stores one row for each subject that can be taken, such as Mathematics or English. It holds a unique `course_id` (the primary key), the course title and the number of credits.

**enrolments** stores one row for each time a student joins a course. It holds its own `enrolment_id`, a `student_id` that points to the students table, a `course_id` that points to the courses table, and the `grade`. The grade is allowed to be empty (`NULL`) because a student who has just joined has not been graded yet. A `UNIQUE (student_id, course_id)` rule stops the same student from enrolling on the same course twice.

## The relationships

- **One student can have many enrolments** (one-to-many). Amina is enrolled on Mathematics and Computer Science, so she has two enrolment rows.
- **One course can have many enrolments** (one-to-many). Mathematics has three students, so it has three enrolment rows.
- **Students and courses are many-to-many.** One student takes many courses, and one course has many students.

**Why a join table is needed.** A single table cannot hold a many-to-many relationship cleanly. If we put a list of courses inside each student row, we would have to squeeze several values into one cell, and searching or counting them would be messy. If we put the students inside each course row, we would have the same problem the other way round. The enrolments table solves this by turning one many-to-many relationship into two one-to-many relationships. It is like a class register: students and courses each keep their own list, and the register records who sits in which class. It is also the natural place for the grade, because a grade belongs to a student *on a course*, not to the student alone or to the course alone.

## An index I would add

```sql
CREATE INDEX idx_enrolments_course_id ON enrolments(course_id);
```

The `UNIQUE (student_id, course_id)` rule already creates an index that makes searches by student fast. Searches by course (for example "all students on Mathematics", or counting students per course) have nothing to help them, so the database would have to read every enrolment row. An index on `course_id` works like the index at the back of a book: the database jumps straight to the right rows instead of reading everything. This matters most once the school has thousands of enrolments.

## SQL or NoSQL?

I would choose **SQL** for this system. School data is highly connected, with students, courses and grades all linked to each other, and a relational database is built for exactly that. It lets us enforce rules such as "no duplicate emails", "no duplicate enrolments" and "an enrolment must belong to a real student", so mistakes are rejected before they enter the data. It also makes questions like "how many students are on each course" or "which students have no enrolments" easy to answer with JOIN and GROUP BY. The structure is stable and well understood, so the flexibility of NoSQL would not help here, and school records need to be accurate and consistent more than anything else. NoSQL would make more sense if the data had no fixed shape or had to be spread across many servers for huge traffic, and neither applies to a school.
