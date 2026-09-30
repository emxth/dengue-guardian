# Component 3 – Adaptive AI-Based PHI Inspection Planning and Resource Optimization

> **Project:** Dengue Guardian: Adaptive AI-Driven Dengue Surveillance and Decision Support Framework for Sri Lankan Public Health  
> **Research Component:** Component 3 – Individual Research  
> **Status:** 🚧 Structure initialised – algorithms under active research

---

## Table of Contents

1. [Research Objective](#1-research-objective)
2. [Five Main Research Functions](#2-five-main-research-functions)
3. [Expected Inputs](#3-expected-inputs)
4. [Expected Outputs](#4-expected-outputs)
5. [Proposed Optimization Approaches](#5-proposed-optimization-approaches)
6. [Planned Evaluation Metrics](#6-planned-evaluation-metrics)
7. [Folder Structure](#7-folder-structure)
8. [Getting Started](#8-getting-started)
9. [Dependencies](#9-dependencies)

---

## 1. Research Objective

Sri Lanka's Public Health Inspectors (PHIs) are the primary field force for controlling dengue transmission through larval-source surveillance and elimination. Manual, calendar-based inspection planning fails to adapt to rapid changes in dengue risk landscapes, officer availability, and resource constraints.

**This component aims to design, implement, and experimentally evaluate an adaptive AI-driven planning framework that:**

- Continuously prioritises inspection zones based on real-time epidemiological and environmental risk signals.
- Allocates PHI officers to zones according to their availability, current workload, geographic proximity, and daily inspection capacity.
- Constructs multi-objective inspection schedules that balance urgency, geographic coverage, and workload equity.
- Generates GIS-informed, risk-aware daily travel routes for each PHI officer.
- Dynamically reschedules plans when unforeseen conditions (outbreaks, absences, road disruptions) arise.

The framework will serve as the **decision support layer** for PHI supervisors, producing actionable, explainable plans rather than replacing human judgment.

---

## 2. Five Main Research Functions

### F1 – Dynamic Dengue Inspection Prioritization
Compute a composite risk score for every inspection zone using live and historical epidemiological data, environmental indices, and population density. Zones are ranked daily to produce a prioritised inspection queue that directs field resources where they are most needed.

### F2 – PHI Allocation Based on Availability, Workload, Location, and Capacity
Given the prioritised zone list, match available PHI officers to zones using constraint-aware assignment. Officer attributes considered: leave calendar, number of already-scheduled inspections, geographic base location, and maximum inspections per day.

### F3 – Multi-Objective Inspection Scheduling
Formulate inspection scheduling as a multi-objective optimisation problem with three competing objectives:
- **Objective 1:** Minimise total inspection delay (time between risk-event and inspection).
- **Objective 2:** Maximise geographic coverage across high-risk areas.
- **Objective 3:** Balance workload equitably across the PHI officer pool.

A Pareto-optimal or weighted-sum solution will be produced as the recommended schedule.

### F4 – GIS-Based Risk-Aware Route Optimisation
For each PHI officer, construct an optimised daily travel route over the road network. Routes are computed using a weighted graph where edge costs incorporate both travel time and risk-zone priority, solving a variant of the Travelling Salesman Problem (TSP) or Capacitated Vehicle Routing Problem (CVRP).

### F5 – Adaptive Rescheduling When Conditions Change
Monitor real-time triggers (sudden case-count surges, new outbreak declarations, officer absences, weather/road disruptions) and apply incremental re-optimisation (warm-start) to update existing schedules and routes with minimum disruption to the unchanged portions of the plan.

---

## 3. Expected Inputs

| Category | Data Source | Description |
|---|---|---|
| Epidemiological | MOH / EDCD surveillance system | Weekly/daily dengue case counts per GN division |
| Historical incidence | MOH archives | Multi-year dengue incidence per zone for baseline risk |
| Environmental | Meteorological Department / satellite | Rainfall, temperature, humidity, vegetation index |
| GIS / Administrative | Survey Department Sri Lanka | Administrative boundaries, road network (OSM) |
| PHI workforce | PHI regional offices | Officer IDs, base locations, availability calendars, capacity |
| Inspection history | PHI logbooks / existing systems | Dates and results of past inspections per zone |
| Real-time triggers | MOH alerts / local reports | Outbreak declarations, road closures, officer absences |

---

## 4. Expected Outputs

| Output | Format | Consumer |
|---|---|---|
| Prioritised inspection queue | Ranked list (JSON / CSV) | PHI Supervisor dashboard |
| PHI allocation plan | Assignment table (CSV / DB record) | Regional PHI office |
| Weekly inspection schedule | Time-slotted table per officer | PHI officers & supervisors |
| Optimised daily routes | GeoJSON / interactive HTML map | PHI officers (mobile / web) |
| Rescheduling change report | Diff summary (JSON / PDF) | PHI supervisors |
| Evaluation metrics report | Tables + charts (PDF / HTML) | Research / academic output |

---

## 5. Proposed Optimization Approaches

Three candidate solvers will be **experimentally implemented and comparatively evaluated**. No final selection has been made; the choice will be data-driven.

### 5.1 Google OR-Tools
- **CP-SAT Solver** – constraint programming for scheduling (F3).
- **Vehicle Routing Library (VRPTW)** – time-windowed route optimisation (F4).
- Strengths: production-grade, exact solutions for moderate problem sizes, strong constraint modelling.

### 5.2 Genetic Algorithm (GA)
- Custom single-objective GA for prioritisation-driven assignment (F1, F2).
- Chromosome encoding: permutation of zone–officer pairs.
- Operators: order crossover (OX), swap mutation, tournament selection.
- Strengths: flexible encoding, no need for gradient information, naturally handles combinatorial spaces.

### 5.3 NSGA-II (Non-Dominated Sorting Genetic Algorithm II)
- Multi-objective evolutionary algorithm for scheduling (F3) and combined routing (F4).
- Produces a Pareto front of non-dominated solutions, enabling supervisor trade-off selection.
- Strengths: well-established in multi-objective combinatorial optimisation literature, supports conflicting objectives without manual weight tuning.

All three solvers will be wrapped behind a common interface defined in `optimization/` to ensure fair comparison.

---

## 6. Planned Evaluation Metrics

| Metric | Unit | Function(s) | Notes |
|---|---|---|---|
| Total travel distance | km | F4, F5 | Lower is better |
| Total travel time | minutes | F4, F5 | Lower is better |
| Inspection coverage rate | % of priority zones | F3, F4 | Higher is better |
| Workload Gini coefficient | 0–1 (0 = perfect equality) | F2, F3 | Lower is better |
| Average schedule delay | hours | F1, F3 | Time from risk-event to scheduled inspection; lower is better |
| Rescheduling disruption index | % of schedule changed | F5 | Lower is better |
| Solver wall-clock time | seconds | F3, F4 | Computational feasibility |
| Hypervolume indicator (HV) | — | F3 (NSGA-II) | Pareto front quality; higher is better |

Statistical significance will be assessed via Wilcoxon signed-rank tests across 5-fold cross-validation runs (seed = 42).

---

## 7. Folder Structure

```
component_3_phi_planning/
│
├── prioritization/          # F1 – Dynamic risk scoring & zone ranking
│   └── __init__.py
│
├── allocation/              # F2 – PHI officer–zone assignment
│   └── __init__.py
│
├── scheduling/              # F3 – Multi-objective inspection scheduling
│   └── __init__.py
│
├── routing/                 # F4 – GIS-based risk-aware route optimisation
│   └── __init__.py
│
├── rescheduling/            # F5 – Adaptive re-planning under dynamic triggers
│   └── __init__.py
│
├── optimization/            # Shared solver wrappers (OR-Tools, GA, NSGA-II)
│   └── __init__.py
│
├── data/                    # Raw & processed data (git-ignored; schema docs only)
├── models/                  # Serialised model artefacts (git-ignored)
├── tests/                   # Unit & integration tests (pytest)
│
├── config.py                # Central configuration for all sub-modules
├── main.py                  # Pipeline entry point
├── requirements.txt         # Python dependency list
└── README.md                # This file
```

---

## 8. Getting Started

```bash
# 1. Clone the repository (if not already done)
git clone <repo-url>
cd dengue-guardian/component_3_phi_planning

# 2. Create and activate a virtual environment
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS / Linux
source .venv/bin/activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Verify the placeholder pipeline runs
python main.py --solver or_tools --horizon 7
```

> **Note:** The pipeline will log placeholder messages for each step until the corresponding sub-module is implemented.

---

## 9. Dependencies

See [`requirements.txt`](requirements.txt) for the full pinned list. Key packages:

| Package | Purpose |
|---|---|
| `ortools` | Google OR-Tools – CP-SAT & VRP routing |
| `deap` | Evolutionary algorithms – GA & NSGA-II |
| `geopandas` / `osmnx` | Spatial data handling & road-network routing |
| `folium` | Interactive map generation |
| `numpy` / `pandas` / `scipy` | Numerical computing & data processing |
| `matplotlib` / `seaborn` / `plotly` | Visualisation & reporting |
| `pytest` / `pytest-cov` | Testing & coverage |

---

*Component 3 is part of the Dengue Guardian group research project.*  
*For the overall system architecture, refer to the [root README](../README.md).*
