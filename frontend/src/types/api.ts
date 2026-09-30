export interface Node {
  id: number;
  x: number;
  y: number;
  label: string;
}

export interface Edge {
  id: string;
  a: number;
  b: number;
  kind: 'sidewalk' | 'crossing' | 'path';
  name: string;
  length: number;
}

export interface Poi {
  id: string;
  name: string;
  node: number;
}

export interface Profile {
  key: string;
  label: string;
}

export interface Barrier {
  key: string;
  label: string;
  half_life_days: number | null;
}

export interface Reporter {
  id: string;
  name: string;
  trust: number;
}

export interface VisionLabel {
  key: string;
  text: string;
  barrier: string;
  present: boolean;
}

export interface Clock {
  iso: string;
  label: string;
}

export interface LiveFeedItem {
  id: number;
  time: string;
  kind: 'report' | 'camera' | 'alert' | 'time' | 'system';
  level: 'info' | 'warning';
  text: string;
}

export interface BootstrapData {
  size: number;
  nodes: Node[];
  edges: Edge[];
  pois: Poi[];
  profiles: Profile[];
  barriers: Barrier[];
  reporters: Reporter[];
  cameras: string[];
  vision_labels: VisionLabel[];
  defaults: {
    start: number;
    goal: number;
  };
  clock: Clock;
  feed: LiveFeedItem[];
}

export interface RouteStep {
  verb: string;
  heading: string;
  street: string;
  distance_m: number;
  warnings: string[];
  edge_ids: string[];
  text: string;
}

export interface Issue {
  edge: string;
  barrier: string;
  label: string;
  belief: number;
  blocking: boolean;
  uncertain: boolean;
  detail: string;
  street: string;
}

export interface RouteData {
  profile: string;
  status: 'ok' | 'best_effort';
  fully_accessible: boolean;
  distance_m: number;
  minutes: number;
  steps: RouteStep[];
  issues: Issue[];
  nodes: number[];
  summary: string;
  blocking: number;
  unverified: number;
}

export interface NaiveData {
  nodes: number[];
  distance_m: number;
  minutes: number;
  differs: boolean;
  blocking: number;
  issues: Issue[];
}

export interface EdgeStatus {
  state: 'ok' | 'caution' | 'uncertain' | 'blocked';
  issues: Issue[];
}

export interface RouteResponse {
  profile: string;
  profile_label: string;
  route: RouteData;
  naive: NaiveData;
  edge_status: Record<string, EdgeStatus>;
  clock: Clock;
}

export interface BarrierForecast {
  barrier: string;
  label: string;
  belief: number;
  state: 'confirmed' | 'unverified' | 'unlikely';
  support: string;
  from_map: boolean;
  detail: string;
  impact: 'blocks' | 'slows' | 'none';
  impact_text: string;
  half_life_days: number | null;
  evidence_count: number;
  forecast: [number, number][]; // [hour, belief]
}

export interface EdgeDetail {
  edge: {
    id: string;
    name: string;
    kind: string;
    length: number;
    slope_pct: number;
    width_m: number;
    steps: number;
    surface: string;
  };
  barriers: BarrierForecast[];
}

export interface PlaceCard {
  id: string;
  poi: string;
  profile: string;
  verdict: 'accessible' | 'partial' | 'not_accessible';
  reasons: string[];
  last_verified_days_ago: number | null;
  confidence: 'high' | 'low';
  node: number;
  entrance_steps: number;
  ramp: boolean;
  door_width_m: number;
  automatic_door: boolean;
}

export interface AlertItem {
  level: 'info' | 'warning' | 'critical';
  message: string;
}

export interface MutationResult {
  alerts: AlertItem[];
  clock: Clock;
  feed: LiveFeedItem[];
  result?: any;
}
