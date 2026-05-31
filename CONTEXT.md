# Domain Context: Climbing Training Tracker

## Core Concepts

### User
A person with an account in the system. Created via CLI seed script — no self-registration. Identified by email and authenticated with a password (argon2 hash). All domain data is owned by a User.

### Exercise
A named physical activity that can be logged during a Training Session. Belongs to a Category. May have a default sets/reps hint (free text, e.g. "3×10s"). Can define zero or more Exercise Fields for numeric tracking. Exercises are a global shared library — the same Exercise can appear on multiple Training Days.

An Exercise is never hard-deleted if it has log entries. It is archived instead (soft delete). Hard delete is only permitted if the Exercise has zero log entries.

### Exercise Field
A named numeric metric belonging to an Exercise. Examples: "weight" (unit: kg), "duration" (unit: sec). An Exercise can have multiple Fields. Field values are optional per log entry.

### Category
A grouping for Exercises. Examples: finger, strength, stretch. Free-form string on the Exercise — not a separate entity.

### Week Template
A named configuration of training days for a week. Only one Week Template is active at a time. Defines which weekdays are training days and what exercises appear on each day. Switching templates takes effect from the next week.

### Training Day
A weekday (Mon–Sun) within a Week Template that has at least one assigned exercise or the climbing flag set. A Training Day can have both exercises and climbing simultaneously.

### Training Day Exercise
An assignment of an Exercise to a Training Day within a Week Template. Can optionally override the Exercise's default sets/reps hint.

### Training Session
A logged instance of a Training Day — the record of actually doing the exercises on a specific date. Pre-populated from the Week Template active at that date. The user can add extra exercises from the library on the day.

### Training Session Exercise
The record of one Exercise within a Training Session. Tracks whether the exercise was completed (boolean) and the values for each Exercise Field.

### Grade
A difficulty level defined in the system. Has a name (e.g. "blau"), an integer difficulty for ordering and charting (e.g. 1–8), and an optional display color. Grades are configurable from the webapp. The default seed uses the gym's 8 color-coded grades: weiß (1), gelb (2), grün (3), blau (4), lila (5), rot (6), orange (7), schwarz (8).

### Climbing Session
A logged bouldering/climbing visit on a specific date. Independent of the Training Session model. A Training Day with the climbing flag set indicates the user expects to climb that day, but Climbing Sessions are logged separately.

### Climbing Session Entry
A single Grade attempted within a Climbing Session. Records the number of sends (successful tops) and attempts.

## Boundaries

**Exercise ↔ Climbing:** These are separate tracking concerns. Exercises (strength, finger, stretch work) are logged in Training Sessions. Climbing routes are logged in Climbing Sessions. They can occur on the same calendar day but are never mixed in the same record.

**Week Template ↔ Training Session:** The template defines the plan; the Training Session is the execution. Changing the template does not retroactively alter past sessions.

**Grade ↔ Exercise:** Grades belong to climbing only. Exercise Fields are numeric (kg, sec, reps) — not grades.
