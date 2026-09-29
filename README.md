# AccessRoute: detecting, updating and communicating real-world accessibility barriers

Prototype for **VH-S03**. A route that is "500 m away" can be impossible for a
wheelchair user. This system treats accessibility as *live, uncertain
information*, not a static map layer. Pure Python 3.8+ standard library, no
network and no GPU needed.

## Run it

```bash
python3 demo.py                            # end-to-end walkthrough (6 scenes)
python3 -m unittest discover -s tests -v   # 28 tests
```

## How it maps to the challenge

| Challenge asks for | Where | What it does |
|---|---|---|
| **Detect** barriers | `model.py`, `vision.py` | Static attributes (steps, gradient, width, kerb ramp, surface) become barrier claims. Object detections from photo/video frames (`staircase`, `pothole`, `traffic_cone`, `curb_ramp`...) are geo-matched to the nearest footpath and become evidence. A detected *ramp* disproves a "no ramp" claim. |
| **Update** it | `evidence.py` | Each (footpath, barrier) has a belief 0-1 from log-odds fusion of reports weighted by reporter trust x confidence, with **per-barrier time decay** (scooters: 12 h half-life, roadworks: 45 days, stairs: never). "Cleared" reports lower belief. One vote per reporter stops spam. |
| **Generate accessibility-aware routes** | `routing.py` | Dijkstra whose edge cost depends on the user profile (wheelchair, older adult, visually impaired, crutches, standard). Confirmed barriers block hard-block profiles; unverified ones (25-60% belief) are soft-avoided and flagged. If nothing accessible exists you get a labelled `best_effort` route listing the blockers. |
| **Communicate** it | `comms.py` | Screen-reader-friendly turn-by-turn with per-step warnings and evidence ("2 reports, latest 3 h ago; confidence 80%"); a comparison against the shortest path; JSON payload; `RouteWatcher` alerts (info / warning / critical) when new evidence changes a saved route, including "better route available" when a barrier is cleared; place cards for entrances with a freshness/confidence flag. |

## Design choices

* **Uncertainty is first-class.** One unverified report causes a cautious detour and an `info` alert; corroboration (or a camera) confirms it and the wording escalates to `warning`. Once a route already avoids an edge, further reports do not re-alert.
* **Barriers mean different things to different people.** The same crossing without tactile paving is irrelevant to a wheelchair user and a 4x cost for a blind user (`PROFILES` in `model.py`).
* **Information goes stale.** Decay means a report from last week about parked scooters stops influencing routes without anyone having to clear it.

## Swapping in real components

* **Computer vision:** implement `Detector.detect(frame)` in `vision.py` with a YOLO/DETR model and feed it GPS-tagged frames. The rest of the pipeline is unchanged.
* **Maps:** replace `build_demo_city()` with OpenStreetMap ways (`incline`, `surface`, `kerb`, `tactile_paving`, `wheelchair=*` tags map directly onto `Edge`).
* **Storage/API:** `EvidenceStore` is in-memory; back it with a database and expose `route_to_dict` over HTTP.

## Limitations (honest list)

* The city, reports and camera frames are **simulated**; the vision detector is a stub, so no real image model was run or evaluated.
* Model parameters (multipliers, thresholds, log-likelihood ratio 3.0, half-lives) are reasonable defaults, not calibrated on real data.
* Grid geometry: slopes are given per edge, not derived from elevation data; no opening hours, lifts or crossing signal timing.
