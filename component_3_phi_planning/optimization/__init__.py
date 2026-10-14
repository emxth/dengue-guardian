"""
optimization package
====================
Shared optimisation utilities and solver wrappers for Component 3.

Planned functionality
---------------------
- Abstract interfaces (base classes / protocols) that each candidate solver
  must implement, enabling fair experimental comparison.
- Candidate solvers to be implemented and evaluated:
    1. Google OR-Tools (CP-SAT, Routing Library)
    2. Genetic Algorithm (GA) – custom implementation
    3. NSGA-II – multi-objective evolutionary optimisation
- Common helpers: convergence tracking, Pareto-front extraction,
  hyperparameter configuration loading.

Status: PLACEHOLDER – implementation pending experimental evaluation.
"""
