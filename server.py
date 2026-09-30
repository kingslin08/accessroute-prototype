"""AccessRoute web server: serves the front end and a small JSON API.

Run:   py server.py            (Windows)   or   python3 server.py
Then open http://localhost:8000

Uses only the Python standard library, so there is nothing extra to install.
"""
from __future__ import annotations

import json
import math
import mimetypes
import os
import sys
import threading
import webbrowser
from datetime import datetime, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from accessroute import (EvidenceStore, RouteWatcher, SimulatedDetector,
                         build_demo_city, detections_to_evidence, find_route,
                         naive_route, poi_card, route_summary, route_to_dict,
                         update_poi)
from accessroute.model import BARRIERS, HALF_LIFE_DAYS, PROFILES
from accessroute.routing import BLOCK_T, UNCERTAIN_T, assess_edge
from accessroute.vision import LABEL_MAP

WEB_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "web")
T0 = datetime(2026, 9, 29, 9, 0)  # the simulated clock starts here

# Simulated contributors: (display name, trust). Same person = one vote.
REPORTERS = {
    "guest": ("Guest", 0.5),
    "neha": ("Neha", 0.7),
    "imran": ("Imran", 0.7),
    "asha": ("Asha (verified volunteer)", 0.9),
}
CAMERAS = ["Bus 12 camera", "Bus 47 camera", "Delivery robot 3"]
LABEL_TEXT = {
    "staircase": "Staircase", "stairs": "Stairs", "pothole": "Pothole",
    "cracked_pavement": "Cracked pavement", "traffic_cone": "Traffic cone",
    "construction_barrier": "Construction barrier",
    "parked_vehicle": "Vehicle parked on the footpath",
    "scooter_pile": "Pile of scooters", "vendor_stall": "Vendor stall",
    "kerb_no_ramp": "Kerb with no ramp", "curb_ramp": "Curb ramp (ramp is there)",
    "tactile_paving": "Tactile paving (it is there)", "narrow_footpath": "Narrow footpath",
}


class ApiError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


class World:
    """All mutable demo state, guarded by one lock."""

    def __init__(self) -> None:
        self.lock = threading.RLock()
        self.reset()

    def reset(self) -> None:
        self.city = build_demo_city(now=T0)
        self.store = EvidenceStore(self.city)
        self.now = T0
        self.watcher = RouteWatcher(self.city, self.store)
        self.feed: list = []
        self._seq = 0
        self.log("system", "Demo started. Every barrier so far comes from the base map survey.")

    # ------------------------------------------------------------ helpers
    def log(self, kind: str, text: str, level: str = "info") -> None:
        self._seq += 1
        self.feed.append({"id": self._seq, "time": self.now.strftime("%H:%M"),
                          "kind": kind, "level": level, "text": text})
        del self.feed[:-80]

    def clock(self) -> dict:
        return {"iso": self.now.isoformat(), "label": self.now.strftime("%a %d %b, %H:%M")}

    def recent_feed(self) -> list:
        return self.feed[::-1][:40]

    def _street(self, edge_id: str) -> str:
        return self.city.edges[edge_id].name or edge_id

    def _issue(self, i) -> dict:
        return {"edge": i.edge_id, "barrier": i.barrier, "label": BARRIERS[i.barrier],
                "belief": round(i.belief, 3), "blocking": i.blocking,
                "uncertain": i.uncertain, "detail": i.detail,
                "street": self._street(i.edge_id)}

    def _profile(self, key: str):
        if key not in PROFILES:
            raise ApiError(f"unknown profile '{key}'")
        return PROFILES[key]

    def _node(self, value) -> int:
        try:
            n = int(value)
        except (TypeError, ValueError):
            raise ApiError("start and goal must be node ids")
        if n not in self.city.nodes:
            raise ApiError(f"unknown place {n}")
        return n

    def node_label(self, node_id: int) -> str:
        node = self.city.nodes[node_id]
        if node.name:
            return node.name
        names = []
        for e in self.city.adj[node_id]:
            if e.kind == "sidewalk" and e.name not in names:
                names.append(e.name)
        return " & ".join(sorted(names)) or f"Junction {node_id}"

    def after_change(self) -> dict:
        """Ask the watcher whether saved routes are affected and log alerts."""
        alerts = []
        for a in self.watcher.check(self.now):
            alerts.append({"level": a.level, "message": a.message})
            self.log("alert", a.message, "warning" if a.level != "info" else "info")
        return {"alerts": alerts, "clock": self.clock(), "feed": self.recent_feed()}

    # ---------------------------------------------------------- endpoints
    def bootstrap(self, _q=None) -> dict:
        c = self.city
        return {
            "size": c.spacing * (c.cols - 1),
            "nodes": [{"id": n.id, "x": n.x, "y": n.y, "label": self.node_label(n.id)}
                      for n in c.nodes.values()],
            "edges": [{"id": e.id, "a": e.a, "b": e.b, "kind": e.kind, "name": e.name,
                       "length": round(e.length, 1)} for e in c.edges.values()],
            "pois": [{"id": p.id, "name": p.name, "node": p.node} for p in c.pois.values()],
            "profiles": [{"key": p.key, "label": p.label} for p in PROFILES.values()],
            "barriers": [{"key": k, "label": v, "half_life_days": HALF_LIFE_DAYS[k]}
                         for k, v in BARRIERS.items()],
            "reporters": [{"id": k, "name": v[0], "trust": v[1]} for k, v in REPORTERS.items()],
            "cameras": CAMERAS,
            "vision_labels": [{"key": k, "text": LABEL_TEXT.get(k, k), "barrier": b, "present": p}
                              for k, (b, p) in LABEL_MAP.items()],
            "defaults": {"start": c.pois["metro"].node, "goal": c.pois["clinic"].node},
            "clock": self.clock(), "feed": self.recent_feed(),
        }

    def route(self, q) -> dict:
        prof = self._profile(q.get("profile", ["wheelchair"])[0])
        start = self._node(q.get("start", [None])[0])
        goal = self._node(q.get("goal", [None])[0])
        r = find_route(self.city, self.store, prof, start, goal, self.now)
        if r is None:
            raise ApiError("no route between these places", 404)
        nv = naive_route(self.city, self.store, prof, start, goal, self.now)
        # Re-subscribe so alerts always describe the route the user is looking at.
        self.watcher.subs = []
        self.watcher.subscribe("you", prof.key, start, goal, self.now)

        payload = route_to_dict(r, self.city, self.store, self.now)
        payload["nodes"] = r.nodes
        payload["summary"] = route_summary(r, prof.label, nv)
        payload["blocking"] = len(r.blocking_issues)
        payload["unverified"] = len(r.uncertain_issues)
        naive = {
            "nodes": nv.nodes,
            "distance_m": round(nv.distance_m, 1),
            "minutes": round(nv.minutes, 1),
            "differs": nv.signature != r.signature,
            "blocking": len(nv.blocking_issues),
            "issues": [self._issue(i) for i in nv.issues],
        }
        return {"profile": prof.key, "profile_label": prof.label, "route": payload,
                "naive": naive, "edge_status": self.edge_status(prof),
                "clock": self.clock()}

    def edge_status(self, prof) -> dict:
        out = {}
        for e in self.city.edges.values():
            a = assess_edge(e, prof, self.store, self.now)
            if a.blocked:
                state = "blocked"
            elif any(i.uncertain for i in a.issues):
                state = "uncertain"
            elif a.issues:
                state = "caution"
            else:
                state = "ok"
            out[e.id] = {"state": state, "issues": [self._issue(i) for i in a.issues]}
        return out

    def edge(self, q) -> dict:
        eid = q.get("id", [""])[0]
        if eid not in self.city.edges:
            raise ApiError("unknown street segment", 404)
        prof = self._profile(q.get("profile", ["wheelchair"])[0])
        e = self.city.edges[eid]
        beliefs = self.store.beliefs_for_edge(eid, self.now)
        hours = list(range(0, 73, 6))
        items = []
        for b, p in sorted(beliefs.items(), key=lambda kv: -kv[1]):
            m = prof.multiplier(b)
            if math.isinf(m):
                impact, impact_text = "blocks", f"A hard stop for {prof.label.lower()}"
            elif m > 1.0:
                impact, impact_text = "slows", f"Makes this stretch about {m:g} times harder for you"
            else:
                impact, impact_text = "none", "Does not affect your route"
            n_ev = len(self.store._ev.get((eid, b), []))
            items.append({
                "barrier": b, "label": BARRIERS[b], "belief": round(p, 3),
                "state": ("confirmed" if p >= BLOCK_T else
                          "unverified" if p >= UNCERTAIN_T else "unlikely"),
                "support": self.store.describe_support(eid, b, self.now),
                "from_map": b in e.baseline, "detail": e.baseline.get(b, ""),
                "impact": impact, "impact_text": impact_text,
                "half_life_days": HALF_LIFE_DAYS[b], "evidence_count": n_ev,
                "forecast": ([[h, round(v, 3)] for h, v in
                              self.store.timeline(eid, b, self.now, hours)]
                             if n_ev and HALF_LIFE_DAYS[b] is not None else []),
            })
        return {"edge": {"id": e.id, "name": e.name, "kind": e.kind, "length": round(e.length, 1),
                         "slope_pct": e.slope_pct, "width_m": e.width_m, "steps": e.steps,
                         "surface": e.surface},
                "barriers": items}

    def places(self, q) -> dict:
        key = q.get("profile", ["wheelchair"])[0]
        self._profile(key)
        cards = []
        for p in self.city.pois.values():
            card = poi_card(p, key, self.now)
            card.update({"id": p.id, "node": p.node, "entrance_steps": p.entrance_steps,
                         "ramp": p.ramp, "door_width_m": p.door_width_m,
                         "automatic_door": p.automatic_door})
            cards.append(card)
        return {"places": cards}

    # ---- mutations (POST)
    def report(self, body) -> dict:
        eid, barrier = body.get("edge_id"), body.get("barrier")
        if eid not in self.city.edges:
            raise ApiError("choose a street segment first")
        if barrier not in BARRIERS:
            raise ApiError("choose what kind of barrier it is")
        who = REPORTERS.get(body.get("reporter", "guest"))
        if who is None:
            raise ApiError("unknown reporter")
        present = bool(body.get("present", True))
        conf = max(0.05, min(1.0, float(body.get("confidence", 0.8))))
        before = self.store.belief(eid, barrier, self.now)
        self.store.crowd_report(eid, barrier, self.now, body.get("reporter", "guest"),
                                trust=who[1], confidence=conf, present=present,
                                ref="web-report")
        after = self.store.belief(eid, barrier, self.now)
        verb = "reported" if present else "says it is gone:"
        self.log("report", f"{who[0]} {verb} {BARRIERS[barrier].lower()} on "
                           f"{self._street(eid)}. Confidence {before:.0%} to {after:.0%}.")
        out = self.after_change()
        out["result"] = {"before": before, "after": after}
        return out

    def vision(self, body) -> dict:
        label = body.get("label")
        if label not in LABEL_MAP:
            raise ApiError("unknown detection label")
        cam = body.get("source") or CAMERAS[0]
        conf = max(0.05, min(1.0, float(body.get("confidence", 0.85))))
        if body.get("offmap"):
            x, y = 900.0, 900.0
        else:
            eid = body.get("edge_id")
            if eid not in self.city.edges:
                raise ApiError("choose a street segment first")
            x, y = self.city.midpoint(self.city.edges[eid])
            x, y = x + 2.0, y + 1.0  # a little GPS noise
        frame = {"frame_id": f"frame_{self._seq + 1:04d}", "source": cam, "x": x, "y": y,
                 "detections": [{"label": label, "conf": conf}]}
        dets = SimulatedDetector().detect(frame)
        evs, rejected = detections_to_evidence(self.city, dets, self.now)
        accepted = []
        for ev in evs:
            before = self.store.belief(ev.edge_id, ev.barrier, self.now)
            self.store.add(ev)
            after = self.store.belief(ev.edge_id, ev.barrier, self.now)
            accepted.append({"edge": ev.edge_id, "street": self._street(ev.edge_id),
                             "barrier": ev.barrier, "present": ev.present,
                             "before": before, "after": after})
            what = LABEL_TEXT.get(label, label).lower()
            self.log("camera", f"{cam} saw {what} ({conf:.0%} sure) and matched it to "
                               f"{self._street(ev.edge_id)}. Confidence {before:.0%} to {after:.0%}.")
        for d, reason in rejected:
            self.log("camera", f"{cam} saw {LABEL_TEXT.get(d.label, d.label).lower()} but the "
                               f"frame was discarded: {reason}.", "warning")
        out = self.after_change()
        out["result"] = {"accepted": accepted,
                         "rejected": [{"label": d.label, "reason": r} for d, r in rejected]}
        return out

    def advance(self, body) -> dict:
        hours = float(body.get("hours", 1))
        if not 0 < hours <= 24 * 30:
            raise ApiError("hours must be between 0 and 720")
        self.now += timedelta(hours=hours)
        label = f"{hours:g} hour{'s' if hours != 1 else ''}" if hours < 24 else f"{hours / 24:g} day{'s' if hours != 24 else ''}"
        self.log("time", f"Clock moved forward {label}. Old reports lose weight; nothing else changed.")
        return self.after_change()

    def poi_update(self, body) -> dict:
        pid = body.get("id")
        if pid not in self.city.pois:
            raise ApiError("unknown place", 404)
        fields = {}
        if "entrance_steps" in body:
            fields["entrance_steps"] = max(0, int(body["entrance_steps"]))
        if "ramp" in body:
            fields["ramp"] = bool(body["ramp"])
        if "door_width_m" in body:
            fields["door_width_m"] = max(0.3, min(3.0, float(body["door_width_m"])))
        if "automatic_door" in body:
            fields["automatic_door"] = bool(body["automatic_door"])
        p = update_poi(self.city, pid, self.now, **fields)
        self.log("report", f"Entrance details for {p.name} were updated and re-verified.")
        return {"clock": self.clock(), "feed": self.recent_feed(), "alerts": []}

    def do_reset(self, _body=None) -> dict:
        self.reset()
        return {"clock": self.clock(), "feed": self.recent_feed(), "alerts": []}


WORLD = World()
GET_ROUTES = {"bootstrap": WORLD.bootstrap, "route": WORLD.route, "edge": WORLD.edge,
              "places": WORLD.places}
POST_ROUTES = {"report": WORLD.report, "vision": WORLD.vision, "time": WORLD.advance,
               "poi": WORLD.poi_update, "reset": WORLD.do_reset}


class Handler(BaseHTTPRequestHandler):
    server_version = "AccessRoute/1.0"

    def log_message(self, fmt, *args):  # quieter console
        if "/api/" in (args[0] if args else ""):
            return
        sys.stderr.write("  %s\n" % (fmt % args))

    def _send(self, status: int, body: bytes, ctype: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _json(self, status: int, data) -> None:
        self._send(status, json.dumps(data).encode("utf-8"), "application/json; charset=utf-8")

    def _handle_api(self, table, name, arg) -> None:
        fn = table.get(name)
        if fn is None:
            return self._json(404, {"error": "unknown endpoint"})
        try:
            with WORLD.lock:
                self._json(200, fn(arg))
        except ApiError as e:
            self._json(e.status, {"error": str(e)})
        except (KeyError, ValueError, TypeError) as e:
            self._json(400, {"error": f"bad request: {e}"})

    def do_GET(self):
        url = urlparse(self.path)
        if url.path.startswith("/api/"):
            return self._handle_api(GET_ROUTES, url.path[5:], parse_qs(url.query))
        rel = "index.html" if url.path in ("", "/") else url.path.lstrip("/")
        full = os.path.realpath(os.path.join(WEB_DIR, rel))
        if not full.startswith(os.path.realpath(WEB_DIR) + os.sep) or not os.path.isfile(full):
            return self._send(404, b"Not found", "text/plain; charset=utf-8")
        ctype = mimetypes.guess_type(full)[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype in ("application/javascript", "application/json"):
            ctype += "; charset=utf-8"
        with open(full, "rb") as f:
            self._send(200, f.read(), ctype)

    def do_POST(self):
        url = urlparse(self.path)
        if not url.path.startswith("/api/"):
            return self._json(404, {"error": "not found"})
        try:
            length = int(self.headers.get("Content-Length") or 0)
            body = json.loads(self.rfile.read(length) or b"{}")
        except (ValueError, json.JSONDecodeError):
            return self._json(400, {"error": "body must be JSON"})
        self._handle_api(POST_ROUTES, url.path[5:], body)


def make_server(port: int = 8000) -> ThreadingHTTPServer:
    return ThreadingHTTPServer(("127.0.0.1", port), Handler)


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    server = make_server(port)
    url = f"http://localhost:{port}"
    print(f"\n  AccessRoute is running at {url}\n  Press Ctrl+C to stop.\n")
    threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Stopped.")


if __name__ == "__main__":
    main()
