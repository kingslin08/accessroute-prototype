"""Communication layer: how accessibility information reaches the user.

* describe_route  - screen-reader friendly turn-by-turn with barrier warnings
* route_summary   - one-paragraph verdict, incl. what a distance-only map would do
* route_to_dict   - JSON payload for an app / voice assistant
* RouteWatcher    - re-checks saved routes when new evidence arrives and alerts
* poi_card        - entrance accessibility verdict with freshness/confidence
* ascii_map       - quick visual of barriers and the chosen route
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime
from typing import Dict, List, Optional

from .city import City
from .evidence import EvidenceStore
from .model import BARRIERS, PROFILES, Poi
from .routing import BLOCK_T, Issue, Route, assess_edge, build_route, find_route

_COMPASS = ["east", "northeast", "north", "northwest", "west", "southwest", "south", "southeast"]


def _heading(dx: float, dy: float) -> float:
    return math.degrees(math.atan2(dy, dx))


def _compass(h: float) -> str:
    return _COMPASS[int(((h + 22.5) % 360) // 45)]


def _turn(prev_h: float, h: float) -> str:
    d = (h - prev_h + 180) % 360 - 180
    a = abs(d)
    side = "left" if d > 0 else "right"
    if a < 25:
        return "Continue straight"
    if a < 60:
        return f"Bear {side}"
    if a < 135:
        return f"Turn {side}"
    if a < 170:
        return f"Turn sharply {side}"
    return "Turn around"


def issue_text(issue: Issue, store: EvidenceStore, now: datetime) -> str:
    label = BARRIERS[issue.barrier]
    detail = f" ({issue.detail})" if issue.detail else ""
    support = store.describe_support(issue.edge_id, issue.barrier, now)
    if issue.blocking:
        lead = "BLOCKED"
    elif issue.uncertain:
        lead = "Possible, unverified"
    else:
        lead = "Caution"
    return f"{lead}: {label}{detail} [{support}; confidence {issue.belief:.0%}]"


def describe_route(route: Route, city: City, store: EvidenceStore,
                   now: datetime) -> List[dict]:
    """Turn-by-turn steps; consecutive clean segments are merged."""
    steps: List[dict] = []
    prev_h: Optional[float] = None
    for a, b, edge in zip(route.nodes, route.nodes[1:], route.edges):
        na, nb = city.nodes[a], city.nodes[b]
        h = _heading(nb.x - na.x, nb.y - na.y)
        prof = PROFILES[route.profile_key]
        ass = assess_edge(edge, prof, store, now)
        warnings = [issue_text(i, store, now) for i in ass.issues]
        can_merge = bool(
            steps and not warnings and not steps[-1]["warnings"]
            and prev_h is not None and abs((h - prev_h + 180) % 360 - 180) < 25
            and steps[-1]["kind"] == edge.kind)
        if can_merge:
            steps[-1]["distance_m"] += edge.length
            steps[-1]["edge_ids"].append(edge.id)
            steps[-1]["text"] = _step_text(steps[-1])
        else:
            verb = f"Head {_compass(h)}" if prev_h is None else _turn(prev_h, h)
            step = dict(verb=verb, heading=_compass(h), kind=edge.kind,
                        street=edge.name, distance_m=edge.length,
                        warnings=warnings, edge_ids=[edge.id])
            step["text"] = _step_text(step)
            steps.append(step)
        prev_h = h
    return steps


def _step_text(step: dict) -> str:
    street = step["street"]
    if step["kind"] == "crossing":
        where = f"{step['verb']} and use the {street}"
    else:
        where = f"{step['verb']} on {street}"
    return f"{where} for {step['distance_m']:.0f} m"


def route_summary(route: Route, profile_label: str, naive: Optional[Route] = None) -> str:
    if route.status == "best_effort":
        head = (f"{profile_label}: NO fully accessible route found. Least-bad route is "
                f"{route.distance_m:.0f} m with {len(route.blocking_issues)} blocking barrier(s).")
    else:
        head = (f"{profile_label}: {route.distance_m:.0f} m, about {route.minutes:.0f} min, "
                f"no known blocking barriers.")
        if route.uncertain_issues:
            head += f" {len(route.uncertain_issues)} unverified warning(s) to watch."
    if naive is not None and naive.signature != route.signature:
        n_block, n_all = len(naive.blocking_issues), len(naive.issues)
        head += (f" The shortest path ({naive.distance_m:.0f} m) would expose this user to "
                 f"{n_all} barrier(s) ({n_block} blocking); the accessible route costs "
                 f"{route.distance_m - naive.distance_m:+.0f} m.")
    return head


def route_to_dict(route: Route, city: City, store: EvidenceStore, now: datetime) -> dict:
    return {
        "profile": route.profile_key,
        "status": route.status,
        "fully_accessible": route.fully_accessible,
        "distance_m": round(route.distance_m, 1),
        "minutes": round(route.minutes, 1),
        "steps": [{k: (round(v, 1) if isinstance(v, float) else v)
                   for k, v in s.items() if k != "kind"}
                  for s in describe_route(route, city, store, now)],
        "issues": [{"edge": i.edge_id, "barrier": i.barrier, "belief": round(i.belief, 2),
                    "blocking": i.blocking, "uncertain": i.uncertain, "detail": i.detail}
                   for i in route.issues],
    }


# ---------------------------------------------------------------- watcher
@dataclass
class Alert:
    user: str
    level: str  # info | warning | critical
    message: str
    new_route: Optional[Route]


@dataclass
class _Sub:
    user: str
    profile_key: str
    start: int
    goal: int
    route: Route


class RouteWatcher:
    """Keeps saved routes fresh: when evidence changes, re-assess each route
    and push an alert only if something material changed for that user."""

    def __init__(self, city: City, store: EvidenceStore):
        self.city, self.store = city, store
        self.subs: List[_Sub] = []
        self._seen = store.version

    def subscribe(self, user: str, profile_key: str, start: int, goal: int,
                  now: datetime) -> Optional[Route]:
        r = find_route(self.city, self.store, PROFILES[profile_key], start, goal, now)
        if r:
            self.subs.append(_Sub(user, profile_key, start, goal, r))
        self._seen = self.store.version
        return r

    def check(self, now: datetime) -> List[Alert]:
        if self.store.version == self._seen:
            return []
        self._seen = self.store.version
        alerts: List[Alert] = []
        for s in self.subs:
            prof = PROFILES[s.profile_key]
            old = build_route(self.city, self.store, prof, s.route.nodes, now)
            new = find_route(self.city, self.store, prof, s.start, s.goal, now)
            if new is None:
                alerts.append(Alert(s.user, "critical", "No route to your destination exists.", None))
                continue
            changed = new.signature != old.signature
            # An issue is "fresh" if the user hasn't been told about it yet, or if a
            # previously unverified one has since become confirmed.
            seen = {(i.edge_id, i.barrier): i.belief >= BLOCK_T for i in s.route.issues}
            fresh = [i for i in old.issues
                     if (i.edge_id, i.barrier) not in seen
                     or (i.belief >= BLOCK_T and not seen[(i.edge_id, i.barrier)])]
            delta = new.distance_m - old.distance_m
            extra = ("same length as your previous route" if abs(delta) < 1
                     else f"{delta:+.0f} m vs your previous route")
            msg, level = None, "info"
            if fresh and changed:
                i = max(fresh, key=lambda i: (i.blocking, i.belief))
                street = self.city.edges[i.edge_id].name
                if i.belief >= BLOCK_T:
                    msg, level = (f"Route updated: {BARRIERS[i.barrier].lower()} confirmed on "
                                  f"{street} ({issue_text(i, self.store, now)}). "
                                  f"New route is {new.distance_m:.0f} m ({extra}).", "warning")
                else:
                    msg = (f"Unverified report of {BARRIERS[i.barrier].lower()} on {street}. "
                           f"Routed around it as a precaution ({extra}).")
            elif changed and new.effort_m < old.effort_m * 0.9:
                msg = (f"A better route is now available (an earlier barrier was cleared): "
                       f"{new.distance_m:.0f} m ({extra}).")
            if msg:
                alerts.append(Alert(s.user, level, msg, new))
                s.route = new
        return alerts


# ------------------------------------------------------------------- POIs
def update_poi(city: City, poi_id: str, when: datetime, **fields) -> Poi:
    poi = city.pois[poi_id]
    for k, v in fields.items():
        if not hasattr(poi, k):
            raise AttributeError(k)
        setattr(poi, k, v)
    poi.verified = when
    return poi


def poi_card(poi: Poi, profile_key: str, now: datetime, stale_after_days: int = 180) -> dict:
    step_ok = {"wheelchair": 0, "elderly": 2, "low_vision": 4, "injured": 3, "standard": 99}[profile_key]
    reasons: List[str] = []
    verdict = "accessible"
    if poi.entrance_steps > step_ok and not poi.ramp:
        verdict = "not_accessible"
        reasons.append(f"{poi.entrance_steps} entrance step(s), no ramp")
    elif poi.entrance_steps > 0 and poi.ramp:
        reasons.append(f"{poi.entrance_steps} step(s) but a ramp is available")
    if profile_key == "wheelchair" and poi.door_width_m < 0.85:
        verdict = "not_accessible"
        reasons.append(f"door only {poi.door_width_m:.2f} m wide")
    elif poi.door_width_m < 0.85 and verdict == "accessible":
        verdict = "partial"
        reasons.append(f"narrow door ({poi.door_width_m:.2f} m)")
    if poi.automatic_door:
        reasons.append("automatic door")
    age = (now - poi.verified).days if poi.verified else None
    stale = age is None or age > stale_after_days
    if stale:
        reasons.append("information is out of date; please re-verify")
    return {"poi": poi.name, "profile": profile_key, "verdict": verdict,
            "reasons": reasons, "last_verified_days_ago": age,
            "confidence": "low" if stale else "high"}


# --------------------------------------------------------------- ASCII map
def ascii_map(city: City, store: EvidenceStore, profile_key: str, now: datetime,
              route: Optional[Route] = None) -> str:
    n, rows = city.cols, city.rows
    prof = PROFILES[profile_key]
    W, H = 4 * (n - 1) + 1, 2 * (rows - 1) + 1
    grid = [[" "] * W for _ in range(H)]
    on_route = set(route.signature) if route else set()

    def mark(e, default: str) -> str:
        ass = assess_edge(e, prof, store, now)
        if ass.blocked:
            return "#"
        if e.id in on_route:
            return "*"
        return "~" if ass.issues else default

    for e in city.edges.values():
        a, b = city.nodes[e.a], city.nodes[e.b]
        ai, aj = int(round(a.x / city.spacing)), int(round(a.y / city.spacing))
        bi, bj = int(round(b.x / city.spacing)), int(round(b.y / city.spacing))
        if aj == bj:  # horizontal
            r, c0 = 2 * (rows - 1 - aj), 4 * min(ai, bi)
            for c in range(c0 + 1, c0 + 4):
                grid[r][c] = mark(e, "-")
        elif ai == bi:  # vertical
            r, c = 2 * (rows - 1 - max(aj, bj)) + 1, 4 * ai
            grid[r][c] = mark(e, ":" if e.kind == "crossing" else "|")
        else:  # diagonal shortcut
            lo = a if a.y < b.y else b
            hi = b if lo is a else a
            r = 2 * (rows - 1 - int(round(hi.y / city.spacing))) + 1
            c = 4 * int(round(min(a.x, b.x) / city.spacing)) + 2
            grid[r][c] = mark(e, "/" if hi.x > lo.x else "\\")
    for nid, node in city.nodes.items():
        i, j = int(round(node.x / city.spacing)), int(round(node.y / city.spacing))
        grid[2 * (rows - 1 - j)][4 * i] = "+"
    if route:
        s, g = route.nodes[0], route.nodes[-1]
        for nid, ch in ((s, "S"), (g, "G")):
            node = city.nodes[nid]
            grid[2 * (rows - 1 - int(round(node.y / city.spacing)))][4 * int(round(node.x / city.spacing))] = ch
    legend = "S/G start/goal   * route   # blocked for this profile   ~ caution   : crossing   / diagonal shortcut"
    return "\n".join("".join(r) for r in grid) + "\n" + legend
