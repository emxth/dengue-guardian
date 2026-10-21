# C3 Initial Priority-Scoring Rules

## 1. Purpose

The purpose of the initial priority-scoring method is to rank dengue case inspections and citizen complaints so that higher-priority tasks can be considered first during PHI inspection planning.

The rules are provisional and will be evaluated using synthetic data and controlled scenarios. They do not represent an officially approved MOH scoring policy.

## 2. Dynamic Task Priority Formula

The initial research prototype uses:

`P = 0.50R + 0.20A + 0.15W + 0.15U`

Weights are centrally configurable in `component_3_phi_planning/config.py` so sensitivity runs can adjust them without changing the scoring implementation. They are proposed experimental settings, not a validated or MOH-approved policy.

| Factor | Weight | Definition and normalization |
|---|---:|---|
| `R` Component 2 location risk | 50% | Join by `location_id`; validate a 0–1 risk value and multiply by 100. The configured database has one untimestamped development-seed score per location. There is no historical risk series to select a newer snapshot from. |
| `A` Area dengue activity | 20% | `A = 0.50D + 0.50M`. `D` is distinct case IDs over the trailing 7 calendar days, divided by 7 to obtain a daily mean, normalized against the configured 7 cases/location/day cap and capped at 100. `M` compares current month-to-date daily rate to the average daily rate in the configured prior complete month(s); ratio/2.0 is normalized to 0–100 and capped. |
| `W` Task waiting time | 15% | Non-negative days from task notification/receipt to the selected planning date, divided by the configured 30-day cap and capped at 100. Future task records are excluded from as-of priority results. |
| `U` Task-specific urgency | 15% | Complaints use stored High/Medium/Low urgency mapped to 90/60/30. Case notifications have no urgency column; eligible historical cases use the centrally configured neutral routine-case baseline (60), explicitly marked as a provisional assumption in `priority_factors` and `data_quality_status`. Supplied case urgency overrides the baseline. No legacy labels or risk values infer urgency. |

All factor values and weights are returned under `priority_factors`; the final score is rounded to two decimals. The same configured category thresholds apply to cases and complaints: High >= 70, Medium >= 40 and < 70, Low < 40.

The source includes unique case and complaint identifiers; calculations canonicalize/deduplicate by those identifiers before counting. `inspection_required` is an eligibility gate, not part of the score. PHI availability, capacity and travel feasibility remain scheduler constraints.

If risk, activity, date, or history is unavailable, the task receives `priority_score = null`, `priority_level = Review`, and a `data_quality_status`/explanation. Missing complaint urgency remains Review. The engine never treats unavailable history as a zero score or adds a partial weighted score. The case urgency baseline is a visible assumption, not observed case urgency.

The API's inclusive `date_from`/`date_to` filters apply to the task's notification/received date. The `planning_date` parameter is a separate score-as-of date for activity and waiting time; it does not remove older tasks in the selected range. If the as-of date extends beyond source coverage, activity is unavailable and the task is Review.

## 3. Daily and Monthly Activity Details

The configured database contains synthetic records from 2026-04-01 through 2026-09-30. Daily counts use location-specific `Case_Notifications` and distinct `task_id`. Recent complaints are also returned as contextual activity counts; complaints do not contribute to `A`, which is explicitly dengue case activity.

`M` is available only when the selected month-to-date and at least the configured prior complete month(s) have continuous source-date coverage and a non-zero baseline. The current configuration requires one complete month: this allows May 2 to compare May month-to-date activity with the fully observed April baseline, while April 1 has no preceding covered month and remains Review. Scores based on one baseline month are provisional and lower-confidence; the baseline length is configurable for sensitivity analysis. Zero counts are valid only within complete coverage.

The `Component2_Location_Risk` schema contains `location_id`, `risk_score`, `risk_level`, and `score_source`; it has no timestamp and no feature/provenance detail. All current rows say `Development seed`. It cannot be verified whether those scores include weather or historical dengue activity. The API labels this overlap/provenance limitation; activity is retained as a separate experimental factor pending confirmation of Component 2 inputs. No live weather feed is used.

### Provisional priority levels

- High: score greater than or equal to 70
- Medium: score greater than or equal to 40 and below 70
- Low: score below 40

Thresholds, caps, windows and factor weights are experimental and require sensitivity analysis and domain validation.

## 4. Follow-up Tasks

The `follow_up_required` field in `Inspection_History` describes historical inspection outcomes or requirements. It will not automatically create a new inspection task.

A follow-up task should be generated only when the relevant inspection is confirmed to require follow-up and the follow-up remains outstanding. The implementation must avoid duplicate tasks.

## 5. Allocation, Scheduling and Routing

PHI availability, workload, capacity and location will be considered during task allocation and scheduling, not treated as dengue-risk indicators.

Travel distance and travel time will be considered during route optimization. They must not independently cause a lower-priority task to override a higher-priority task.

## 6. Required Output

The scoring prototype should provide:

- Task identifier
- Task type
- Original risk or urgency input
- Calculated score or urgency index
- Priority level
- Explanation for the assigned priority
- Calculation timestamp

Invalid inputs should be reported for review.

## 7. Evaluation and Limitations

The initial rules will be tested using synthetic records and controlled scenarios. Evaluation will consider priority ordering, handling of high-risk tasks, sensitivity to alternative thresholds and the consistency of explanations.

The existing `initial_priority` field may be used as a synthetic baseline for comparison, but it must not be treated as verified ground truth or as an input to the new priority calculation.

The generated inspection history must not be treated as independent evidence that the proposed scoring rules are correct.

The method will be reviewed with domain experts when possible. Results from synthetic experiments will not be presented as proof of real-world effectiveness.