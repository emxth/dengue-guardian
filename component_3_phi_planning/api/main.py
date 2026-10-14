
"""FastAPI application for Component 3: PHI Planning."""

from fastapi import FastAPI

from component_3_phi_planning.api.routes.planning import router as planning_router

app = FastAPI(
    title="C3 PHI Planning API",
    description=(
        "Research prototype API for dengue-related PHI inspection "
        "prioritization and resource planning using synthetic data."
    ),
    version="0.2.0",
)


@app.get("/health", tags=["Health"])
def health_check():
    """Return the API service status."""
    return {
        "status": "healthy",
        "component": "C3 PHI Planning",
        "data_mode": "synthetic_research_data",
    }


app.include_router(planning_router)
