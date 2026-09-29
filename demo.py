"""End-to-end demo: detect -> update -> communicate.  Run: python3 demo.py"""
import json
from datetime import datetime, timedelta

from accessroute import (PROFILES, EvidenceStore, RouteWatcher, SimulatedDetector,
                         ascii_map, build_demo_city, describe_route,
                         detections_to_evidence, find_route, naive_route, poi_card,
                         route_summary, route_to_dict, update_poi)

T0 = datetime(2026, 9, 29, 9, 0)


def h(title):
    print("\n" + "=" * 78 + f"\n{title}\n" + "=" * 78)


def show_steps(route, city, store, now):
    for k, s in enumerate(describe_route(route, city, store, now), 1):
        print(f" {k:>2}. {s['text']}")
        for w in s["warnings"]:
            print(f"      ! {w}")


def main():
    city = build_demo_city(now=T0)
    store = EvidenceStore(city)
    S, G = city.node_at(0, 0), city.node_at(8, 8)
    chair = PROFILES["wheelchair"]

    h("1. Why distance-only navigation fails")
    naive = naive_route(city, store, chair, S, G, T0)
    print(f"'Shortest' route: {naive.distance_m:.0f} m, "
          f"{len(naive.blocking_issues)} barriers that BLOCK a wheelchair user:")
    for i in naive.blocking_issues:
        print(f"   - {city.edges[i.edge_id].name}: {i.barrier} ({i.detail})")
    r = find_route(city, store, chair, S, G, T0)
    print("\n" + route_summary(r, chair.label, naive))

    h("2. Same trip, five different users (barrier knowledge from map survey only)")
    for key, prof in PROFILES.items():
        rt = find_route(city, store, prof, S, G, T0)
        nv = naive_route(city, store, prof, S, G, T0)
        cx = next(e for e in rt.edges if e.kind == "crossing")
        col = round(city.midpoint(cx)[0] / city.spacing)
        print("-", route_summary(rt, prof.label, nv), f"Crosses Main Road at column {col}.")
    print("\nWheelchair turn-by-turn:")
    show_steps(r, city, store, T0)

    h("3. Live updates: a crowd report, then camera frames, change saved routes")
    # New trip along one corridor, so a blocked block forces a visible detour.
    M = city.pois["market"].node
    watcher = RouteWatcher(city, store)
    base = watcher.subscribe("asha", "wheelchair", S, M, T0)
    watcher.subscribe("ravi", "low_vision", S, M, T0)
    print(f"Metro Station -> Riverside Market: {base.distance_m:.0f} m straight along Station Rd.")
    target = city.edge_between(city.node_at(4, 0), city.node_at(5, 0))
    x, y = city.midpoint(target)

    now = T0 + timedelta(hours=1)
    store.crowd_report(target.id, "construction", now, "user:101", trust=0.8,
                       confidence=0.8, ref="photo_5521.jpg")
    print(f"\n[{now:%H:%M}] user:101 photographs construction on {target.name} ({target.id}). "
          f"belief = {store.belief(target.id, 'construction', now):.0%}")
    for a in watcher.check(now):
        print(f"   ALERT ({a.level}) to {a.user}: {a.message}")

    now = T0 + timedelta(hours=3)
    frames = [{"frame_id": "bus12_f0871", "source": "cam:bus12", "x": x + 3, "y": y + 2,
               "detections": [{"label": "construction_barrier", "conf": 0.9},
                              {"label": "unicorn", "conf": 0.9}]},
              {"frame_id": "far_f001", "source": "cam:bus12", "x": 900, "y": 900,
               "detections": [{"label": "pothole", "conf": 0.9}]}]
    dets = [d for f in frames for d in SimulatedDetector().detect(f)]
    evs, rejected = detections_to_evidence(city, dets, now)
    store.add_many(evs)
    print(f"\n[{now:%H:%M}] camera bus12: {len(dets)} detections -> {len(evs)} accepted, "
          f"{len(rejected)} rejected {[(d.label, why) for d, why in rejected]}")
    print(f"   belief = {store.belief(target.id, 'construction', now):.0%} "
          f"({store.describe_support(target.id, 'construction', now)})")
    alerts = watcher.check(now)
    for a in alerts:
        print(f"   ALERT ({a.level}) to {a.user}: {a.message}")
    if not alerts:
        print("   (no new alert: saved routes already avoid this block; no need to nag)")

    h("4. Confirmed obstacle downstream, then information ages out")
    blk = city.edge_between(city.node_at(6, 0), city.node_at(7, 0))
    now = T0 + timedelta(hours=4)
    for k in range(2):
        store.crowd_report(blk.id, "blocked_path", now, f"user:20{k}", trust=0.8, confidence=0.9)
    print(f"[{now:%H:%M}] two users report parked scooters blocking {blk.name} ({blk.id})")
    for a in watcher.check(now):
        print(f"   ALERT ({a.level}) to {a.user}: {a.message}")
    r_now = find_route(city, store, chair, S, M, now)
    print("\n" + ascii_map(city, store, "wheelchair", now, r_now))
    print("\nBelief in 'blocked_path' as time passes with no new reports (half-life 12 h):")
    for hrs, b in store.timeline(blk.id, "blocked_path", now, [0, 6, 12, 24, 48]):
        print(f"   +{hrs:>3.0f} h : {b:.0%}")
    later = T0 + timedelta(days=2)
    print(f"Construction belief 2 days on: {store.belief(target.id, 'construction', later):.0%} "
          f"(half-life 45 days, so it lingers)")
    for k in range(2):
        store.crowd_report(target.id, "construction", later, f"user:33{k}", trust=0.9,
                           confidence=0.9, present=False)
    print(f"After two trusted 'cleared' reports: {store.belief(target.id, 'construction', later):.0%}")
    for a in watcher.check(later):
        print(f"   ALERT ({a.level}) to {a.user}: {a.message}")

    h("5. Accessibility of places (entrances), with freshness")
    for pid in ("clinic", "library", "pharmacy"):
        print(json.dumps(poi_card(city.pois[pid], "wheelchair", T0)))
    update_poi(city, "library", T0, ramp=True, entrance_steps=6)
    print("After a volunteer reports a new ramp at the library:")
    print(json.dumps(poi_card(city.pois["library"], "wheelchair", T0)))

    h("6. API payload for an app or voice assistant (first 2 steps)")
    final = find_route(city, store, chair, S, M, later)
    payload = route_to_dict(final, city, store, later)
    payload["steps"] = payload["steps"][:2]
    print(json.dumps(payload, indent=2))


if __name__ == "__main__":
    main()
