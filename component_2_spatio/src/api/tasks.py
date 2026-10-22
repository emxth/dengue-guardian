import logging
import os
from datetime import datetime

from celery import Celery
from dotenv import load_dotenv
from pymongo import MongoClient

# 1. Explicitly locate the .env file using the absolute path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
load_dotenv(os.path.join(BASE_DIR, ".env"))

logger = logging.getLogger(__name__)

# 2. Initialize Celery connecting to Redis
redis_url = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0")
celery_app = Celery("dengue_tasks", broker=redis_url, backend=redis_url)


# 3. The Background Task
@celery_app.task(name="process_edge_telemetry")
def process_edge_telemetry(payload: dict):
    """
    This function runs asynchronously in the Celery worker container.
    It takes the raw JSON payload from Component 1, processes it, and bulk inserts it.
    """
    # Initialize MongoDB connection INSIDE the task (Thread-safe for Celery workers)
    MONGO_URI = os.getenv("MONGO_URI")
    if not MONGO_URI:
        logger.error("MONGO_URI environment variable is missing.")
        return {"status": "failed", "error": "MONGO_URI missing"}

    client = MongoClient(MONGO_URI)
    db = client["dengue_guardian"]
    vector_collection = db["vector_telemetry"]

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
    finally:
        # Close the connection safely when the task finishes
        client.close()
