# C3 Initial Priority-Scoring Rules

## 1. Purpose

The purpose of the initial priority-scoring method is to rank dengue case inspections and citizen complaints so that higher-priority tasks can be considered first during PHI inspection planning.

The rules are provisional and will be evaluated using synthetic data and controlled scenarios. They do not represent an officially approved MOH scoring policy.

## 2. Dengue Case Inspection Scoring

The `risk_indicator` field from `Case_Notifications` will be used as the initial numerical risk input.

**Formula:**

`risk_score = risk_indicator × 100`

The input must be numeric and within the expected range of 0 to 1. Invalid or missing values must be flagged rather than silently assigned a score.

### Provisional priority levels

- High: score greater than or equal to 70
- Medium: score greater than or equal to 40 and below 70
- Low: score below 40

These thresholds are initial experimental settings. Alternative thresholds will be tested during evaluation.

## 3. Citizen Complaint Scoring

The `urgency` field from `Citizen_Complaints` will be mapped to a provisional urgency score.

- High urgency: 90
- Medium urgency: 60
- Low urgency: 30

The original complaint urgency and complaint type will be retained in the output so that the assigned priority can be explained.

These numerical values are provisional and require domain-expert validation.

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

The existing `initial_priority` field may be used as a synthetic baseline for comparison, but it must not be treated as verified ground truth.

The generated inspection history must not be treated as independent evidence that the proposed scoring rules are correct.

The method will be reviewed with domain experts when possible. Results from synthetic experiments will not be presented as proof of real-world effectiveness.