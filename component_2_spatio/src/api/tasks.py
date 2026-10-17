import logging
import os
from datetime import datetime

from celery import Celery
from sqlalchemy import Column, DateTime, Float, Integer, String, create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

logger = logging.getLogger(__name__)

# 1. Initialize Celery connecting to Redis
redis_url = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0")
celery_app = Celery("dengue_tasks", broker=redis_url, backend=redis_url)

# 2. Database Connection
db_url = os.getenv("DATABASE_URL")
engine = create_engine(db_url)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


# Define the table structure for the incoming IoT data
class VectorLog(Base):
    __tablename__ = "vector_telemetry"
    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
    ward_id = Column(Integer, index=True)
    mosquito_density = Column(Float)
    device_id = Column(String)


Base.metadata.create_all(bind=engine)


# 3. The Background Task
@celery_app.task(name="process_edge_telemetry")
def process_edge_telemetry(payload: dict):
    """
    This function runs asynchronously in the Celery worker container.
    It takes the raw JSON payload from Component 1, processes it, and bulk inserts it.
    """
    db = SessionLocal()
    try:
        # TODO: Want to change the payload structure to be more efficient, but for now, we will assume it's a list of records.
        # Assuming the payload is a list of JSON records from MongoDB/SQLite
        records_to_insert = []
        for record in payload.get("data", []):
            new_log = VectorLog(
                ward_id=record.get("ward_id"),
                mosquito_density=record.get("density"),
                device_id=record.get("device_id"),
            )
            records_to_insert.append(new_log)

        db.bulk_save_objects(records_to_insert)
        db.commit()

        inserted_count = len(records_to_insert)
        logger.info(
            f"Successfully processed and stored {inserted_count} vector logs from Edge AI."
        )
        return {"status": "success", "inserted": inserted_count}

    except Exception as e:
        db.rollback()
        logger.error(f"Error processing edge telemetry: {e}")
        return {"status": "failed", "error": str(e)}
    finally:
        db.close()
