"use client";

import { useState } from "react";
import type { CausalEffectApi } from "@/lib/lab-api";

interface Props {
  data: CausalEffectApi;
  highlightTreatment?: string;
}

const KIND_STYLE: Record<
  string,
  { fill: string; stroke: string; text: string; label: string }
> = {
  treatment: {
    fill: "oklch(0.78 0.15 55 / 0.12)",
    stroke: "oklch(0.78 0.15 55)",
    text: "oklch(0.88 0.1 55)",
    label: "Treatment",
  },
  mediator: {
    fill: "oklch(0.7 0.13 200 / 0.12)",
    stroke: "oklch(0.7 0.13 200)",
    text: "oklch(0.8 0.1 200)",
    label: "Mediator",
  },
  outcome: {
    fill: "oklch(0.72 0.15 160 / 0.14)",
    stroke: "oklch(0.72 0.15 160)",
    text: "oklch(0.82 0.12 160)",
    label: "Outcome",
  },
};

export function CausalGraph({ data, highlightTreatment = "R" }: Props) {
  const [hover, setHover] = useState<string | null>(null);
  const W = 760;
  const H = 440;
  const pad = 70;

  const nodes = data.graph.nodes.map((n) => ({
    ...n,
    px: pad + n.x * (W - 2 * pad),
    py: pad + n.y * (H - 2 * pad),
  }));
  const nodeById = Object.fromEntries(nodes.map((n) => [n.id, n]));

  const isHighlighted = (from: string, to: string) =>
    hover === from || hover === to;
  const edgeActive = (from: string, to: string) =>
    (from === highlightTreatment && to === "G") ||
    (from === "G" && to === "Y") ||
    hover === from ||
    hover === to;

  return (
    <div className="relative w-full overflow-x-auto scroll-thin">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full min-w-[640px]"
        style={{ maxHeight: 460 }}
      >
        <defs>
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M0,0 L10,5 L0,10 z" fill="oklch(0.6 0.01 60)" />
          </marker>
          <marker
            id="arrow-active"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="8"
            markerHeight="8"
            orient="auto-start-reverse"
          >
            <path d="M0,0 L10,5 L0,10 z" fill="oklch(0.78 0.15 55)" />
          </marker>
        </defs>

        {/* Edges */}
        {data.graph.edges.map((e, i) => {
          const a = nodeById[e.from];
          const b = nodeById[e.to];
          if (!a || !b) return null;
          const active = edgeActive(e.from, e.to);
          // shorten line so arrowhead lands on node edge
          const dx = b.px - a.px;
          const dy = b.py - a.py;
          const len = Math.hypot(dx, dy) || 1;
          const r = 46;
          const ex = b.px - (dx / len) * r;
          const ey = b.py - (dy / len) * r;
          const sx = a.px + (dx / len) * r;
          const sy = a.py + (dy / len) * r;
          const mx = (sx + ex) / 2;
          const my = (sy + ey) / 2;
          return (
            <g key={i}>
              <line
                x1={sx}
                y1={sy}
                x2={ex}
                y2={ey}
                stroke={
                  active ? "oklch(0.78 0.15 55)" : "oklch(0.45 0.01 60)"
                }
                strokeWidth={active ? 2.4 : 1.4}
                markerEnd={`url(#${active ? "arrow-active" : "arrow"})`}
                opacity={active ? 1 : 0.55}
              />
              <rect
                x={mx - 26}
                y={my - 9}
                width={52}
                height={16}
                rx={4}
                fill="oklch(0.19 0.008 60)"
                stroke={
                  active ? "oklch(0.78 0.15 55 / 0.5)" : "oklch(0.3 0.008 60)"
                }
                strokeWidth={0.8}
              />
              <text
                x={mx}
                y={my + 2}
                textAnchor="middle"
                fontSize={9}
                fontFamily="var(--font-geist-mono)"
                fill={active ? "oklch(0.88 0.1 55)" : "oklch(0.6 0.01 60)"}
              >
                β={e.coefficient}
              </text>
            </g>
          );
        })}

        {/* Nodes */}
        {nodes.map((n) => {
          const st = KIND_STYLE[n.kind] ?? KIND_STYLE.mediator;
          const isHover = hover === n.id;
          const isHL = n.id === highlightTreatment || n.id === "Y";
          return (
            <g
              key={n.id}
              onMouseEnter={() => setHover(n.id)}
              onMouseLeave={() => setHover(null)}
              style={{ cursor: "pointer" }}
            >
              <ellipse
                cx={n.px}
                cy={n.py}
                rx={48}
                ry={30}
                fill={st.fill}
                stroke={isHL || isHover ? "oklch(0.78 0.15 55)" : st.stroke}
                strokeWidth={isHL || isHover ? 2.2 : 1.4}
              />
              <text
                x={n.px}
                y={n.py - 4}
                textAnchor="middle"
                fontSize={16}
                fontFamily="var(--font-geist-mono)"
                fontWeight={700}
                fill={st.text}
              >
                {n.symbol}
              </text>
              <text
                x={n.px}
                y={n.py + 10}
                textAnchor="middle"
                fontSize={8.5}
                fontFamily="var(--font-geist-sans)"
                fill="oklch(0.7 0.01 60)"
              >
                {n.label.length > 16 ? n.label.slice(0, 15) + "…" : n.label}
              </text>
              <text
                x={n.px}
                y={n.py + 42}
                textAnchor="middle"
                fontSize={8}
                fontFamily="var(--font-geist-mono)"
                fill={st.text}
                opacity={0.7}
              >
                {st.label}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
        {Object.entries(KIND_STYLE).map(([k, v]) => (
          <span key={k} className="flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: v.stroke }}
            />
            {v.label}
          </span>
        ))}
        <span className="ml-auto font-mono text-[10px] text-muted-foreground">
          hover a node to highlight its causal paths
        </span>
      </div>
    </div>
  );
}
