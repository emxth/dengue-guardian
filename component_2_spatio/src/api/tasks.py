import logging
import os
from datetime import datetime

from celery import Celery
from pymongo import MongoClient

logger = logging.getLogger(__name__)

# 1. Initialize Celery connecting to Redis
redis_url = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0")
celery_app = Celery("dengue_tasks", broker=redis_url, backend=redis_url)

# 2. MongoDB Connection
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/")
mongo_client = MongoClient(MONGO_URI)
db = mongo_client["dengue_guardian"]
vector_collection = db["vector_telemetry"]


# 3. The Background Task
@celery_app.task(name="process_edge_telemetry")
def process_edge_telemetry(payload: dict):
    """
    This function runs asynchronously in the Celery worker container.
    It takes the raw JSON payload from Component 1, processes it, and bulk inserts it.
    """
    try:
        records_to_insert = []
        for record in payload.get("data", []):
            records_to_insert.append(
                {
                    "timestamp": datetime.utcnow(),
                    "ward_id": record.get("ward_id"),
                    "mosquito_density": record.get("density"),
                    "device_id": record.get("device_id"),
                }
            )

        if records_to_insert:
            vector_collection.insert_many(records_to_insert)

        inserted_count = len(records_to_insert)
        logger.info(
            f"Successfully processed and stored {inserted_count} vector logs in MongoDB."
        )
        return {"status": "success", "inserted": inserted_count}

    except Exception as e:
        logger.error(f"Error processing edge telemetry: {e}")
        return {"status": "failed", "error": str(e)}
