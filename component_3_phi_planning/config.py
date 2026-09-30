"""
config.py – Component 3: Adaptive AI-Based PHI Inspection Planning
==================================================================
Central configuration for all sub-modules.

All tunable parameters are defined here so that experiments can be
reproduced and compared by simply changing this file (or overriding
via environment variables / a YAML config file in a later iteration).

NOTE: No algorithm has been implemented yet. These settings are
      structural placeholders for the planned experimental framework.
"""

from __future__ import annotations

# ---------------------------------------------------------------------------
# General project metadata
# ---------------------------------------------------------------------------
PROJECT_NAME = "Dengue Guardian – Component 3: PHI Inspection Planning"
VERSION = "0.1.0-alpha"

# ---------------------------------------------------------------------------
# Data paths (relative to this file's directory)
# ---------------------------------------------------------------------------
DATA_DIR = "data"
MODELS_DIR = "models"

# ---------------------------------------------------------------------------
# Optimisation solver selection
# Candidate values: "or_tools" | "genetic_algorithm" | "nsga2"
# Will be set programmatically during experimental evaluation.
# ---------------------------------------------------------------------------
SOLVER = "or_tools"  # default – subject to change after benchmarking

# ---------------------------------------------------------------------------
# Prioritisation settings
# ---------------------------------------------------------------------------
PRIORITIZATION = {
    "risk_score_weights": {
        "case_count": 0.40,
        "historical_incidence": 0.25,
        "environmental_index": 0.20,
        "population_density": 0.15,
    },
    "top_k_zones": 20,  # number of high-priority zones passed to scheduler
}

# ---------------------------------------------------------------------------
# PHI allocation settings
# ---------------------------------------------------------------------------
ALLOCATION = {
    "max_inspections_per_officer_per_day": 8,
    "workload_balance_weight": 0.5,   # 0 = ignore balance, 1 = fully balanced
}

# ---------------------------------------------------------------------------
# Scheduling settings
# ---------------------------------------------------------------------------
SCHEDULING = {
    "planning_horizon_days": 7,
    "time_slot_minutes": 60,
    "objectives": ["minimise_delay", "maximise_coverage", "balance_workload"],
}

# ---------------------------------------------------------------------------
# Routing settings
# ---------------------------------------------------------------------------
ROUTING = {
    "travel_mode": "driving",       # "driving" | "walking" | "transit"
    "max_route_duration_hours": 8,
    "use_risk_weighted_graph": True,
}

# ---------------------------------------------------------------------------
# Rescheduling settings
# ---------------------------------------------------------------------------
RESCHEDULING = {
    "trigger_thresholds": {
        "new_cases_surge_pct": 30,   # % increase that triggers re-plan
        "officer_absence": True,
        "new_outbreak_zone": True,
    },
    "warm_start": True,
}

# ---------------------------------------------------------------------------
# Evaluation / experiment settings
# ---------------------------------------------------------------------------
EVALUATION = {
    "metrics": [
        "total_travel_distance_km",
        "total_travel_time_min",
        "coverage_rate_pct",
        "workload_gini_coefficient",
        "schedule_delay_avg_hours",
        "solver_wall_clock_seconds",
    ],
    "random_seed": 42,
    "cross_validation_folds": 5,
}
