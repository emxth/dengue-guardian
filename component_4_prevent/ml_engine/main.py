# FastAPI entry point for ML Microservice

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from recommendation_engine import RecommendationEngine

app = FastAPI(title="Dengue Guardian - Prevention Intelligence ML Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
engine = None

@app.on_event("startup")
def load_engine():
    global engine
    engine = RecommendationEngine()

class ContextRequest(BaseModel):
    temperature: float
    rainfall: float
    cumulative_rainfall_14_days: float
    wind_speed: float
    mosquito_density: float
    breeding_sites_count: int

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "ML Recommendation Engine (XGBoost Active)"}

@app.post("/recommend")
def recommend_intervention(context: ContextRequest):
    try:
        context_dict = context.dict()
        result = engine.get_recommendation(context_dict)
        return {"success": True, "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)