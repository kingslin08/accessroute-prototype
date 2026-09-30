import type {
  BootstrapData,
  RouteResponse,
  EdgeDetail,
  PlaceCard,
  MutationResult,
} from '../types/api';

const API_BASE = '/api';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!res.ok) {
    let errorMsg = `Server error (${res.status})`;
    try {
      const err = await res.json();
      errorMsg = err.detail || err.error || errorMsg;
    } catch {
      // ignore json parse error
    }
    throw new Error(errorMsg);
  }

  return res.json();
}

export const api = {
  getBootstrap: (): Promise<BootstrapData> => {
    return fetchJson<BootstrapData>('/bootstrap');
  },

  getRoute: (profile: string, start: number, goal: number): Promise<RouteResponse> => {
    return fetchJson<RouteResponse>(`/route?profile=${encodeURIComponent(profile)}&start=${start}&goal=${goal}`);
  },

  getEdge: (edgeId: string, profile: string): Promise<EdgeDetail> => {
    return fetchJson<EdgeDetail>(`/edge?id=${encodeURIComponent(edgeId)}&profile=${encodeURIComponent(profile)}`);
  },

  getPlaces: (profile: string): Promise<{ places: PlaceCard[] }> => {
    return fetchJson<{ places: PlaceCard[] }>(`/places?profile=${encodeURIComponent(profile)}`);
  },

  submitReport: (body: {
    edge_id: string;
    barrier: string;
    reporter: string;
    confidence: number;
    present: boolean;
  }): Promise<MutationResult> => {
    return fetchJson<MutationResult>('/report', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  submitVision: (body: {
    label: string;
    edge_id?: string;
    offmap?: boolean;
    source?: string;
    confidence: number;
  }): Promise<MutationResult> => {
    return fetchJson<MutationResult>('/vision', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  advanceTime: (hours: number): Promise<MutationResult> => {
    return fetchJson<MutationResult>('/time', {
      method: 'POST',
      body: JSON.stringify({ hours }),
    });
  },

  updatePoi: (body: {
    id: string;
    entrance_steps?: number;
    ramp?: boolean;
    door_width_m?: number;
    automatic_door?: boolean;
  }): Promise<MutationResult> => {
    return fetchJson<MutationResult>('/poi', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  resetDemo: (): Promise<MutationResult> => {
    return fetchJson<MutationResult>('/reset', {
      method: 'POST',
    });
  },
};
