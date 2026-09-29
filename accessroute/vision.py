"""Vision layer: turns object detections from photos/video into evidence.

Real deployment: implement `Detector.detect(frame)` with a YOLO/DETR model
fine-tuned on sidewalk imagery (pose + GPS come from the phone or a bus/
delivery-robot camera). This prototype ships a `SimulatedDetector` that reads
pre-labelled frames so the whole pipeline (detect -> geo-match -> fuse ->
re-route) can be demonstrated without a GPU or network.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Dict, List, Protocol, Tuple

from .city import City
from .evidence import Evidence

# detector label -> (barrier, present?)
LABEL_MAP: Dict[str, Tuple[str, bool]] = {
    "staircase": ("stairs", True),
    "stairs": ("stairs", True),
    "pothole": ("broken_surface", True),
    "cracked_pavement": ("broken_surface", True),
    "traffic_cone": ("construction", True),
    "construction_barrier": ("construction", True),
    "parked_vehicle": ("blocked_path", True),
    "scooter_pile": ("blocked_path", True),
    "vendor_stall": ("blocked_path", True),
    "kerb_no_ramp": ("missing_curb_ramp", True),
    "curb_ramp": ("missing_curb_ramp", False),        # a ramp DISPROVES the barrier
    "tactile_paving": ("no_tactile_paving", False),   # so does tactile paving
    "narrow_footpath": ("narrow_path", True),
}


@dataclass(frozen=True)
class Detection:
    label: str
    confidence: float
    x: float
    y: float
    frame_id: str
    source_id: str  # camera / device id: one vote per source


class Detector(Protocol):
    def detect(self, frame: dict) -> List[Detection]: ...


class SimulatedDetector:
    """Frame format: {"frame_id", "source", "x", "y",
                      "detections": [{"label", "conf"}]}"""

    def detect(self, frame: dict) -> List[Detection]:
        return [Detection(d["label"], float(d["conf"]), frame["x"], frame["y"],
                          frame["frame_id"], frame["source"])
                for d in frame.get("detections", [])]


def detections_to_evidence(city: City, detections: List[Detection], when: datetime,
                           trust: float = 0.6, max_dist: float = 12.0
                           ) -> Tuple[List[Evidence], List[Tuple[Detection, str]]]:
    """Geo-match each detection to the nearest edge and emit evidence.

    Returns (evidence, rejected) where rejected carries a reason so the
    pipeline is auditable (unknown label, too far from any mapped footpath).
    """
    out: List[Evidence] = []
    rejected: List[Tuple[Detection, str]] = []
    for d in detections:
        mapped = LABEL_MAP.get(d.label)
        if mapped is None:
            rejected.append((d, "unknown label"))
            continue
        hit = city.nearest_edge(d.x, d.y, max_dist)
        if hit is None:
            rejected.append((d, f"no mapped footpath within {max_dist:.0f} m"))
            continue
        edge, _ = hit
        barrier, present = mapped
        out.append(Evidence(edge.id, barrier, present, trust * d.confidence, when,
                            "vision", d.source_id, ref=d.frame_id))
    return out, rejected
