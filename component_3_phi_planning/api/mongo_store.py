"""MongoDB connection for mobile PHI accounts and released schedules."""

import os
from functools import lru_cache

from pymongo import MongoClient


def get_mongo_uri():
    configured_uri = os.getenv("MONGODB_URI")
    if configured_uri:
        return configured_uri
    if os.getenv("APP_ENV", "development").casefold() in {"development", "dev", "test"}:
        return "mongodb://localhost:27017"
    raise RuntimeError("MONGODB_URI is required outside local development.")


@lru_cache(maxsize=1)
def get_database():
    mongo_uri = get_mongo_uri()
    database_name = os.getenv("MONGODB_DATABASE", "dengue_guardian")
    client = MongoClient(mongo_uri, serverSelectionTimeoutMS=5000)
    client.admin.command("ping")
    database = client[database_name]
    database.phi_accounts.create_index("phi_id", unique=True)
    database.phi_released_schedules.create_index("planning_date", unique=True)
    return database