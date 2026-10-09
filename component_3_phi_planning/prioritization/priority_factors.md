
# C3 Priority Factor Design

## 1. Purpose

This document defines the initial factors for dynamically prioritizing PHI inspection tasks in the Adaptive AI-Based PHI Inspection Planning and Resource Optimization component of Dengue Guardian.

The purpose is to identify which inspection tasks should be addressed first using available dengue-risk information, case notifications, citizen complaints and follow-up requirements. The design will support later PHI allocation, inspection scheduling and route optimization.

## 2. Evidence Sources

The initial design is based on:

- Findings from the Kaduwela MOH/PHI consultation on 6 October 2026.
- The Component 3 research problem, objectives and proposed functional requirements.
- The current C3 development database and its data dictionary.
- Related research on workforce allocation, scheduling and routing optimization.

The current SQLite dataset is synthetic and provisional. Its records will be used to develop and test the initial prototype, not as evidence of actual Kaduwela dengue patterns.

## 3. Proposed Priority Factors

| ID | Factor | Relevant Data | Purpose |
|---|---|---|---|
| PF01 | Dengue risk information | `risk_indicator` | Represent the risk associated with an inspection task. |
| PF02 | Case notification | `task_type`, `inspection_required` | Identify notified cases that require inspection. |
| PF03 | Citizen complaint | `complaint_type` | Consider reported issues requiring PHI attention. |
| PF04 | Complaint urgency | `urgency` | Distinguish urgent complaints from less urgent reports. |
| PF05 | Follow-up requirement | `follow_up_required` | Identify tasks that require a follow-up inspection. |

These factors are proposed for the initial design. Their exact definitions, relative importance and scoring rules will be validated before final implementation.

## 4. Operational Planning Rules

The initial design follows these principles:

1. Inspection priority must be considered before travel distance when determining which tasks should be addressed first.
2. PHI availability, workload, working hours and capacity will be considered during allocation and scheduling rather than automatically added to the priority score.
3. Geographic location, road-network information and estimated travel time will support route optimization.
4. When a PHI is unavailable or overloaded, the system should consider another eligible PHI or reschedule lower-priority tasks, subject to operational constraints.
5. Completed and ongoing inspections should be protected when an adaptive replanning process updates the remaining plan.

These principles reflect the initial consultation findings and proposed system design. The exact operational ordering procedure requires further validation with domain experts.

## 5. Proposed Priority Processing Workflow

1. Load case notifications, citizen complaints and relevant inspection history.
2. Identify records that require an inspection or follow-up.
3. Extract the available risk, complaint urgency and follow-up information.
4. Apply the approved priority rules or scoring mechanism.
5. Produce a ranked list of inspection tasks with a priority score, priority level and explanation.
6. Pass the ranked tasks to PHI allocation and scheduling.
7. Optimize routes without allowing distance alone to override higher-priority tasks.

## 6. Proposed Output

The priority mechanism is expected to produce the following fields:

| Output Field | Description |
|---|---|
| `task_id` | Unique inspection-task identifier |
| `priority_score` | Calculated score based on the approved factors |
| `priority_level` | Assigned priority category |
| `priority_reason` | Explanation of the factors influencing the priority |
| `calculated_at` | Date and time when the priority was calculated |

The final scoring formula, category thresholds and factor weights have not yet been selected. They will be established through research evidence, domain validation and experimental evaluation.

## 7. Data Handling and Design Limitations

- The existing `initial_priority` field represents an existing dataset label. It must not automatically be treated as the final C3 output.
- If existing priority labels are used for comparison or validation, their role must be documented separately from the newly calculated score.
- Case notifications and complaints must be checked for duplicate or related tasks to avoid double counting.
- Missing, invalid or outdated risk information must be handled explicitly.
- Personal and identifiable patient information must not be included in the priority model.
- Synthetic records and coordinates must be clearly identified as simulated data.

## 8. Evaluation Plan

The initial priority mechanism will be evaluated using:

- Agreement with available domain-expert assessments.
- Correct handling of urgent and high-risk tasks.
- Ranking consistency under different input conditions.
- Sensitivity to changes in risk indicators and complaint urgency.
- The proportion of high-priority tasks included in the resulting inspection plan.
- Correct separation of priority decisions from allocation and routing decisions.

The final evaluation measures and acceptance criteria will be refined during implementation.

## 9. Current Design Decision

The initial Component 3 design will separate inspection prioritization from PHI allocation, scheduling and route optimization. Risk information, case notifications, complaint urgency and follow-up requirements will be investigated as priority factors. PHI availability and capacity will constrain allocation and scheduling, while travel distance and time will support routing.

The priority mechanism will be implemented only after the factor definitions and scoring approach have been reviewed and documented.
