"""AccessRoute FastAPI Layer: Modern REST API with full CORS support.

Wraps the core AccessRoute backend and existing World state without modifying
any routing algorithms or domain logic.
"""
from __future__ import annotations

import sys
import os
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# Ensure the backend directory is in sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from server import WORLD, ApiError  # Direct invocation of existing backend state

app = FastAPI(
    title="AccessRoute API",
    description="Live, uncertainty-aware accessibility routing engine for hackathon applications",
    version="2.0.0",
)

# Configure CORS so any local frontend (Vite on :5173, etc.) can communicate
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Request Models ---
class ReportRequest(BaseModel):
    edge_id: str
    barrier: str
    reporter: str = "guest"
    confidence: float = Field(0.8, ge=0.05, le=1.0)
    present: bool = True


class VisionRequest(BaseModel):
    label: str
    edge_id: Optional[str] = None
    offmap: bool = False
    source: Optional[str] = None
    confidence: float = Field(0.85, ge=0.05, le=1.0)


class TimeAdvanceRequest(BaseModel):
    hours: float = Field(1.0, gt=0, le=720)


class PoiUpdateRequest(BaseModel):
    id: str
    entrance_steps: Optional[int] = None
    ramp: Optional[bool] = None
    door_width_m: Optional[float] = None
    automatic_door: Optional[bool] = None


# --- Endpoints ---
@app.get("/api/health")
def health_check() -> Dict[str, str]:
    return {"status": "ok", "engine": "AccessRoute core v1.0", "api": "FastAPI"}


@app.get("/api/bootstrap")
def get_bootstrap() -> Dict[str, Any]:
    with WORLD.lock:
        return WORLD.bootstrap()


@app.get("/api/route")
def get_route(
    profile: str = Query("wheelchair", description="User mobility profile"),
    start: int = Query(0, description="Start node id"),
    goal: int = Query(80, description="Destination node id"),
) -> Dict[str, Any]:
    query_dict = {
        "profile": [profile],
        "start": [str(start)],
        "goal": [str(goal)],
    }
    try:
        with WORLD.lock:
            return WORLD.route(query_dict)
    except ApiError as e:
        raise HTTPException(status_code=e.status, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Bad request: {e}")


@app.get("/api/edge")
def get_edge(
    id: str = Query(..., description="Edge identifier, e.g. 0-1"),
    profile: str = Query("wheelchair", description="Profile for impact calculation"),
) -> Dict[str, Any]:
    query_dict = {
        "id": [id],
        "profile": [profile],
    }
    try:
        with WORLD.lock:
            return WORLD.edge(query_dict)
    except ApiError as e:
        raise HTTPException(status_code=e.status, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Bad request: {e}")


@app.get("/api/places")
def get_places(
    profile: str = Query("wheelchair", description="Profile to assess entrance accessibility"),
) -> Dict[str, Any]:
    query_dict = {
        "profile": [profile],
    }
    try:
        with WORLD.lock:
            return WORLD.places(query_dict)
    except ApiError as e:
        raise HTTPException(status_code=e.status, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Bad request: {e}")


@app.post("/api/report")
def submit_report(req: ReportRequest) -> Dict[str, Any]:
    body = {
        "edge_id": req.edge_id,
        "barrier": req.barrier,
        "reporter": req.reporter,
        "confidence": req.confidence,
        "present": req.present,
    }
    try:
        with WORLD.lock:
            return WORLD.report(body)
    except ApiError as e:
        raise HTTPException(status_code=e.status, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Bad request: {e}")


@app.post("/api/vision")
def submit_vision(req: VisionRequest) -> Dict[str, Any]:
    body = {
        "label": req.label,
        "edge_id": req.edge_id,
        "offmap": req.offmap,
        "source": req.source,
        "confidence": req.confidence,
    }
    try:
        with WORLD.lock:
            return WORLD.vision(body)
    except ApiError as e:
        raise HTTPException(status_code=e.status, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Bad request: {e}")


@app.post("/api/time")
def advance_time(req: TimeAdvanceRequest) -> Dict[str, Any]:
    body = {"hours": req.hours}
    try:
        with WORLD.lock:
            return WORLD.advance(body)
    except ApiError as e:
        raise HTTPException(status_code=e.status, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Bad request: {e}")


@app.post("/api/poi")
def update_poi_entrance(req: PoiUpdateRequest) -> Dict[str, Any]:
    body = req.model_dump(exclude_unset=True)
    try:
        with WORLD.lock:
            return WORLD.poi_update(body)
    except ApiError as e:
        raise HTTPException(status_code=e.status, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Bad request: {e}")


@app.post("/api/reset")
def reset_simulation() -> Dict[str, Any]:
    try:
        with WORLD.lock:
            return WORLD.do_reset({})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Reset failed: {e}")


if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=False)
