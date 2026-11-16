"use client";

import { useMemo } from "react";
import type { AcunetixScan, SeverityCounts } from "@/lib/acunetix";

type ThreatMapProps = {
  scans: AcunetixScan[];
  severity: SeverityCounts;
  running: number;
};

type Node = {
  id: string;
  x: number;
  y: number;
  label: string;
  risk: number;
  active: boolean;
};

function hashString(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function placeNode(seed: string, index: number): { x: number; y: number } {
  const h = hashString(`${seed}:${index}`);
  // Keep nodes inside a soft world band (avoid poles / oceans edges)
  const x = 70 + (h % 860);
  const y = 70 + ((h >>> 9) % 300);
  return { x, y };
}

function riskFromScan(scan: AcunetixScan) {
  const counts = scan.current_session?.severity_counts;
  if (!counts) return 1;
  return (
    counts.critical * 5 +
    counts.high * 3 +
    counts.medium * 2 +
    counts.low +
    counts.info * 0.2
  );
}

export function ThreatMap({ scans, severity, running }: ThreatMapProps) {
  const nodes = useMemo(() => {
    const ranked = [...scans]
      .sort((a, b) => riskFromScan(b) - riskFromScan(a))
      .slice(0, 12);

    return ranked.map((scan, index): Node => {
      const address = scan.target?.address || scan.scan_id;
      const status = scan.current_session?.status?.toLowerCase?.() ?? "";
      const active = [
        "processing",
        "scanning",
        "starting",
        "queued",
        "resuming",
        "paused",
      ].includes(status);
      const { x, y } = placeNode(address, index);
      return {
        id: scan.scan_id,
        x,
        y,
        label: address.replace(/^https?:\/\//, "").slice(0, 28),
        risk: riskFromScan(scan),
        active,
      };
    });
  }, [scans]);

  const hub = { x: 500, y: 210 };
  const threatScore =
    severity.critical * 5 +
    severity.high * 3 +
    severity.medium * 1.5 +
    severity.low * 0.5;
  const alertLevel =
    severity.critical > 0
      ? "CRITICAL"
      : severity.high > 0
        ? "ELEVATED"
        : running > 0
          ? "SCANNING"
          : "NOMINAL";

  const feed = useMemo(() => {
    const lines = [
      running > 0
        ? `// active probes ${running}`
        : "// idle — awaiting engagement",
      `// critical ${severity.critical} · high ${severity.high} · medium ${severity.medium}`,
      nodes[0]
        ? `// primary vector → ${nodes[0].label}`
        : "// no target graph yet",
      `// threat index ${Math.round(threatScore)} · posture ${alertLevel}`,
    ];
    return lines;
  }, [running, severity, nodes, threatScore, alertLevel]);

  return (
    <section className="threat-map rise rise-delay-1 overflow-hidden rounded-2xl border border-[var(--line)] bg-[color-mix(in_srgb,var(--panel-solid)_88%,#000)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] px-3 py-2 sm:px-4">
        <div>
          <p className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.22em] text-[var(--accent)] uppercase">
            Global risk lattice
          </p>
          <h2 className="font-[family-name:var(--font-display)] text-base font-semibold text-[var(--ink)] sm:text-lg">
            Attack surface monitor
          </h2>
        </div>
        <div
          className={`threat-badge font-[family-name:var(--font-mono)] text-[10px] tracking-[0.16em] uppercase ${
            alertLevel === "CRITICAL"
              ? "threat-badge-critical"
              : alertLevel === "ELEVATED"
                ? "threat-badge-elevated"
                : alertLevel === "SCANNING"
                  ? "threat-badge-scanning"
                  : "threat-badge-ok"
          }`}
        >
          {alertLevel}
        </div>
      </div>

      <div className="relative grid gap-0 lg:grid-cols-[minmax(0,1fr)_13rem]">
        <div className="threat-stage relative min-h-[220px] sm:min-h-[260px]">
          <div className="threat-hex" />
          <svg
            className="absolute inset-0 h-full w-full"
            viewBox="0 0 1000 420"
            role="img"
            aria-label="Animated risk map of scanned targets"
          >
            <defs>
              <radialGradient id="hubGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="rgba(45,212,168,0.55)" />
                <stop offset="100%" stopColor="rgba(45,212,168,0)" />
              </radialGradient>
              <linearGradient id="arcHot" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="rgba(255,107,107,0)" />
                <stop offset="40%" stopColor="rgba(255,107,107,0.9)" />
                <stop offset="100%" stopColor="rgba(240,180,41,0)" />
              </linearGradient>
              <linearGradient id="arcCool" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="rgba(45,212,168,0)" />
                <stop offset="45%" stopColor="rgba(110,168,254,0.85)" />
                <stop offset="100%" stopColor="rgba(45,212,168,0)" />
              </linearGradient>
            </defs>

            {/* stylized continents */}
            <g className="threat-land" opacity="0.35">
              <path d="M120 120 C170 90 230 95 270 130 C300 155 285 190 250 200 C200 215 145 190 120 150 Z" />
              <path d="M300 150 C360 120 430 125 470 165 C500 195 480 240 430 250 C370 265 310 230 300 180 Z" />
              <path d="M520 110 C590 85 680 95 740 140 C790 175 780 230 720 250 C650 275 560 250 520 190 Z" />
              <path d="M760 180 C820 160 890 175 920 220 C945 255 920 295 860 300 C800 305 745 260 760 210 Z" />
              <path d="M180 250 C230 235 280 255 300 300 C315 335 280 365 230 360 C175 355 150 300 180 250 Z" />
              <path d="M560 270 C620 255 690 270 720 315 C745 350 710 385 650 380 C590 375 540 330 560 270 Z" />
            </g>

            <circle
              className="radar-ring"
              cx={hub.x}
              cy={hub.y}
              r="46"
              fill="none"
              stroke="rgba(45,212,168,0.35)"
              strokeWidth="1"
            />
            <circle
              className="radar-ring radar-ring-2"
              cx={hub.x}
              cy={hub.y}
              r="86"
              fill="none"
              stroke="rgba(110,168,254,0.22)"
              strokeWidth="1"
            />
            <circle cx={hub.x} cy={hub.y} r="54" fill="url(#hubGlow)" />
            <circle
              cx={hub.x}
              cy={hub.y}
              r="7"
              fill="var(--accent)"
              className="hub-core"
            />
            <text
              x={hub.x}
              y={hub.y + 28}
              textAnchor="middle"
              className="fill-[var(--accent)] font-[family-name:var(--font-mono)] text-[10px]"
            >
              AX-CORE
            </text>

            {nodes.map((node, index) => {
              const midX = (hub.x + node.x) / 2 + (index % 2 === 0 ? 40 : -40);
              const midY = Math.min(hub.y, node.y) - 30 - (index % 3) * 8;
              const d = `M ${hub.x} ${hub.y} Q ${midX} ${midY} ${node.x} ${node.y}`;
              const hot = node.risk >= 8;
              return (
                <g key={node.id}>
                  <path
                    d={d}
                    fill="none"
                    stroke={hot ? "url(#arcHot)" : "url(#arcCool)"}
                    strokeWidth={hot ? 2 : 1.25}
                    className={node.active ? "attack-arc attack-arc-live" : "attack-arc"}
                    style={{ animationDelay: `${index * 0.35}s` }}
                  />
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={hot ? 10 : 7}
                    className={
                      hot
                        ? "risk-blip risk-blip-hot"
                        : node.active
                          ? "risk-blip risk-blip-live"
                          : "risk-blip"
                    }
                    style={{ animationDelay: `${index * 0.2}s` }}
                  />
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r="2.5"
                    fill={hot ? "var(--danger)" : "var(--ink)"}
                  />
                </g>
              );
            })}

            {/* sweeping radar wedge */}
            <g className="radar-sweep" style={{ transformOrigin: `${hub.x}px ${hub.y}px` }}>
              <path
                d={`M ${hub.x} ${hub.y} L ${hub.x} ${hub.y - 110} A 110 110 0 0 1 ${hub.x + 78} ${hub.y - 78} Z`}
                fill="rgba(45,212,168,0.12)"
              />
            </g>
          </svg>

          {nodes.length === 0 ? (
            <p className="absolute inset-0 flex items-center justify-center font-[family-name:var(--font-mono)] text-xs text-[var(--muted)]">
              waiting for target telemetry…
            </p>
          ) : null}
        </div>

        <aside className="border-t border-[var(--line)] bg-[rgba(0,0,0,0.25)] p-3 font-[family-name:var(--font-mono)] text-[11px] leading-relaxed text-[var(--muted)] lg:border-t-0 lg:border-l">
          <p className="mb-2 tracking-[0.18em] text-[var(--accent)] uppercase">
            detection feed
          </p>
          <ul className="flex flex-col gap-1.5">
            {feed.map((line) => (
              <li key={line} className="threat-feed-line truncate">
                {line}
              </li>
            ))}
          </ul>
          <div className="mt-4 grid grid-cols-2 gap-2 text-[10px]">
            <div className="rounded-md border border-[var(--line)] px-2 py-1.5">
              <div className="text-[var(--danger)]">CRIT</div>
              <div className="text-sm text-[var(--ink)]">{severity.critical}</div>
            </div>
            <div className="rounded-md border border-[var(--line)] px-2 py-1.5">
              <div className="text-[var(--warn)]">HIGH</div>
              <div className="text-sm text-[var(--ink)]">{severity.high}</div>
            </div>
            <div className="rounded-md border border-[var(--line)] px-2 py-1.5">
              <div className="text-[var(--accent)]">LIVE</div>
              <div className="text-sm text-[var(--ink)]">{running}</div>
            </div>
            <div className="rounded-md border border-[var(--line)] px-2 py-1.5">
              <div className="text-[var(--info)]">NODES</div>
              <div className="text-sm text-[var(--ink)]">{nodes.length}</div>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
