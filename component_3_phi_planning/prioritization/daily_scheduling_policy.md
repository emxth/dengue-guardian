# Provisional Daily Scheduling Policy

This policy is for the synthetic Component 3 research prototype. It is not
MOH-approved operational guidance.

## Task eligibility and lifecycle

- New case notifications are eligible when `inspection_required` is Yes and
  their original notification date matches the selected planning date.
- New citizen complaints are eligible when their received date matches the
  selected planning date and the source status is not Closed. Closed complaints
  are excluded from new assignment.
- Inspection-history rows with the same case task ID and an inspection date
  strictly before the planning date are treated as completion evidence. A
  same-day row is not completion evidence for that day's schedule. An explicit
  persisted task status takes precedence. This is a prototype assumption because
  the source history has no execution-status field.
- Task execution state (`Pending`, `In Progress`, `Completed`, `Cancelled`) is
  separate from appointment state (`Scheduled`, `Unscheduled`). Lifecycle data
  and scheduling history are stored in the existing submitted-task JSON store;
  the research SQLite database remains unchanged.
- The current PHI mobile inspection screen is a local UI prototype: its submit
  handler does not persist an inspection or call the Component 3 API. Therefore
  the dashboard's status-update API is not treated as evidence of a mobile
  completion integration, and no task is marked Completed from appointment
  dates alone.
- Persisted Pending tasks from earlier dates remain eligible in later runs;
  their original date remains historical metadata. Within each priority tier,
  scheduling favors the task that has waited longest, with the first three
  elapsed days treated as the service target and continued age escalation if
  capacity delays it further. High/Medium/Low tier ordering remains dominant.
  In Progress assignments are reserved and not moved. Completed and Cancelled
  tasks are not assigned again.
- The 12 PHIs in `PHI_Master` default to Available on every planning date.
  `PHI_Daily`, when present, supplies date-specific capacity, workload, working
  hours, and range; when absent, nominal capacity and working hours come from
  `PHI_Master` and date-specific workload defaults to zero. Explicit user
  availability overrides are stored separately by PHI and planning date; an
  Unavailable override affects only that date, while no saved default is
  written as an override. Restoring Available is also date-specific.

## Review fallback and task dates

- The approved numeric scoring formula is unchanged. Missing-score tasks retain
  `priority_score = null` and `priority_level = Review`.
- For scheduling only, Review tasks use a transparent fallback tier derived
  from available Component 2 risk level and explicit complaint urgency. If
  neither is usable, cases use the configured routine-case baseline as a
  scheduling tier; other tasks use Low. No risk score or numeric priority score
  is fabricated. The API labels these rows with `priority_fallback` and a
  reason.
- No generated deadline or overdue fields are used. Tasks received on the
  selected date are considered before carried work within the same priority
  tier. Original task dates remain historical metadata; elapsed waiting time
  orders carried Pending work oldest-first and continues to increase preference
  after three days. Three days is a service target, not a hard expiry. If daily
  capacity is insufficient, tasks remain Pending and continue in the next day's
  queue.
- New source tasks are loaded only for the selected planning date. Persisted
  Pending tasks from earlier dates may carry forward; their age does not block
  assignment or change solver priority. In Progress assignments remain reserved.

## Reruns and rescheduling

- A task's source notification/creation date remains in `task_date`; each run's
  `planning_date` is stored separately. Stable task IDs prevent duplicate task
  registry entries.
- Repeating the same plan does not append duplicate identical schedule-history
  events. When a per-date CSV changes, the previous snapshot is archived rather
  than silently discarded.
- Adaptive rescheduling orders affected work by the existing effective
  priority tier, same-day status, and waiting age using the daily allocator's
  queue policy. Within an eligible MOH area it prefers the task's village PHI,
  then its range PHI, and then an available backup. Completed and In Progress
  tasks remain protected.
- Existing schedule CSVs without execution status continue to be rejected by
  default; `assume_all_pending` remains available only for an explicit legacy
  simulation.
- Generated plans are saved as drafts. MOH confirmation is persisted by
  planning date and plan fingerprint; repeating confirmation is idempotent.
  A saved PHI unavailability affecting Pending appointments blocks confirmation
  and schedule regeneration until adaptive rescheduling succeeds or the
  availability override is explicitly restored. Confirmation does not publish
  or deliver the plan to the PHI application.
- The PHI application currently has no Component 3 task ID or inspection-submit
  API integration. Its local alert is not completion evidence. The dashboard
  displays persisted task status read-only; completion must not be inferred
  solely from appointment date or assignment.