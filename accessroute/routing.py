"""Accessibility-aware routing.

Edge cost = length x product of per-barrier multipliers, weighted by belief.
  * hard-block barriers (multiplier INF) block the edge once belief >= 0.60
  * between 0.25 and 0.60 the edge is 'uncertain': a steep soft penalty
    steers routes away but flags the warning as unverified
  * finite multipliers apply as expected cost: 1 + belief * (m - 1)
If no fully accessible route exists we return a clearly-labelled
'best_effort' route with the blockers listed, rather than silently failing.
"""
from __future__ import annotations

import heapq
import math
from dataclasses import dataclass, field
from datetime import datetime
from typing import Callable, Dict, List, Optional

from .city import City
from .evidence import EvidenceStore
from .model import INF, Edge, Profile

BLOCK_T = 0.60
UNCERTAIN_T = 0.25
IGNORE_T = 0.15
UNCERTAIN_PENALTY = 20.0
BEST_EFFORT_PENALTY = 100.0


@dataclass
class Issue:
    edge_id: str
    barrier: str
    belief: float
    blocking: bool
    uncertain: bool
    detail: str = ""


@dataclass
class EdgeAssessment:
    cost: float
    blocked: bool
    issues: List[Issue]


@dataclass
class Route:
    profile_key: str
    nodes: List[int]
    edges: List[Edge]
    distance_m: float
    effort_m: float
    minutes: float
    issues: List[Issue]
    status: str = "ok"  # ok | best_effort

    @property
    def signature(self) -> tuple:
        return tuple(e.id for e in self.edges)

    @property
    def blocking_issues(self) -> List[Issue]:
        return [i for i in self.issues if i.blocking]

    @property
    def uncertain_issues(self) -> List[Issue]:
        return [i for i in self.issues if i.uncertain and not i.blocking]

    @property
    def fully_accessible(self) -> bool:
        return self.status == "ok" and not self.blocking_issues


def assess_edge(edge: Edge, profile: Profile, store: EvidenceStore,
                now: datetime) -> EdgeAssessment:
    mult, blocked, issues = 1.0, False, []
    for barrier, p in store.beliefs_for_edge(edge.id, now).items():
        if p < IGNORE_T:
            continue
        m = profile.multiplier(barrier)
        if m <= 1.0:
            continue
        detail = edge.baseline.get(barrier, "")
        if math.isinf(m):
            if p >= BLOCK_T:
                blocked = True
                issues.append(Issue(edge.id, barrier, p, True, False, detail))
            elif p >= UNCERTAIN_T:
                mult *= 1.0 + UNCERTAIN_PENALTY * p
                issues.append(Issue(edge.id, barrier, p, False, True, detail))
        else:
            mult *= 1.0 + p * (m - 1.0)
            if p >= UNCERTAIN_T:
                issues.append(Issue(edge.id, barrier, p, False, p < BLOCK_T, detail))
    return EdgeAssessment(edge.length * mult, blocked, issues)


def _dijkstra(city: City, start: int, goal: int,
              cost: Callable[[Edge], float]) -> Optional[List[int]]:
    dist = {start: 0.0}
    prev: Dict[int, int] = {}
    heap = [(0.0, start)]
    while heap:
        d, u = heapq.heappop(heap)
        if u == goal:
            break
        if d > dist.get(u, INF):
            continue
        for e in city.adj[u]:
            c = cost(e)
            if math.isinf(c):
                continue
            v = e.other(u)
            nd = d + c
            if nd < dist.get(v, INF):
                dist[v] = nd
                prev[v] = u
                heapq.heappush(heap, (nd, v))
    if goal not in dist:
        return None
    path = [goal]
    while path[-1] != start:
        path.append(prev[path[-1]])
    return path[::-1]


def build_route(city: City, store: EvidenceStore, profile: Profile,
                nodes: List[int], now: datetime, status: str = "ok") -> Route:
    """Assess a given node path for a profile (also used on the naive route)."""
    edges = [city.edge_between(a, b) for a, b in zip(nodes, nodes[1:])]
    dist = effort = 0.0
    issues: List[Issue] = []
    for e in edges:
        a = assess_edge(e, profile, store, now)
        dist += e.length
        effort += a.cost
        issues.extend(a.issues)
    return Route(profile.key, nodes, edges, dist, effort,
                 dist / profile.speed_mps / 60.0, issues, status)


def naive_route(city: City, store: EvidenceStore, profile: Profile,
                start: int, goal: int, now: datetime) -> Optional[Route]:
    """What a conventional 'shortest distance' map would suggest,
    assessed against what this user would actually face on it."""
    path = _dijkstra(city, start, goal, lambda e: e.length)
    return build_route(city, store, profile, path, now, "naive") if path else None


def find_route(city: City, store: EvidenceStore, profile: Profile,
               start: int, goal: int, now: datetime,
               best_effort: bool = True) -> Optional[Route]:
    if start == goal:
        return build_route(city, store, profile, [start], now)
    cache: Dict[str, EdgeAssessment] = {}

    def assessed(e: Edge) -> EdgeAssessment:
        if e.id not in cache:
            cache[e.id] = assess_edge(e, profile, store, now)
        return cache[e.id]

    path = _dijkstra(city, start, goal,
                     lambda e: INF if assessed(e).blocked else assessed(e).cost)
    status = "ok"
    if path is None and best_effort:
        path = _dijkstra(city, start, goal,
                         lambda e: assessed(e).cost * (BEST_EFFORT_PENALTY if assessed(e).blocked else 1.0))
        status = "best_effort"
    if path is None:
        return None
    return build_route(city, store, profile, path, now, status)
