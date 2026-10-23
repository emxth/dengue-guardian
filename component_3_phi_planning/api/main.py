
"""FastAPI application for Component 3: PHI Planning."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from component_3_phi_planning.api.routes.planning import router as planning_router
from component_3_phi_planning.api.routes.phi_mobile import router as phi_mobile_router
from component_3_phi_planning.api.routes.prevention_notification_test import router as prevention_notification_test_router

app = FastAPI(
    title="C3 PHI Planning API",
    description=(
        "Research prototype API for dengue-related PHI inspection "
        "prioritization and resource planning using synthetic data."
    ),
    version="0.2.0",
)

# Allow the Vite development server to call this API in the browser.
# Restricted to localhost origins only; not intended for production deployment.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH"],
    allow_headers=["Content-Type", "Accept", "Authorization", "Idempotency-Key"],
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
app.include_router(phi_mobile_router)
app.include_router(prevention_notification_test_router)
