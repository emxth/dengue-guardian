# FastAPI entry point for ML Microservice

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional
from recommendation_engine import RecommendationEngine

app = FastAPI(title="Dengue Guardian - Prevention Intelligence ML Service")

engine = None

@app.on_event("startup")
def load_engine():
    global engine
    engine = RecommendationEngine()

class ContextRequest(BaseModel):
    temperature: float
    rainfall: float
    mosquito_density: float
    breeding_sites_count: int
    wind_speed: Optional[float] = 10.0

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "ML Recommendation Engine"}

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
