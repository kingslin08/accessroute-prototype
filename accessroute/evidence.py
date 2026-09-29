"""Evidence fusion: turns noisy, aging reports into a belief per (edge, barrier).

Each (edge, barrier) pair carries a belief in [0, 1] = P(barrier is there now).
  * prior: 0.90 if the static map already claims the barrier, else 0.05
  * every reporter's latest report shifts the log-odds by
        +/- LLR * weight * decay(age)
    where weight = reporter trust * confidence, and decay follows the
    barrier's half-life (parked scooters fade in hours, stairs never).
  * 'present=False' reports ("it's been cleared / there is a ramp") push
    the belief down, so information can be *updated*, not just accumulated.
  * one vote per reporter per (edge, barrier): a spammer or a camera that
    sends 50 frames still counts once.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Set, Tuple

from .city import City
from .model import BARRIERS, HALF_LIFE_DAYS


def logit(p: float) -> float:
    return math.log(p / (1.0 - p))


def sigmoid(x: float) -> float:
    return 1.0 / (1.0 + math.exp(-x))


@dataclass(frozen=True)
class Evidence:
    edge_id: str
    barrier: str
    present: bool          # True = "barrier is here", False = "no barrier / cleared"
    weight: float          # trust * confidence, 0..1
    time: datetime
    source: str            # "crowd" | "vision" | "survey"
    reporter: str          # unique id: user id or camera id
    ref: str = ""          # photo / frame id for auditability


def _ago(delta: timedelta) -> str:
    hours = delta.total_seconds() / 3600
    if hours < 1:
        return "just now"
    if hours < 48:
        return f"{hours:.0f} h ago"
    return f"{hours / 24:.0f} days ago"


class EvidenceStore:
    def __init__(self, city: City, llr: float = 3.0,
                 base_prior: float = 0.05, map_prior: float = 0.90):
        self.city = city
        self.llr = llr
        self.base_prior = base_prior
        self.map_prior = map_prior
        self._ev: Dict[Tuple[str, str], List[Evidence]] = {}
        self._by_edge: Dict[str, Set[str]] = {}
        self.version = 0  # bumps on every change; watchers poll it

    # -- ingest ------------------------------------------------------------
    def add(self, ev: Evidence) -> None:
        if ev.edge_id not in self.city.edges:
            raise KeyError(f"unknown edge {ev.edge_id}")
        if ev.barrier not in BARRIERS:
            raise KeyError(f"unknown barrier {ev.barrier}")
        w = max(0.0, min(1.0, ev.weight))
        if w != ev.weight:
            ev = Evidence(ev.edge_id, ev.barrier, ev.present, w, ev.time,
                          ev.source, ev.reporter, ev.ref)
        self._ev.setdefault((ev.edge_id, ev.barrier), []).append(ev)
        self._by_edge.setdefault(ev.edge_id, set()).add(ev.barrier)
        self.version += 1

    def add_many(self, evs) -> None:
        for e in evs:
            self.add(e)

    def crowd_report(self, edge_id: str, barrier: str, when: datetime,
                     reporter: str, trust: float = 0.7, confidence: float = 0.8,
                     present: bool = True, ref: str = "") -> Evidence:
        ev = Evidence(edge_id, barrier, present, trust * confidence, when,
                      "crowd", reporter, ref)
        self.add(ev)
        return ev

    # -- queries -----------------------------------------------------------
    @staticmethod
    def _decay(barrier: str, age: timedelta) -> float:
        half = HALF_LIFE_DAYS.get(barrier)
        if half is None:
            return 1.0
        return 0.5 ** (max(0.0, age.total_seconds() / 86400.0) / half)

    def _latest_per_reporter(self, edge_id: str, barrier: str,
                             now: datetime) -> List[Evidence]:
        latest: Dict[str, Evidence] = {}
        for ev in self._ev.get((edge_id, barrier), []):
            if ev.time > now:
                continue
            cur = latest.get(ev.reporter)
            if cur is None or ev.time > cur.time:
                latest[ev.reporter] = ev
        return list(latest.values())

    def belief(self, edge_id: str, barrier: str, now: datetime) -> float:
        edge = self.city.edges[edge_id]
        prior = self.map_prior if barrier in edge.baseline else self.base_prior
        score = logit(prior)
        for ev in self._latest_per_reporter(edge_id, barrier, now):
            sign = 1.0 if ev.present else -1.0
            score += sign * self.llr * ev.weight * self._decay(barrier, now - ev.time)
        return sigmoid(score)

    def beliefs_for_edge(self, edge_id: str, now: datetime) -> Dict[str, float]:
        candidates = set(self.city.edges[edge_id].baseline) | self._by_edge.get(edge_id, set())
        return {b: self.belief(edge_id, b, now) for b in candidates}

    def describe_support(self, edge_id: str, barrier: str, now: datetime) -> str:
        parts: List[str] = []
        if barrier in self.city.edges[edge_id].baseline:
            parts.append("map survey")
        evs = self._latest_per_reporter(edge_id, barrier, now)
        pos = [e for e in evs if e.present]
        neg = [e for e in evs if not e.present]
        if pos:
            latest = max(e.time for e in pos)
            n = len(pos)
            parts.append(f"{n} report{'s' if n > 1 else ''}, latest {_ago(now - latest)}")
        if neg:
            parts.append(f"{len(neg)} 'cleared' report{'s' if len(neg) > 1 else ''}")
        return "; ".join(parts) or "no evidence"

    def timeline(self, edge_id: str, barrier: str, start: datetime,
                 hours: List[float]) -> List[Tuple[float, float]]:
        """Belief at start + h hours: shows how reports age out."""
        return [(h, self.belief(edge_id, barrier, start + timedelta(hours=h)))
                for h in hours]
