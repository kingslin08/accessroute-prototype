import json
import os
import sys
import unittest
from datetime import datetime, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from accessroute import (PROFILES, EvidenceStore, RouteWatcher, SimulatedDetector,
                         ascii_map, build_demo_city, describe_route,
                         detections_to_evidence, find_route, naive_route, poi_card,
                         route_summary, route_to_dict, update_poi)
from accessroute.routing import BLOCK_T, UNCERTAIN_T

T0 = datetime(2026, 9, 29, 9, 0)


def fresh():
    city = build_demo_city(now=T0)
    return city, EvidenceStore(city), city.node_at(0, 0), city.node_at(8, 8)


class BaselineTests(unittest.TestCase):
    def test_static_attributes_become_barriers(self):
        city, *_ = fresh()
        stairs = city.edge_between(city.node_at(2, 2), city.node_at(3, 3))
        self.assertIn("stairs", stairs.baseline)
        hill = city.edge_between(city.node_at(5, 5), city.node_at(6, 6))
        self.assertEqual({"steep_slope", "broken_surface"}, set(hill.baseline))
        no_ramp = city.edge_between(city.node_at(2, 3), city.node_at(2, 4))
        self.assertIn("missing_curb_ramp", no_ramp.baseline)
        narrow = city.edge_between(city.node_at(4, 5), city.node_at(5, 5))
        self.assertIn("narrow_path", narrow.baseline)


class FusionTests(unittest.TestCase):
    def setUp(self):
        self.city, self.store, self.S, self.G = fresh()
        self.edge = city_edge(self.city, 4, 0, 5, 0)

    def test_single_report_is_uncertain_not_blocking(self):
        self.store.crowd_report(self.edge.id, "construction", T0, "u1", 0.8, 0.8)
        p = self.store.belief(self.edge.id, "construction", T0)
        self.assertTrue(UNCERTAIN_T <= p < BLOCK_T, p)

    def test_corroboration_reaches_block_threshold(self):
        self.store.crowd_report(self.edge.id, "construction", T0, "u1", 0.8, 0.8)
        self.store.crowd_report(self.edge.id, "construction", T0, "u2", 0.8, 0.8)
        self.assertGreaterEqual(self.store.belief(self.edge.id, "construction", T0), BLOCK_T)

    def test_same_reporter_counts_once(self):
        for k in range(20):
            self.store.crowd_report(self.edge.id, "construction",
                                    T0 + timedelta(minutes=k), "spammer", 0.8, 0.8)
        p = self.store.belief(self.edge.id, "construction", T0 + timedelta(hours=1))
        self.assertLess(p, BLOCK_T)

    def test_temporary_obstacles_decay_fast_roadworks_slowly(self):
        for k in range(2):
            self.store.crowd_report(self.edge.id, "blocked_path", T0, f"u{k}", 0.8, 0.9)
            self.store.crowd_report(self.edge.id, "construction", T0, f"u{k}", 0.8, 0.9)
        later = T0 + timedelta(days=2)
        self.assertLess(self.store.belief(self.edge.id, "blocked_path", later), 0.1)
        self.assertGreater(self.store.belief(self.edge.id, "construction", later), 0.5)

    def test_cleared_reports_lower_map_belief(self):
        stairs = city_edge(self.city, 2, 2, 3, 3)
        before = self.store.belief(stairs.id, "stairs", T0)
        for k in range(2):
            self.store.crowd_report(stairs.id, "stairs", T0, f"v{k}", 0.9, 0.9, present=False)
        self.assertLess(self.store.belief(stairs.id, "stairs", T0), before - 0.5)

    def test_future_evidence_ignored_and_bad_ids_rejected(self):
        self.store.crowd_report(self.edge.id, "construction", T0 + timedelta(days=1), "u", 0.9, 0.9)
        self.assertLess(self.store.belief(self.edge.id, "construction", T0), UNCERTAIN_T)
        with self.assertRaises(KeyError):
            self.store.crowd_report("nope", "construction", T0, "u")
        with self.assertRaises(KeyError):
            self.store.crowd_report(self.edge.id, "lava", T0, "u")


def build_route_via(city, store, profile_key, nodes):
    from accessroute.routing import build_route
    return build_route(city, store, PROFILES[profile_key], nodes, T0)


def city_edge(city, i1, j1, i2, j2):
    return city.edge_between(city.node_at(i1, j1), city.node_at(i2, j2))


class RoutingTests(unittest.TestCase):
    def setUp(self):
        self.city, self.store, self.S, self.G = fresh()

    def test_naive_route_is_a_trap_for_wheelchairs(self):
        chair = PROFILES["wheelchair"]
        naive = naive_route(self.city, self.store, chair, self.S, self.G, T0)
        kinds = {i.barrier for i in naive.blocking_issues}
        self.assertTrue({"stairs", "steep_slope"} <= kinds)

    def test_wheelchair_route_avoids_all_blockers(self):
        chair = PROFILES["wheelchair"]
        r = find_route(self.city, self.store, chair, self.S, self.G, T0)
        self.assertTrue(r.fully_accessible)
        self.assertEqual([], r.blocking_issues)
        naive = naive_route(self.city, self.store, chair, self.S, self.G, T0)
        self.assertGreater(r.distance_m, naive.distance_m)  # accessible route is longer
        self.assertNotEqual(naive.signature, r.signature)

    def test_standard_user_takes_the_shortcuts(self):
        std = PROFILES["standard"]
        r = find_route(self.city, self.store, std, self.S, self.G, T0)
        naive = naive_route(self.city, self.store, std, self.S, self.G, T0)
        self.assertAlmostEqual(r.distance_m, naive.distance_m)

    def test_low_vision_avoids_crossings_without_tactile_paving(self):
        r = find_route(self.city, self.store, PROFILES["low_vision"], self.S, self.G, T0)
        for e in r.edges:
            self.assertNotIn("no_tactile_paving", e.baseline)

    def test_elderly_and_injured_avoid_stairs_when_a_detour_exists(self):
        for key in ("elderly", "injured"):
            r = find_route(self.city, self.store, PROFILES[key], self.S, self.G, T0)
            self.assertFalse(any(e.steps for e in r.edges), key)

    def test_confirmed_block_forces_reroute_around_edge(self):
        M = self.city.pois["market"].node
        chair = PROFILES["wheelchair"]
        before = find_route(self.city, self.store, chair, self.S, M, T0)
        self.assertAlmostEqual(before.distance_m, 400.0)
        target = city_edge(self.city, 4, 0, 5, 0)
        for k in range(2):
            self.store.crowd_report(target.id, "construction", T0, f"u{k}", 0.8, 0.8)
        after = find_route(self.city, self.store, chair, self.S, M, T0)
        self.assertNotIn(target.id, after.signature)
        self.assertAlmostEqual(after.distance_m, 500.0)

    def test_best_effort_when_goal_is_walled_off(self):
        chair = PROFILES["wheelchair"]
        for e in self.city.adj[self.G]:
            for k in range(2):
                self.store.crowd_report(e.id, "construction", T0, f"u{k}", 0.9, 0.9)
        r = find_route(self.city, self.store, chair, self.S, self.G, T0)
        self.assertEqual("best_effort", r.status)
        self.assertFalse(r.fully_accessible)
        self.assertTrue(r.blocking_issues)
        self.assertIn("NO fully accessible route", route_summary(r, chair.label))
        self.assertIsNone(find_route(self.city, self.store, chair, self.S, self.G, T0,
                                     best_effort=False))

    def test_same_start_and_goal(self):
        r = find_route(self.city, self.store, PROFILES["wheelchair"], self.S, self.S, T0)
        self.assertEqual(0.0, r.distance_m)


class VisionTests(unittest.TestCase):
    def setUp(self):
        self.city, self.store, *_ = fresh()

    def frame(self, x, y, label, conf=0.9, source="cam:1"):
        return {"frame_id": "f1", "source": source, "x": x, "y": y,
                "detections": [{"label": label, "conf": conf}]}

    def test_detection_is_matched_to_nearest_edge(self):
        det = SimulatedDetector().detect(self.frame(225, 3, "construction_barrier"))
        evs, rej = detections_to_evidence(self.city, det, T0)
        self.assertEqual([], rej)
        self.assertEqual(city_edge(self.city, 4, 0, 5, 0).id, evs[0].edge_id)
        self.assertEqual("construction", evs[0].barrier)
        self.assertEqual("vision", evs[0].source)

    def test_far_and_unknown_detections_are_rejected_with_reason(self):
        dets = (SimulatedDetector().detect(self.frame(900, 900, "pothole"))
                + SimulatedDetector().detect(self.frame(225, 0, "unicorn")))
        evs, rej = detections_to_evidence(self.city, dets, T0)
        self.assertEqual([], evs)
        self.assertEqual(2, len(rej))
        self.assertTrue(all(reason for _, reason in rej))

    def test_seeing_a_ramp_disproves_missing_ramp(self):
        edge = city_edge(self.city, 2, 3, 2, 4)
        x, y = self.city.midpoint(edge)
        before = self.store.belief(edge.id, "missing_curb_ramp", T0)
        for k in range(2):
            dets = SimulatedDetector().detect(self.frame(x, y, "curb_ramp", 0.95, f"cam:{k}"))
            evs, _ = detections_to_evidence(self.city, dets, T0, trust=0.8)
            self.store.add_many(evs)
        self.assertLess(self.store.belief(edge.id, "missing_curb_ramp", T0), before - 0.5)


class WatcherTests(unittest.TestCase):
    def setUp(self):
        self.city, self.store, self.S, _ = fresh()
        self.M = self.city.pois["market"].node
        self.w = RouteWatcher(self.city, self.store)
        self.w.subscribe("asha", "wheelchair", self.S, self.M, T0)
        self.target = city_edge(self.city, 4, 0, 5, 0)

    def test_no_alert_without_new_evidence(self):
        self.assertEqual([], self.w.check(T0))

    def test_unverified_report_gives_info_alert_with_detour(self):
        self.store.crowd_report(self.target.id, "construction", T0, "u1", 0.8, 0.8)
        alerts = self.w.check(T0)
        self.assertEqual(1, len(alerts))
        self.assertEqual("info", alerts[0].level)
        self.assertIn("Unverified", alerts[0].message)
        self.assertNotIn(self.target.id, alerts[0].new_route.signature)

    def test_two_simultaneous_reports_give_warning(self):
        for k in range(2):
            self.store.crowd_report(self.target.id, "construction", T0, f"u{k}", 0.8, 0.8)
        alerts = self.w.check(T0)
        self.assertEqual("warning", alerts[0].level)
        self.assertIn("confirmed", alerts[0].message)

    def test_no_repeat_alert_once_route_already_avoids_edge(self):
        self.store.crowd_report(self.target.id, "construction", T0, "u1", 0.8, 0.8)
        self.w.check(T0)
        self.store.crowd_report(self.target.id, "construction", T0, "u2", 0.8, 0.8)
        self.assertEqual([], self.w.check(T0))

    def test_clearing_the_barrier_offers_the_shorter_route_back(self):
        for k in range(2):
            self.store.crowd_report(self.target.id, "construction", T0, f"u{k}", 0.8, 0.8)
        self.w.check(T0)
        later = T0 + timedelta(days=1)
        for k in range(2):
            self.store.crowd_report(self.target.id, "construction", later, f"c{k}", 0.9, 0.9,
                                    present=False)
        alerts = self.w.check(later)
        self.assertEqual(1, len(alerts))
        self.assertIn("better route", alerts[0].message)
        self.assertAlmostEqual(400.0, alerts[0].new_route.distance_m)


class CommsTests(unittest.TestCase):
    def setUp(self):
        self.city, self.store, self.S, self.G = fresh()

    def test_directions_cover_full_distance_and_edges_exactly_once(self):
        r = find_route(self.city, self.store, PROFILES["wheelchair"], self.S, self.G, T0)
        steps = describe_route(r, self.city, self.store, T0)
        self.assertAlmostEqual(r.distance_m, sum(s["distance_m"] for s in steps))
        ids = [i for s in steps for i in s["edge_ids"]]
        self.assertEqual([e.id for e in r.edges], ids)
        self.assertTrue(steps[0]["text"].startswith("Head "))

    def test_warnings_are_attached_to_the_right_step(self):
        M = self.city.pois["market"].node
        # Steer the elderly route through a known-rough edge by making detours costlier.
        rough = city_edge(self.city, 1, 1, 2, 1)
        r = build_route_via(self.city, self.store, "elderly", [self.city.node_at(1, 1),
                                                                self.city.node_at(2, 1)])
        steps = describe_route(r, self.city, self.store, T0)
        self.assertEqual(1, len(steps))
        self.assertTrue(any("Broken or uneven surface" in w for w in steps[0]["warnings"]))
        self.assertEqual([rough.id], steps[0]["edge_ids"])
        # a 'standard' user is not warned about it
        r2 = build_route_via(self.city, self.store, "standard", [self.city.node_at(1, 1),
                                                                  self.city.node_at(2, 1)])
        self.assertEqual([], describe_route(r2, self.city, self.store, T0)[0]["warnings"])

    def test_json_payload_round_trips(self):
        r = find_route(self.city, self.store, PROFILES["wheelchair"], self.S, self.G, T0)
        payload = json.loads(json.dumps(route_to_dict(r, self.city, self.store, T0)))
        self.assertTrue(payload["fully_accessible"])
        self.assertGreater(len(payload["steps"]), 0)

    def test_poi_cards(self):
        clinic = poi_card(self.city.pois["clinic"], "wheelchair", T0)
        self.assertEqual("accessible", clinic["verdict"])
        lib = poi_card(self.city.pois["library"], "wheelchair", T0)
        self.assertEqual("not_accessible", lib["verdict"])
        self.assertEqual("low", lib["confidence"])  # verified 400 days ago
        update_poi(self.city, "library", T0, ramp=True)
        lib2 = poi_card(self.city.pois["library"], "wheelchair", T0)
        self.assertEqual("accessible", lib2["verdict"])
        self.assertEqual("high", lib2["confidence"])
        pharm = poi_card(self.city.pois["pharmacy"], "wheelchair", T0)
        self.assertEqual("not_accessible", pharm["verdict"])
        with self.assertRaises(AttributeError):
            update_poi(self.city, "library", T0, colour="red")

    def test_ascii_map_renders(self):
        r = find_route(self.city, self.store, PROFILES["wheelchair"], self.S, self.G, T0)
        text = ascii_map(self.city, self.store, "wheelchair", T0, r)
        self.assertIn("S", text)
        self.assertIn("G", text)
        self.assertIn("#", text)
        self.assertIn("*", text)


if __name__ == "__main__":
    unittest.main(verbosity=2)
