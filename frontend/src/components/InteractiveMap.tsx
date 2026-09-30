import React, { useState, useRef } from 'react';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Compass,
} from 'lucide-react';
import type { Node, Edge, RouteData, NaiveData, EdgeStatus, Poi } from '../types/api';

interface InteractiveMapProps {
  size: number;
  nodes: Node[];
  edges: Edge[];
  pois: Poi[];
  route: RouteData | null;
  naiveRoute: NaiveData | null;
  edgeStatus: Record<string, EdgeStatus>;
  selectedEdgeId: string | null;
  onSelectEdge: (id: string) => void;
  startNode: number;
  goalNode: number;
  pickingMode: 'start' | 'goal' | null;
  onNodeClick: (nodeId: number) => void;
  showNaiveRoute: boolean;
  onToggleNaiveRoute: (val: boolean) => void;
}

export const InteractiveMap: React.FC<InteractiveMapProps> = ({
  size,
  nodes,
  edges,
  pois,
  route,
  naiveRoute,
  edgeStatus,
  selectedEdgeId,
  onSelectEdge,
  startNode,
  goalNode,
  pickingMode,
  onNodeClick,
  showNaiveRoute,
  onToggleNaiveRoute,
}) => {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);

  // Quick lookup for nodes by ID
  const nodeMap = React.useMemo(() => {
    const map = new Map<number, Node>();
    nodes.forEach((n) => map.set(n.id, n));
    return map;
  }, [nodes]);

  // Coordinate transformation: Cartesian (0,0 bottom-left) to SVG (0,0 top-left)
  const toSvgX = (x: number) => x;
  const toSvgY = (y: number) => size - y;

  // Zoom handlers
  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.25, 2.5));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.25, 0.6));
  const handleReset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Mouse pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    dragStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.current.x,
      y: e.clientY - dragStart.current.y,
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  // Build SVG path from node IDs
  const buildSvgPath = (nodeIds: number[]): string => {
    if (nodeIds.length < 2) return '';
    const points = nodeIds
      .map((id) => nodeMap.get(id))
      .filter((n): n is Node => !!n)
      .map((n) => `${toSvgX(n.x)},${toSvgY(n.y)}`);
    return `M ${points.join(' L ')}`;
  };

  // POI labels
  const poiByNode = React.useMemo(() => {
    const map = new Map<number, Poi>();
    pois.forEach((p) => map.set(p.node, p));
    return map;
  }, [pois]);

  return (
    <div className="relative w-full h-[540px] md:h-[620px] bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden shadow-2xl flex flex-col select-none">
      {/* Map Header Toolbar */}
      <div className="absolute top-3 left-3 right-3 z-10 flex items-center justify-between pointer-events-none">
        {/* Toggle Naive Route Compare */}
        <div className="pointer-events-auto bg-slate-900/90 backdrop-blur border border-slate-700/80 rounded-xl px-3 py-1.5 shadow-lg flex items-center gap-2.5">
          <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-200">
            <input
              type="checkbox"
              checked={showNaiveRoute}
              onChange={(e) => onToggleNaiveRoute(e.target.checked)}
              className="rounded bg-slate-800 border-slate-600 text-amber-400 focus:ring-amber-400 focus:ring-offset-slate-900 w-4 h-4 cursor-pointer"
            />
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 border-t-2 border-dashed border-purple-400" />
              Compare Normal Map Route
            </span>
          </label>
        </div>

        {/* Zoom & View Controls */}
        <div className="pointer-events-auto flex items-center gap-1 bg-slate-900/90 backdrop-blur border border-slate-700/80 rounded-xl p-1 shadow-lg">
          <button
            onClick={handleZoomIn}
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={handleZoomOut}
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={handleReset}
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition"
            title="Reset View"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Picking Mode Banner */}
      {pickingMode && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-20 bg-amber-500 text-slate-950 font-bold px-4 py-1.5 rounded-full text-xs shadow-xl animate-bounce flex items-center gap-1.5">
          <Compass className="w-4 h-4" />
          Click any intersection node to select {pickingMode === 'start' ? 'Origin' : 'Destination'}
        </div>
      )}

      {/* SVG Canvas Area */}
      <div
        className={`w-full h-full cursor-${isDragging ? 'grabbing' : pickingMode ? 'crosshair' : 'grab'}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <svg
          viewBox="-40 -35 480 470"
          className="w-full h-full transition-transform duration-75"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'center center',
          }}
        >
          <defs>
            {/* Background Dot Grid */}
            <pattern id="grid-dots" width="25" height="25" patternUnits="userSpaceOnUse">
              <circle cx="12.5" cy="12.5" r="0.8" fill="#334155" opacity="0.6" />
            </pattern>

            {/* Glowing filter for accessible route */}
            <filter id="route-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#10b981" floodOpacity="0.6" />
            </filter>
            {/* Glowing filter for naive route */}
            <filter id="naive-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="0" stdDeviation="2" floodColor="#c084fc" floodOpacity="0.5" />
            </filter>
          </defs>

          {/* Canvas Background */}
          <rect x="-40" y="-35" width="480" height="470" fill="#090d16" />
          <rect x="-40" y="-35" width="480" height="470" fill="url(#grid-dots)" />

          {/* Layer 1: Base Street Segments */}
          <g id="edges-base">
            {edges.map((e) => {
              const na = nodeMap.get(e.a);
              const nb = nodeMap.get(e.b);
              if (!na || !nb) return null;

              const x1 = toSvgX(na.x);
              const y1 = toSvgY(na.y);
              const x2 = toSvgX(nb.x);
              const y2 = toSvgY(nb.y);

              const status = edgeStatus[e.id]?.state || 'ok';
              const isSelected = selectedEdgeId === e.id;
              const isHovered = hoveredEdgeId === e.id;

              // Color determination
              let strokeColor = '#1e293b'; // default slate-800
              let strokeWidth = 3;
              let strokeDasharray = undefined;

              if (e.kind === 'crossing') {
                strokeColor = '#334155';
                strokeWidth = 3.5;
                strokeDasharray = '4 3';
              } else if (e.kind === 'path') {
                strokeColor = '#475569';
                strokeWidth = 2.5;
              }

              if (status === 'blocked') {
                strokeColor = '#ef4444'; // Red
                strokeWidth = 4;
              } else if (status === 'uncertain') {
                strokeColor = '#f97316'; // Orange
                strokeWidth = 3.5;
                strokeDasharray = '5 3';
              } else if (status === 'caution') {
                strokeColor = '#eab308'; // Amber
                strokeWidth = 3.5;
              }

              if (isSelected) {
                strokeColor = '#38bdf8'; // Sky blue highlight
                strokeWidth = 5;
              } else if (isHovered) {
                strokeColor = '#94a3b8'; // Slate hover highlight
                strokeWidth = 4.5;
              }

              return (
                <g key={e.id}>
                  {/* Visual Line */}
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={strokeColor}
                    strokeWidth={strokeWidth}
                    strokeDasharray={strokeDasharray}
                    strokeLinecap="round"
                    className="transition-colors duration-200"
                  />

                  {/* Wide Invisible Hitbox for easy clicking */}
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke="transparent"
                    strokeWidth={16}
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredEdgeId(e.id)}
                    onMouseLeave={() => setHoveredEdgeId(null)}
                    onClick={(evt) => {
                      evt.stopPropagation();
                      onSelectEdge(e.id);
                    }}
                  />
                </g>
              );
            })}
          </g>

          {/* Layer 2: Naive Shortest Path (Conventional Map Trap) */}
          {showNaiveRoute && naiveRoute && naiveRoute.nodes.length > 1 && (
            <path
              d={buildSvgPath(naiveRoute.nodes)}
              fill="none"
              stroke="#a855f7"
              strokeWidth="4"
              strokeDasharray="6 5"
              strokeLinecap="round"
              strokeLinejoin="round"
              filter="url(#naive-glow)"
              opacity="0.9"
            />
          )}

          {/* Layer 3: Accessible Safe Route */}
          {route && route.nodes.length > 1 && (
            <path
              d={buildSvgPath(route.nodes)}
              fill="none"
              stroke="#10b981"
              strokeWidth="5.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              filter="url(#route-glow)"
            />
          )}

          {/* Layer 4: Dynamic Barrier Badges with Bayesian Confidence Rings */}
          <g id="barrier-badges">
            {edges.map((e) => {
              const status = edgeStatus[e.id];
              if (!status || status.state === 'ok' || !status.issues.length) return null;

              const na = nodeMap.get(e.a);
              const nb = nodeMap.get(e.b);
              if (!na || !nb) return null;

              const mx = toSvgX((na.x + nb.x) / 2);
              const my = toSvgY((na.y + nb.y) / 2);

              // Take highest belief issue
              const maxIssue = status.issues.reduce((prev, curr) =>
                curr.belief > prev.belief ? curr : prev
              );

              const beliefPct = Math.round(maxIssue.belief * 100);
              const radius = 8;
              const circumference = 2 * Math.PI * radius;
              const strokeOffset = circumference - (circumference * beliefPct) / 100;

              let ringColor = '#ef4444'; // Red for confirmed
              if (maxIssue.uncertain) ringColor = '#f97316'; // Orange for uncertain
              else if (!maxIssue.blocking) ringColor = '#eab308'; // Amber for caution

              return (
                <g
                  key={`badge-${e.id}`}
                  className="cursor-pointer group"
                  transform={`translate(${mx}, ${my})`}
                  onClick={(evt) => {
                    evt.stopPropagation();
                    onSelectEdge(e.id);
                  }}
                >
                  {/* Background Circle */}
                  <circle r="9" fill="#0f172a" stroke="#334155" strokeWidth="1" />

                  {/* Bayesian Confidence Progress Ring */}
                  <circle
                    r={radius}
                    fill="none"
                    stroke={ringColor}
                    strokeWidth="2.5"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeOffset}
                    transform="rotate(-90)"
                    strokeLinecap="round"
                  />

                  {/* Inner Symbol */}
                  {status.state === 'blocked' ? (
                    <circle r="3" fill="#ef4444" />
                  ) : status.state === 'uncertain' ? (
                    <circle r="2.5" fill="#f97316" />
                  ) : (
                    <circle r="2.5" fill="#eab308" />
                  )}

                  {/* Hover Tooltip in SVG */}
                  <title>{`${maxIssue.label} (${beliefPct}% confidence)`}</title>
                </g>
              );
            })}
          </g>

          {/* Layer 5: Intersection Nodes & POIs */}
          <g id="nodes-and-pois">
            {nodes.map((n) => {
              const cx = toSvgX(n.x);
              const cy = toSvgY(n.y);
              const isStart = n.id === startNode;
              const isGoal = n.id === goalNode;
              const poi = poiByNode.get(n.id);

              return (
                <g
                  key={n.id}
                  className="cursor-pointer"
                  onClick={() => onNodeClick(n.id)}
                >
                  {/* Base Node Circle */}
                  <circle
                    cx={cx}
                    cy={cy}
                    r={isStart || isGoal ? 7 : poi ? 5 : 3.5}
                    fill={
                      isStart
                        ? '#10b981'
                        : isGoal
                        ? '#ef4444'
                        : poi
                        ? '#38bdf8'
                        : '#475569'
                    }
                    stroke="#0f172a"
                    strokeWidth={isStart || isGoal ? 2 : 1.5}
                    className="hover:scale-125 transition-transform"
                  />

                  {/* Start / Goal Beacon Rings */}
                  {isStart && (
                    <circle
                      cx={cx}
                      cy={cy}
                      r="12"
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="1.5"
                      opacity="0.7"
                      className="animate-ping"
                    />
                  )}
                  {isGoal && (
                    <circle
                      cx={cx}
                      cy={cy}
                      r="12"
                      fill="none"
                      stroke="#ef4444"
                      strokeWidth="1.5"
                      opacity="0.7"
                      className="animate-ping"
                    />
                  )}

                  {/* Start / Goal Letter Badges */}
                  {isStart && (
                    <text
                      x={cx}
                      y={cy + 3.5}
                      textAnchor="middle"
                      fill="#022c22"
                      fontSize="9"
                      fontWeight="bold"
                    >
                      S
                    </text>
                  )}
                  {isGoal && (
                    <text
                      x={cx}
                      y={cy + 3.5}
                      textAnchor="middle"
                      fill="#450a0a"
                      fontSize="9"
                      fontWeight="bold"
                    >
                      G
                    </text>
                  )}

                  {/* POI Labels */}
                  {poi && (
                    <g transform={`translate(${cx}, ${cy - 10})`}>
                      <rect
                        x="-30"
                        y="-12"
                        width="60"
                        height="14"
                        rx="4"
                        fill="#0f172a"
                        stroke="#38bdf8"
                        strokeWidth="0.8"
                        opacity="0.95"
                      />
                      <text
                        x="0"
                        y="-2"
                        textAnchor="middle"
                        fill="#bae6fd"
                        fontSize="7.5"
                        fontWeight="600"
                      >
                        {poi.name.split(' ')[0]}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {/* Map Legend Footer */}
      <div className="bg-slate-900/90 border-t border-slate-800 px-4 py-2.5 flex items-center justify-between text-xs flex-wrap gap-2">
        <div className="flex items-center gap-3 flex-wrap text-slate-300">
          <span className="flex items-center gap-1.5">
            <span className="w-3.5 h-1 bg-emerald-500 rounded-full" />
            <strong className="text-white">Accessible Route</strong>
          </span>
          {showNaiveRoute && (
            <span className="flex items-center gap-1.5">
              <span className="w-3.5 h-0.5 border-t-2 border-dashed border-purple-400" />
              <span>Normal Map Route</span>
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
            <span>Confirmed Block (≥60%)</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-orange-500" />
            <span>Unverified (25-60%)</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            <span>Caution</span>
          </span>
        </div>

        <span className="text-[11px] text-slate-400 font-medium">
          Outer ring on barrier icons indicates exact Bayesian confidence %
        </span>
      </div>
    </div>
  );
};
