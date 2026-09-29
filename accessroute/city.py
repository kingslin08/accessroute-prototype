"""A small graph/geospatial layer plus a hand-built simulated demo city."""
from __future__ import annotations

import math
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple

from .model import Edge, Node, Poi


def point_segment_distance(px, py, ax, ay, bx, by) -> float:
    dx, dy = bx - ax, by - ay
    seg2 = dx * dx + dy * dy
    if seg2 == 0:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / seg2))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


class City:
    def __init__(self, cols: int = 0, rows: int = 0, spacing: float = 0.0):
        self.cols, self.rows, self.spacing = cols, rows, spacing
        self.nodes: Dict[int, Node] = {}
        self.edges: Dict[str, Edge] = {}
        self.adj: Dict[int, List[Edge]] = {}
        self.pois: Dict[str, Poi] = {}

    # -- construction ------------------------------------------------------
    def add_node(self, node_id: int, x: float, y: float, name: str = "") -> Node:
        n = Node(node_id, x, y, name)
        self.nodes[node_id] = n
        self.adj.setdefault(node_id, [])
        return n

    def add_edge(self, a: int, b: int, **attrs) -> Edge:
        if "length" not in attrs:
            na, nb = self.nodes[a], self.nodes[b]
            attrs["length"] = math.hypot(na.x - nb.x, na.y - nb.y)
        eid = f"{min(a, b)}-{max(a, b)}"
        e = Edge(id=eid, a=a, b=b, **attrs)
        self.edges[eid] = e
        self.adj[a].append(e)
        self.adj[b].append(e)
        return e

    # -- lookups -----------------------------------------------------------
    def node_at(self, i: int, j: int) -> int:
        return j * self.cols + i

    def edge_between(self, a: int, b: int) -> Edge:
        return self.edges[f"{min(a, b)}-{max(a, b)}"]

    def nearest_edge(self, x: float, y: float, max_dist: float = 12.0
                     ) -> Optional[Tuple[Edge, float]]:
        """Geospatial match: the edge closest to a point (e.g. a photo's GPS)."""
        best: Optional[Tuple[Edge, float]] = None
        for e in self.edges.values():
            a, b = self.nodes[e.a], self.nodes[e.b]
            d = point_segment_distance(x, y, a.x, a.y, b.x, b.y)
            if best is None or d < best[1]:
                best = (e, d)
        return best if best and best[1] <= max_dist else None

    def midpoint(self, edge: Edge) -> Tuple[float, float]:
        a, b = self.nodes[edge.a], self.nodes[edge.b]
        return (a.x + b.x) / 2, (a.y + b.y) / 2


def build_demo_city(n: int = 9, spacing: float = 50.0,
                    now: Optional[datetime] = None) -> City:
    """A 9x9 street grid with realistic accessibility problems baked in.

    Origin (0,0) is a metro station, (8,8) a health centre. Two diagonal
    'shortcuts' (park stairs, a gravel hill path) make the *shortest* route
    inaccessible for many users: exactly the failure the challenge describes.
    """
    now = now or datetime(2026, 9, 29, 9, 0)
    city = City(n, n, spacing)
    for j in range(n):
        for i in range(n):
            city.add_node(j * n + i, i * spacing, j * spacing)

    streets = ["Station Rd", "Mill Lane", "Park St", "Market St", "Main Road",
               "Church St", "Lake Rd", "School Lane", "Clinic Rd"]
    avenues = ["Elm Ave", "Oak Ave", "Pine Ave", "Cedar Ave", "Birch Ave",
               "Maple Ave", "Ash Ave", "Willow Ave", "Fir Ave"]
    nid = city.node_at

    # Special attributes keyed by node-pair coordinates ((i,j),(i,j)).
    special = {
        ((1, 1), (2, 1)): dict(surface="broken"),
        ((5, 7), (6, 7)): dict(surface="broken"),
        ((4, 5), (5, 5)): dict(width_m=0.7),
        ((7, 4), (7, 5)): dict(slope_pct=9.0),
        ((2, 3), (2, 4)): dict(curb_ramp=False),   # crossing without a ramp
        ((6, 3), (6, 4)): dict(tactile=False),     # crossing without tactile paving
        ((8, 3), (8, 4)): dict(tactile=False),
    }
    for j in range(n):
        for i in range(n):
            if i + 1 < n:
                attrs = special.get(((i, j), (i + 1, j)), {})
                city.add_edge(nid(i, j), nid(i + 1, j), name=streets[j], **attrs)
            if j + 1 < n:
                attrs = dict(special.get(((i, j), (i, j + 1)), {}))
                if j == 3:  # the Main Road crossing, one per avenue
                    city.add_edge(nid(i, j), nid(i, j + 1), kind="crossing",
                                  name="Main Road crossing", **attrs)
                else:
                    city.add_edge(nid(i, j), nid(i, j + 1), name=avenues[i], **attrs)

    # Diagonal shortcuts that look great on a distance-only map.
    city.add_edge(nid(2, 2), nid(3, 3), kind="path", name="Park stairs",
                  steps=14, width_m=1.5)
    city.add_edge(nid(5, 5), nid(6, 6), kind="path", name="Hill path",
                  slope_pct=11.0, surface="broken", width_m=1.2)

    city.nodes[nid(0, 0)].name = "Metro Station"
    city.nodes[nid(8, 8)].name = "Community Health Centre"

    city.pois = {
        "metro": Poi("metro", "Metro Station", nid(0, 0), 0, False, 1.2, True, True,
                     now - timedelta(days=10)),
        "clinic": Poi("clinic", "Community Health Centre", nid(8, 8), 3, True, 1.0,
                      False, True, now - timedelta(days=30)),
        "library": Poi("library", "City Library", nid(3, 6), 6, False, 0.9,
                       False, False, now - timedelta(days=400)),
        "market": Poi("market", "Riverside Market", nid(8, 0), 0, False, 1.4, True,
                      False, now - timedelta(days=20)),
        "pharmacy": Poi("pharmacy", "Corner Pharmacy", nid(6, 2), 1, False, 0.75,
                        False, False, now - timedelta(days=60)),
    }
    return city
