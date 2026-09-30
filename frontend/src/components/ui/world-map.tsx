import React, { useMemo } from "react";
import DottedMap from "dotted-map";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

export interface WorldLocation {
  lat: number;
  lng: number;
  label: string;
}

export interface WorldConnection {
  start: number;
  end: number;
}

interface WorldMapProps {
  locations: WorldLocation[];
  connections?: WorldConnection[];
  className?: string;
}

export function WorldMap({ locations, connections = [], className }: WorldMapProps) {
  const reduceMotion = useReducedMotion();

  const map = useMemo(() => new DottedMap({ height: 100, grid: "diagonal" }), []);

  const svgDataUri = useMemo(() => {
    const svg = map.getSVG({
      shape: "circle",
      color: "#D3DDE8",
      radius: 0.22,
      backgroundColor: "transparent",
    });

    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }, [map]);

  const points = locations.map((loc) => {
    const pin = map.getPin({
      lat: loc.lat,
      lng: loc.lng,
    });

    return pin ? { x: pin.x, y: pin.y } : null;
  });

  const imageWidth = map.image.width;
  const imageHeight = map.image.height;

  const createCurvedPath = (start: { x: number; y: number }, end: { x: number; y: number }) => {
    const midX = (start.x + end.x) / 2;
    const midY = Math.min(start.y, end.y) - 50;

    return `M ${start.x} ${start.y} Q ${midX} ${midY} ${end.x} ${end.y}`;
  };

  return (
    <div
      className={cn("relative w-full overflow-hidden", className)}
      role="img"
      aria-label="Conceptual global coordination network"
    >
      {/* Dotted world map */}
      <img src={svgDataUri} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full" draggable={false} />

      <svg
        viewBox={`0 0 ${imageWidth} ${imageHeight}`}
        preserveAspectRatio="none"
        className="relative h-full w-full pointer-events-none select-none"
        aria-hidden="true"
      >
        {/* Connection arcs */}
        {connections.map((connection, i) => {
          const start = points[connection.start];
          const end = points[connection.end];

          if (!start || !end) return null;

          return (
            <g key={`connection-${i}`}>
              <motion.path
                d={createCurvedPath(start, end)}
                fill="none"
                stroke="#2F68F0"
                strokeWidth="0.7"
                strokeLinecap="round"
                initial={{
                  pathLength: 0,
                  opacity: 0,
                }}
                whileInView={{
                  pathLength: 1,
                  opacity: 1,
                }}
                viewport={{
                  once: true,
                  amount: 0.4,
                }}
                transition={{
                  duration: 1.1,
                  delay: 0.15 * i,
                  ease: "easeOut",
                }}
              />
            </g>
          );
        })}

        {/* Nodes + pulse */}
        {points.map((point, i) => {
          if (!point) return null;

          return (
            <g key={`node-${locations[i].label}`}>
              {/* Core node */}
              <circle cx={point.x} cy={point.y} r="1" fill="#2F68F0" />

              {/* Pulse */}
              {!reduceMotion && (
                <circle cx={point.x} cy={point.y} r="1" fill="#2F68F0" opacity="0.5">
                  <animate
                    attributeName="r"
                    values="1.5;5"
                    dur="1.5s"
                    begin={`${(i % 5) * 0.3}s`}
                    repeatCount="indefinite"
                  />

                  <animate
                    attributeName="opacity"
                    values="0.5;0"
                    dur="1.5s"
                    begin={`${(i % 5) * 0.3}s`}
                    repeatCount="indefinite"
                  />
                </circle>
              )}

              {/* Location label */}
              <text
                x={point.x}
                y={point.y + 4}
                textAnchor="middle"
                fill="#0B1220"
                fontFamily="Inter"
                fontSize="2"
                fontWeight="500"
                opacity="0.78"
                paintOrder="stroke"
                stroke="#FFFFFF"
                strokeWidth="2"
                strokeOpacity="0.65"
              >
                {locations[i].label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
