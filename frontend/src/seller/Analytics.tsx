import { useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import {
  arrowLeft,
  arrowRight,
  ellipseInner,
  ellipseReach,
  ellipseRevenue,
  legendDashed,
  legendFixed,
  legendRevenue,
  legendSolid,
  legendVariable,
} from "./assets.ts";
import { stockLevel } from "./inventory.ts";
import type { Product } from "./inventory.ts";

// Illustrative figures from the design. There is no sales feed yet, so these are not derived from inventory.
const revenue = [166, 171.9, 178.8, 187.7, 197.6, 208.5, 220.2, 232.1, 244.8, 258.2, 272.2, 314.9];
const variableCost = [73.1, 75.1, 78.1, 82, 86, 89.9, 94.2, 98.6, 103.3, 108.1, 113.2, 119.1];
const fixedCost = [54.3, 54.3, 55.3, 55.3, 56.3, 56.3, 57.3, 58, 58.7, 59.4, 60.1, 60.9];
const nowIndex = 6;

const productSales = [
  { name: "Framework Laptop 13", views: "12.8k views", sold: 186 },
  { name: "Desk Kit Pro", views: "8.4k views", sold: 122 },
  { name: "Travel Dock Mini", views: "5.2k views", sold: 76 },
];
const categoryRevenue = [
  { name: "Laptops", label: "$166.8k", value: 166.8, color: "#5d64be" },
  { name: "Workspace", label: "$42.7k", value: 42.7, color: "#90d8f1" },
  { name: "Accessories", label: "$13.3k", value: 13.3, color: "#f67956" },
];

// Chart geometry (SVG user units, matching the design frame).
const W = 610;
const viewTop = 64;
const H = 290 - viewTop;
const left = 43;
const right = 585;
const top = 102;
const base = 256;
const yMax = 360;
const last = revenue.length - 1;
const span = right - left;
// The divider can give either section between 20% and 80% of the plot width.
const minDivider = left + span * 0.2;
const maxDivider = left + span * 0.8;
const defaultDivider = left + (span * nowIndex) / last;
const y = (v: number) => base - (v / yMax) * (base - 120);

// Piecewise x scale: past months share [left, divider], projected months share [divider, right].
function xScale(divider: number) {
  return (i: number) =>
    i <= nowIndex
      ? left + (i / nowIndex) * (divider - left)
      : divider + ((i - nowIndex) / (last - nowIndex)) * (right - divider);
}

function avgMargin(from: number, to: number) {
  let total = 0;
  for (let i = from; i <= to; i++) total += (revenue[i] - variableCost[i] - fixedCost[i]) / revenue[i];
  return (total / (to - from + 1)) * 100;
}

// Label every month when there's room, otherwise every 2nd or 3rd, counted outward from Now.
function labelStep(sectionWidth: number, months: number) {
  const perMonth = sectionWidth / months;
  if (perMonth >= 52) return 1;
  if (perMonth >= 20) return 2;
  return 3;
}

function monthLabel(i: number) {
  return i < nowIndex ? `${nowIndex - i} mo ago` : `+${i - nowIndex} mo`;
}

function Chip({ x, anchor, text, maxWidth }: { x: number; anchor: "start" | "end"; text: [string, string]; maxWidth: number }) {
  const full = `${text[0]} · ${text[1]}`;
  const label = full.length * 4.9 + 22 <= maxWidth ? full : text[0];
  const width = label.length * 4.9 + 22;
  const rx = anchor === "start" ? x : x - width;
  return (
    <g>
      <rect x={rx} y={72} width={width} height={22} rx={11} fill="#f1f0f4" />
      <text x={rx + 11} y={86} className="su-chart-chip">
        {label}
      </text>
    </g>
  );
}

function MarginsChart() {
  const svg = useRef<SVGSVGElement>(null);
  const [divider, setDivider] = useState(defaultDivider);
  const [dragging, setDragging] = useState(false);
  const clamp = (v: number) => Math.min(maxDivider, Math.max(minDivider, v));

  function fromPointer(e: PointerEvent) {
    const rect = svg.current!.getBoundingClientRect();
    return clamp(((e.clientX - rect.left) / rect.width) * W);
  }
  function onKey(e: KeyboardEvent) {
    const step = span * 0.04;
    if (e.key === "Home") setDivider(minDivider);
    else if (e.key === "End") setDivider(maxDivider);
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") setDivider((d) => clamp(d - step));
    else if (e.key === "ArrowRight" || e.key === "ArrowUp") setDivider((d) => clamp(d + step));
    else return;
    e.preventDefault();
  }

  const x = xScale(divider);
  const points = (series: number[], from: number, to: number) =>
    series.slice(from, to + 1).map((v, k) => `${x(from + k)},${y(v)}`).join(" ");
  const band = [
    ...revenue.slice(nowIndex).map((v, k) => `${x(nowIndex + k)},${y(v + k * 4.4)}`),
    ...revenue.slice(nowIndex).map((v, k) => `${x(nowIndex + k)},${y(v)}`).reverse(),
  ].join(" ");
  const pastShare = Math.round(((divider - left) / span) * 100);
  const pastStep = labelStep(divider - left, nowIndex);
  const futureStep = labelStep(right - divider, last - nowIndex);
  const labelled = revenue
    .map((_, i) => i)
    .filter((i) => (i < nowIndex ? (nowIndex - i) % pastStep === 0 : i > nowIndex && (i - nowIndex) % futureStep === 0));

  const series = [
    { data: revenue, color: "#5d64be" },
    { data: variableCost, color: "#f67956" },
    { data: fixedCost, color: "#f0a875" },
  ];

  return (
    <div className="su-chart">
      <svg
        ref={svg}
        viewBox={`0 ${viewTop} ${W} ${H}`}
        role="slider"
        tabIndex={0}
        aria-label="Divider between past and projected axes"
        aria-valuemin={20}
        aria-valuemax={80}
        aria-valuenow={pastShare}
        aria-valuetext={`Past months use ${pastShare}% of the chart width, projected months ${100 - pastShare}%.`}
        className={dragging ? "is-dragging" : undefined}
        onKeyDown={onKey}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setDragging(true);
          setDivider(fromPointer(e));
        }}
        onPointerMove={(e) => dragging && setDivider(fromPointer(e))}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
        onDoubleClick={() => setDivider(defaultDivider)}
      >
        <rect x={39} y={top} width={divider - 39} height={base - top} rx={8} fill="rgba(241,240,244,0.9)" />
        <rect x={divider} y={top} width={589 - divider} height={base - top} rx={8} fill="rgba(237,240,252,0.7)" stroke="rgba(93,100,190,0.45)" strokeDasharray="4 3" />

        <Chip x={44} anchor="start" text={["Past", `${avgMargin(0, nowIndex).toFixed(1)}% avg margin`]} maxWidth={divider - 44 - 22} />
        <Chip x={584} anchor="end" text={["Projected", `${avgMargin(nowIndex, last).toFixed(1)}% avg margin`]} maxWidth={584 - divider - 22} />

        {[360, 240, 120].map((v) => (
          <g key={v}>
            <line x1={24} x2={588} y1={y(v)} y2={y(v)} stroke="#e0dee5" strokeDasharray="2 3" />
            <text x={8} y={y(v) + 3} className="su-chart-axis">${v}k</text>
          </g>
        ))}
        <line x1={24} x2={585.5} y1={base} y2={base} stroke="#c9c7d1" strokeWidth={0.5} />
        <text x={19} y={base + 3} className="su-chart-axis">$0k</text>
        {revenue.map((_, i) => (
          <line key={i} x1={x(i)} x2={x(i)} y1={base} y2={base + 4} stroke="#c9c7d1" strokeWidth={0.75} />
        ))}

        <polygon points={band} fill="#5d64be" fillOpacity={0.14} />

        {series.map(({ data, color }) => (
          <g key={color}>
            <polyline points={points(data, 0, nowIndex)} fill="none" stroke={color} strokeWidth={2} />
            <polyline points={points(data, nowIndex, last)} fill="none" stroke={color} strokeWidth={2} strokeDasharray="6 4" />
            {data.map((v, i) =>
              i <= nowIndex ? (
                <circle key={i} cx={x(i)} cy={y(v)} r={5} fill={color} />
              ) : (
                <circle key={i} cx={x(i)} cy={y(v)} r={4} fill="#fff" stroke={color} strokeWidth={2} />
              ),
            )}
          </g>
        ))}

        {labelled.map((i) => (
          <text key={i} x={x(i)} y={276} textAnchor="middle" className="su-chart-axis">
            {monthLabel(i)}
          </text>
        ))}

        <g className="su-chart-divider" transform={`translate(${divider} 0)`}>
          <line y1={96} y2={264} stroke="#1a1a24" strokeWidth={2} />
          <rect x={-18} y={264} width={36} height={16} rx={8} fill="#1a1a24" />
          <text y={275} textAnchor="middle" className="su-chart-now">
            Now
          </text>
          <rect x={-14} y={172} width={28} height={24} rx={12} fill="#5d64be" stroke="#fff" strokeWidth={2} className="su-chart-handle" />
          <image href={arrowLeft} x={-8} y={180} width={5} height={8} />
          <image href={arrowRight} x={3} y={180} width={5} height={8} />
        </g>
      </svg>
      <div className="su-legend">
        <span><img src={legendRevenue} alt="" width={8} height={8} />Revenue</span>
        <span><img src={legendVariable} alt="" width={8} height={8} />Variable cost</span>
        <span><img src={legendFixed} alt="" width={8} height={8} />Fixed cost</span>
        <span className="su-legend-end">
          <img src={legendSolid} alt="" width={22} height={2} />Past
          <img src={legendDashed} alt="" width={22} height={2} />Projected
        </span>
      </div>
    </div>
  );
}

function Bars({ items }: { items: { key: string; top: string; fill: number; color: string; name: string; sub?: string; nameMuted?: boolean }[] }) {
  return (
    <div className="su-bars">
      {items.map((item) => (
        <div className="su-bar" key={item.key}>
          <span className={item.sub ? "su-bar-top" : "su-bar-top is-strong"}>{item.top}</span>
          <span className="su-bar-track">
            <span className="su-bar-fill" style={{ height: `${item.fill * 100}%`, background: item.color }} />
          </span>
          <span className={item.nameMuted ? "su-bar-name is-muted" : "su-bar-name"}>{item.name}</span>
          {item.sub && <span className="su-bar-sub">{item.sub}</span>}
        </div>
      ))}
    </div>
  );
}

export default function Analytics({ products }: { products: Product[] }) {
  const attention = products.filter((p) => stockLevel(p.stock) !== "in");
  const stockSentence =
    attention.length === 0
      ? "Every listed product is comfortably in stock."
      : `${attention.length} of your ${products.length} products ${attention.length === 1 ? "is" : "are"} low or out of stock (${attention
          .slice(0, 3)
          .map((p) => p.name)
          .join(", ")}${attention.length > 3 ? ", …" : ""}); restocking keeps them eligible for buyer requests.`;
  const maxSold = 205;

  return (
    <div className="su-analytics">
      <h1 className="su-page-title">Vendor Dashboard</h1>
      <p className="su-lede">Sales and agent figures are illustrative until a sales feed is connected. Stock insights use your local inventory.</p>

      <div className="su-analytics-top">
        <section className="su-panel su-summary" aria-labelledby="su-summary-title">
          <h2 id="su-summary-title">AI summary</h2>
          <p>
            Your laptop line is winning on repairability and value. The agent is appearing in more qualified debates, but
            Desk Kit Pro needs a clearer delivery promise to convert interest into sales. {stockSentence}
          </p>
          <div className="su-summary-stats">
            <div style={{ background: "#e0f5fc" }}>
              <span>Agent appearances</span>
              <strong>1,240</strong>
              <em>+18.4%</em>
            </div>
            <div style={{ background: "#fef1d0" }}>
              <span>Platform spend</span>
              <strong>$184</strong>
              <em className="is-muted">this month</em>
            </div>
            <div style={{ background: "#ffede5" }}>
              <span>Agent conversion</span>
              <strong>8.6%</strong>
              <em>+1.2 pts</em>
            </div>
          </div>
        </section>

        <section className="su-panel su-margins" aria-labelledby="su-margins-title">
          <h2 id="su-margins-title">Current and projected margins</h2>
          <p className="su-panel-sub">Revenue versus fixed + variable cost. Drag the divider to stretch the past or projected axis; double-click to reset.</p>
          <MarginsChart />
        </section>
      </div>

      <div className="su-analytics-bottom">
        <div className="su-stat-stack">
          <section className="su-panel su-stat">
            <span>Gross revenue</span>
            <strong>$222.8k</strong>
            <small>+18.4% quarter over quarter</small>
            <span className="su-stat-dot" aria-hidden="true">
              <img src={ellipseRevenue} alt="" width={20} height={24.4182} />
              <img src={ellipseInner} alt="" width={10} height={12.2091} />
            </span>
          </section>
          <section className="su-panel su-stat">
            <span>Buyer agent reach</span>
            <strong>1,240</strong>
            <small>Qualified appearances</small>
            <span className="su-stat-dot" aria-hidden="true">
              <img src={ellipseReach} alt="" width={20} height={24.4182} />
              <img src={ellipseInner} alt="" width={10} height={12.2091} />
            </span>
          </section>
        </div>

        <section className="su-panel su-breakdown" aria-labelledby="su-sales-title">
          <h2 id="su-sales-title">Product sales breakdown</h2>
          <p className="su-panel-sub">Views versus attributed sales.</p>
          <Bars
            items={productSales.map((s) => ({ key: s.name, top: s.views, fill: s.sold / maxSold, color: "#5d64be", name: s.name, sub: `${s.sold} sold` }))}
          />
        </section>

        <section className="su-panel su-breakdown" aria-labelledby="su-revenue-title">
          <h2 id="su-revenue-title">Revenue breakdown</h2>
          <p className="su-panel-sub">Gross revenue by product category.</p>
          <Bars
            items={categoryRevenue.map((c) => ({ key: c.name, top: c.label, fill: c.value / 180, color: c.color, name: c.name, nameMuted: true }))}
          />
        </section>
      </div>
    </div>
  );
}
