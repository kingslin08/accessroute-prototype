import React, { useState, useEffect, useCallback } from 'react';
import { api } from './api/client';
import type {
  BootstrapData,
  RouteResponse,
  EdgeDetail,
  PlaceCard,
  AlertItem,
} from './types/api';
import { Navbar } from './components/Navbar';
import { ProfileSelector } from './components/ProfileSelector';
import { RoutePlanner } from './components/RoutePlanner';
import { InteractiveMap } from './components/InteractiveMap';
import { RouteComparison } from './components/RouteComparison';
import { TurnByTurn } from './components/TurnByTurn';
import { StreetInspector } from './components/StreetInspector';
import { SimulationHub } from './components/SimulationHub';
import { PlacesView } from './components/PlacesView';
import { LiveFeed } from './components/LiveFeed';
import { AlertTriangle, Compass, Sparkles, Navigation } from 'lucide-react';

export const App: React.FC = () => {
  // State
  const [boot, setBoot] = useState<BootstrapData | null>(null);
  const [profile, setProfile] = useState<string>('wheelchair');
  const [startNode, setStartNode] = useState<number>(0);
  const [goalNode, setGoalNode] = useState<number>(80);
  const [routeData, setRouteData] = useState<RouteResponse | null>(null);
  const [places, setPlaces] = useState<PlaceCard[]>([]);
  const [selectedEdgeDetail, setSelectedEdgeDetail] = useState<EdgeDetail | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'route' | 'places' | 'simulate'>('route');
  const [pickingMode, setPickingMode] = useState<'start' | 'goal' | null>(null);
  const [showNaiveRoute, setShowNaiveRoute] = useState<boolean>(true);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Initial bootstrap
  useEffect(() => {
    const loadBootstrap = async () => {
      try {
        setLoading(true);
        const data = await api.getBootstrap();
        setBoot(data);
        setStartNode(data.defaults.start);
        setGoalNode(data.defaults.goal);
        setLoading(false);
      } catch (err: any) {
        setErrorMessage(err.message || 'Failed to connect to AccessRoute backend.');
        setLoading(false);
      }
    };
    loadBootstrap();
  }, []);

  // Fetch route & places when profile or endpoints change
  const refreshRouteAndPlaces = useCallback(async () => {
    if (!boot) return;
    try {
      const [rRes, pRes] = await Promise.all([
        api.getRoute(profile, startNode, goalNode),
        api.getPlaces(profile),
      ]);
      setRouteData(rRes);
      setPlaces(pRes.places);
    } catch (err: any) {
      console.error('Route error:', err);
    }
  }, [boot, profile, startNode, goalNode]);

  useEffect(() => {
    if (boot) {
      refreshRouteAndPlaces();
    }
  }, [boot, profile, startNode, goalNode, refreshRouteAndPlaces]);

  // Edge inspection
  const handleSelectEdge = async (edgeId: string) => {
    setSelectedEdgeId(edgeId);
    try {
      const detail = await api.getEdge(edgeId, profile);
      setSelectedEdgeDetail(detail);
    } catch (err: any) {
      console.error('Edge inspect error:', err);
    }
  };

  // Node click on map (supports picking mode)
  const handleNodeClick = (nodeId: number) => {
    if (pickingMode === 'start') {
      setStartNode(nodeId);
      setPickingMode(null);
    } else if (pickingMode === 'goal') {
      setGoalNode(nodeId);
      setPickingMode(null);
    } else {
      // If clicking a node normally, set as goal if different from start
      if (nodeId !== startNode) {
        setGoalNode(nodeId);
      }
    }
  };

  // Actions
  const handleSwap = () => {
    setStartNode(goalNode);
    setGoalNode(startNode);
  };

  const handleAdvanceTime = async (hours: number) => {
    try {
      setLoading(true);
      const res = await api.advanceTime(hours);
      if (boot) {
        setBoot({ ...boot, clock: res.clock, feed: res.feed });
      }
      if (res.alerts && res.alerts.length > 0) {
        setAlerts((prev) => [...res.alerts, ...prev]);
      }
      await refreshRouteAndPlaces();
      if (selectedEdgeId) {
        await handleSelectEdge(selectedEdgeId);
      }
    } catch (err: any) {
      alert(`Error advancing time: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleResetDemo = async () => {
    try {
      setLoading(true);
      const res = await api.resetDemo();
      if (boot) {
        setBoot({ ...boot, clock: res.clock, feed: res.feed });
      }
      setAlerts([]);
      setSelectedEdgeDetail(null);
      setSelectedEdgeId(null);
      await refreshRouteAndPlaces();
    } catch (err: any) {
      alert(`Error resetting demo: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitReport = async (data: {
    edge_id: string;
    barrier: string;
    reporter: string;
    confidence: number;
    present: boolean;
  }) => {
    const res = await api.submitReport(data);
    if (boot) {
      setBoot({ ...boot, feed: res.feed, clock: res.clock });
    }
    if (res.alerts && res.alerts.length > 0) {
      setAlerts((prev) => [...res.alerts, ...prev]);
    }
    await refreshRouteAndPlaces();
    if (selectedEdgeId) {
      await handleSelectEdge(selectedEdgeId);
    }
    return res;
  };

  const handleSubmitVision = async (data: {
    label: string;
    edge_id?: string;
    offmap?: boolean;
    source?: string;
    confidence: number;
  }) => {
    const res = await api.submitVision(data);
    if (boot) {
      setBoot({ ...boot, feed: res.feed, clock: res.clock });
    }
    if (res.alerts && res.alerts.length > 0) {
      setAlerts((prev) => [...res.alerts, ...prev]);
    }
    await refreshRouteAndPlaces();
    if (selectedEdgeId) {
      await handleSelectEdge(selectedEdgeId);
    }
    return res;
  };

  const handleUpdatePoi = async (data: any) => {
    const res = await api.updatePoi(data);
    if (boot) {
      setBoot({ ...boot, feed: res.feed, clock: res.clock });
    }
    await refreshRouteAndPlaces();
    return res;
  };

  if (errorMessage) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-rose-800/80 rounded-2xl p-6 max-w-md w-full text-center flex flex-col items-center gap-3 shadow-2xl">
          <AlertTriangle className="w-10 h-10 text-rose-400" />
          <h2 className="text-lg font-bold text-white">Connection Error</h2>
          <p className="text-xs text-slate-300 leading-relaxed">{errorMessage}</p>
          <p className="text-[11px] text-slate-500">
            Please ensure the FastAPI backend is running on <code>http://127.0.0.1:8000</code>.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 px-4 py-2 bg-amber-400 text-slate-950 font-bold rounded-xl text-xs hover:bg-amber-300 transition"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-atkinson">
      {/* Top Navigation */}
      <Navbar
        clock={boot ? boot.clock : null}
        onAdvanceTime={handleAdvanceTime}
        onResetDemo={handleResetDemo}
        loading={loading}
        activeAlertCount={alerts.length}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-4 flex flex-col gap-4">
        {/* Profile Switcher */}
        {boot && (
          <ProfileSelector
            profiles={boot.profiles}
            selectedProfile={profile}
            onSelectProfile={setProfile}
            loading={loading}
          />
        )}

        {/* Origin / Destination Planner */}
        {boot && (
          <RoutePlanner
            nodes={boot.nodes}
            pois={boot.pois}
            startNode={startNode}
            goalNode={goalNode}
            onSelectStart={setStartNode}
            onSelectGoal={setGoalNode}
            pickingMode={pickingMode}
            onTogglePicking={(m) => setPickingMode(pickingMode === m ? null : m)}
            onSwap={handleSwap}
            onFindRoute={refreshRouteAndPlaces}
            loading={loading}
          />
        )}

        {/* Core Layout Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* LEFT COLUMN: Map & Interactive Inspector (7 cols on lg) */}
          <div className="lg:col-span-7 flex flex-col gap-4">
            {boot && (
              <InteractiveMap
                size={boot.size}
                nodes={boot.nodes}
                edges={boot.edges}
                pois={boot.pois}
                route={routeData ? routeData.route : null}
                naiveRoute={routeData ? routeData.naive : null}
                edgeStatus={routeData ? routeData.edge_status : {}}
                selectedEdgeId={selectedEdgeId}
                onSelectEdge={handleSelectEdge}
                startNode={startNode}
                goalNode={goalNode}
                pickingMode={pickingMode}
                onNodeClick={handleNodeClick}
                showNaiveRoute={showNaiveRoute}
                onToggleNaiveRoute={setShowNaiveRoute}
              />
            )}

            {/* Selected Street Deep Inspector */}
            {selectedEdgeDetail && (
              <StreetInspector
                detail={selectedEdgeDetail}
                onClose={() => {
                  setSelectedEdgeDetail(null);
                  setSelectedEdgeId(null);
                }}
                onQuickReport={() => setActiveTab('simulate')}
              />
            )}
          </div>

          {/* RIGHT COLUMN: Route Verdict, Guidance Tabs, Feed (5 cols on lg) */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            {/* Route Comparison Verdict */}
            {routeData && (
              <RouteComparison
                route={routeData.route}
                naive={routeData.naive}
                profileLabel={routeData.profile_label}
              />
            )}

            {/* Navigation Tabs */}
            <div className="bg-slate-900/60 rounded-2xl border border-slate-800 p-1 flex items-center gap-1 shadow-lg">
              <button
                onClick={() => setActiveTab('route')}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                  activeTab === 'route'
                    ? 'bg-amber-400 text-slate-950 shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Navigation className="w-3.5 h-3.5" />
                Directions
              </button>
              <button
                onClick={() => setActiveTab('places')}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                  activeTab === 'places'
                    ? 'bg-amber-400 text-slate-950 shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Compass className="w-3.5 h-3.5" />
                Destinations
              </button>
              <button
                onClick={() => setActiveTab('simulate')}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                  activeTab === 'simulate'
                    ? 'bg-amber-400 text-slate-950 shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                Simulate
              </button>
            </div>

            {/* Tab 1: Turn-by-Turn Guidance */}
            {activeTab === 'route' && routeData && (
              <TurnByTurn
                steps={routeData.route.steps}
                onSelectStepEdge={handleSelectEdge}
              />
            )}

            {/* Tab 2: Places & Entrance Audits */}
            {activeTab === 'places' && (
              <PlacesView
                places={places}
                onUpdatePoi={handleUpdatePoi}
                loading={loading}
                profileLabel={routeData ? routeData.profile_label : 'User'}
              />
            )}

            {/* Tab 3: Simulation & Sensor Testing Hub */}
            {activeTab === 'simulate' && boot && (
              <SimulationHub
                edges={boot.edges}
                barriers={boot.barriers}
                reporters={boot.reporters}
                cameras={boot.cameras}
                visionLabels={boot.vision_labels}
                selectedEdgeId={selectedEdgeId}
                onSelectEdge={handleSelectEdge}
                onSubmitReport={handleSubmitReport}
                onSubmitVision={handleSubmitVision}
                loading={loading}
              />
            )}

            {/* Real-time Live Event & Watcher Stream */}
            {boot && (
              <LiveFeed
                feed={boot.feed}
                alerts={alerts}
                onDismissAlert={(i) =>
                  setAlerts((prev) => prev.filter((_, idx) => idx !== i))
                }
              />
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 bg-slate-950 px-4 py-3 text-center text-xs text-slate-500">
        AccessRoute • Detecting, Updating & Communicating Real-World Accessibility Barriers • Built for Hackathon
      </footer>
    </div>
  );
};

export default App;
