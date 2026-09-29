"""Core data model: barrier types, user profiles, graph nodes/edges, POIs."""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, Optional

INF = math.inf

# Human-readable names for every barrier the system can reason about.
BARRIERS: Dict[str, str] = {
    "stairs": "Stairs or steps",
    "steep_slope": "Steep slope",
    "broken_surface": "Broken or uneven surface",
    "construction": "Construction / closure",
    "blocked_path": "Path blocked by an obstacle",
    "narrow_path": "Narrow passage",
    "missing_curb_ramp": "No curb ramp at crossing",
    "no_tactile_paving": "No tactile paving at crossing",
}

# How quickly evidence about a barrier goes stale (half-life, in days).
# None = physical infrastructure that does not fade on its own.
# Temporary obstacles (parked scooters) fade in hours; roadworks in weeks.
HALF_LIFE_DAYS: Dict[str, Optional[float]] = {
    "stairs": None,
    "steep_slope": None,
    "broken_surface": 180.0,
    "construction": 45.0,
    "blocked_path": 0.5,
    "narrow_path": 120.0,
    "missing_curb_ramp": 365.0,
    "no_tactile_paving": 365.0,
}


@dataclass(frozen=True)
class Profile:
    """A mobility profile. `impact[barrier]` is the cost multiplier when the
    barrier is present; INF means the barrier is a hard block for this user."""

    key: str
    label: str
    speed_mps: float
    impact: Dict[str, float] = field(default_factory=dict)

    def multiplier(self, barrier: str) -> float:
        return self.impact.get(barrier, 1.0)


PROFILES: Dict[str, Profile] = {
    "wheelchair": Profile("wheelchair", "Wheelchair user", 1.0, {
        "stairs": INF, "steep_slope": INF, "broken_surface": INF,
        "construction": INF, "blocked_path": INF, "narrow_path": INF,
        "missing_curb_ramp": INF, "no_tactile_paving": 1.0,
    }),
    "elderly": Profile("elderly", "Older adult / walking aid", 0.8, {
        "stairs": 8.0, "steep_slope": 3.0, "broken_surface": 3.0,
        "construction": 6.0, "blocked_path": 4.0, "narrow_path": 1.2,
        "missing_curb_ramp": 2.0,
    }),
    "low_vision": Profile("low_vision", "Visually impaired", 1.1, {
        "stairs": 3.0, "steep_slope": 1.2, "broken_surface": 2.5,
        "construction": INF, "blocked_path": 6.0, "narrow_path": 1.5,
        "no_tactile_paving": 4.0,
    }),
    "injured": Profile("injured", "Temporary injury (crutches)", 0.7, {
        "stairs": 10.0, "steep_slope": 3.0, "broken_surface": 4.0,
        "construction": 6.0, "blocked_path": 5.0, "narrow_path": 1.5,
        "missing_curb_ramp": 2.5,
    }),
    # No accessibility needs: every barrier costs nothing extra.
    "standard": Profile("standard", "No accessibility needs", 1.4, {}),
}


@dataclass
class Node:
    id: int
    x: float  # metres east of the map origin
    y: float  # metres north of the map origin
    name: str = ""


@dataclass
class Edge:
    """A walkable link (sidewalk, crossing, or path) between two nodes."""

    id: str
    a: int
    b: int
    length: float
    kind: str = "sidewalk"  # sidewalk | crossing | path
    name: str = ""
    slope_pct: float = 1.0
    width_m: float = 1.8
    steps: int = 0
    surface: str = "smooth"  # smooth | broken
    curb_ramp: bool = True   # meaningful for crossings
    tactile: bool = True     # meaningful for crossings
    baseline: Dict[str, str] = field(default_factory=dict, init=False)

    def __post_init__(self) -> None:
        self.baseline = self._derive_baseline()

    def other(self, node: int) -> int:
        return self.b if node == self.a else self.a

    def _derive_baseline(self) -> Dict[str, str]:
        """Static map attributes -> barrier claims (barrier -> detail text)."""
        out: Dict[str, str] = {}
        if self.steps > 0:
            out["stairs"] = f"{self.steps} steps"
        if abs(self.slope_pct) >= 8.0:
            out["steep_slope"] = f"{abs(self.slope_pct):.0f}% gradient"
        if self.surface == "broken":
            out["broken_surface"] = "surface in poor condition"
        if self.width_m < 0.9:
            out["narrow_path"] = f"{self.width_m:.1f} m wide"
        if self.kind == "crossing" and not self.curb_ramp:
            out["missing_curb_ramp"] = "kerb on at least one side"
        if self.kind == "crossing" and not self.tactile:
            out["no_tactile_paving"] = "no tactile paving"
        return out


@dataclass
class Poi:
    """A place with an entrance whose accessibility we want to describe."""

    id: str
    name: str
    node: int
    entrance_steps: int = 0
    ramp: bool = False
    door_width_m: float = 0.9
    automatic_door: bool = False
    accessible_toilet: bool = False
    verified: Optional[datetime] = None
