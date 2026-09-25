from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query
from core.database import db_manager, fallback_store
from models.schemas import FacilitySchema
from services.geo_service import haversine_distance_km

router = APIRouter(prefix="/facilities", tags=["Industrial Facilities & Infrastructure"])


@router.get("", response_model=List[FacilitySchema])
async def list_facilities(
    sector: Optional[str] = Query(None, description="Filter by sector (e.g. Petrochemical, Steel, Mining)"),
    state: Optional[str] = Query(None, description="Filter by Indian State")
):
    """Retrieve all monitored Indian industrial complexes with chemical hazmat profiles and SOPs."""
    results = []

    if db_manager.is_connected and db_manager.db is not None:
        try:
            query = {}
            if sector:
                query["sector"] = {"$regex": sector, "$options": "i"}
            if state:
                query["state"] = {"$regex": state, "$options": "i"}

            cursor = db_manager.db.facilities.find(query)
            async for doc in cursor:
                doc.pop("_id", None)
                results.append(FacilitySchema(**doc))
            return results
        except Exception:
            pass

    for fac in fallback_store.facilities:
        if sector and sector.lower() not in fac.get("sector", "").lower():
            continue
        if state and state.lower() not in fac.get("state", "").lower():
            continue
        results.append(FacilitySchema(**fac))

    return results


@router.get("/nearby", response_model=List[FacilitySchema])
async def get_nearby_facilities(
    lat: float = Query(..., description="Latitude"),
    lon: float = Query(..., description="Longitude"),
    max_distance_km: float = Query(50.0, description="Search radius in kilometers")
):
    """
    Geospatial Proximity Search: Find all industrial facilities within a given radius
    using native MongoDB $near operator with 2dsphere index.
    """
    results = []

    # 1. MongoDB 2dsphere geospatial search
    if db_manager.is_connected and db_manager.db is not None:
        try:
            query = {
                "location": {
                    "$near": {
                        "$geometry": {
                            "type": "Point",
                            "coordinates": [lon, lat]
                        },
                        "$maxDistance": max_distance_km * 1000  # meters
                    }
                }
            }
            cursor = db_manager.db.facilities.find(query).limit(10)
            async for doc in cursor:
                doc.pop("_id", None)
                results.append(FacilitySchema(**doc))
            return results
        except Exception:
            pass

    # 2. Fallback Haversine Calculation
    for fac in fallback_store.facilities:
        coords = fac["location"]["coordinates"]
        dist = haversine_distance_km(lat, lon, coords[1], coords[0])
        if dist <= max_distance_km:
            results.append(FacilitySchema(**fac))

    return results


@router.get("/{facility_id}", response_model=FacilitySchema)
async def get_facility_by_id(facility_id: str):
    """Retrieve detailed chemical hazard sheets and emergency contacts for a facility."""
    if db_manager.is_connected and db_manager.db is not None:
        doc = await db_manager.db.facilities.find_one({"id": facility_id})
        if doc:
            doc.pop("_id", None)
            return FacilitySchema(**doc)

    for fac in fallback_store.facilities:
        if fac.get("id") == facility_id:
            return FacilitySchema(**fac)

    raise HTTPException(status_code=404, detail=f"Facility '{facility_id}' not found.")
