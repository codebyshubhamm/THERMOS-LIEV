import logging
from typing import Optional, Dict, Any, List
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from core.config import settings

logger = logging.getLogger("thermos.db")


class InMemoryFallbackStore:
    """In-memory mock store that provides MongoDB-like behavior if MongoDB server is offline."""
    def __init__(self):
        self.anomalies: List[Dict[str, Any]] = []
        self.facilities: List[Dict[str, Any]] = []
        self.incident_reports: List[Dict[str, Any]] = []
        logger.info("Initialized In-Memory fallback store for offline/demo resilience.")


fallback_store = InMemoryFallbackStore()


class DatabaseManager:
    client: Optional[AsyncIOMotorClient] = None
    db: Optional[AsyncIOMotorDatabase] = None
    is_connected: bool = False

    async def connect(self):
        try:
            logger.info(f"Connecting to MongoDB at {settings.MONGODB_URL}...")
            self.client = AsyncIOMotorClient(
                settings.MONGODB_URL,
                serverSelectionTimeoutMS=2000,
                connectTimeoutMS=2000
            )
            self.db = self.client[settings.DATABASE_NAME]
            # Verify connection
            await self.client.admin.command('ping')
            self.is_connected = True
            logger.info(f"Connected successfully to MongoDB database '{settings.DATABASE_NAME}'")

            # Create 2dsphere indexes for geospatial queries
            try:
                await self.db.anomalies.create_index([("location", "2dsphere")])
                await self.db.facilities.create_index([("location", "2dsphere")])
                await self.db.anomalies.create_index([("anomaly_id", 1)], unique=True)
                logger.info("Successfully ensured 2dsphere geospatial indexes on anomalies and facilities.")
            except Exception as idx_err:
                logger.warning(f"Index creation warning: {idx_err}")

        except Exception as e:
            self.is_connected = False
            logger.warning(f"MongoDB connection failed: {e}. Falling back to in-memory store.")

    async def close(self):
        if self.client:
            self.client.close()
            self.is_connected = False
            logger.info("MongoDB connection closed.")


db_manager = DatabaseManager()


def get_db() -> Optional[AsyncIOMotorDatabase]:
    return db_manager.db
