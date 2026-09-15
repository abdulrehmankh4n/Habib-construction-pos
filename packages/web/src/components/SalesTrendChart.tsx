import { useEffect, useRef, useState } from 'react';
import { dateLabel, money } from '../lib/format';

interface Point {
  date: string;
  total: number;
  count: number;
}

const BAR = '#ea580c';
const BAR_HOVER = '#c2410c';
const GRID = '#e2e8f0';
const TEXT = '#64748b';

function niceMax(value: number): number {
  if (value <= 0) return 1000;
  const exp = Math.pow(10, Math.floor(Math.log10(value)));
  const f = value / exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * exp;
}

function compact(rupees: number): string {
  if (rupees >= 10_000_000) return `${+(rupees / 10_000_000).toFixed(1)} Cr`;
  if (rupees >= 100_000) return `${+(rupees / 100_000).toFixed(1)} Lac`;
  if (rupees >= 1000) return `${+(rupees / 1000).toFixed(0)}K`;
  return String(Math.round(rupees));
}

function columnPath(x: number, y: number, w: number, base: number): string {
  const h = base - y;
  if (h <= 0) return '';
  const r = Math.min(4, h, w / 2);
  return `M${x},${base} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${base} Z`;
}

export function SalesTrendChart({ data }: { data: Point[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setWidth(Math.max(280, entries[0].contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const height = 220;
  const m = { top: 12, right: 8, bottom: 26, left: 52 };
  const innerW = width - m.left - m.right;
  const innerH = height - m.top - m.bottom;
  const maxRupees = niceMax(Math.max(...data.map((d) => d.total / 100), 0));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * maxRupees);
  const band = innerW / Math.max(1, data.length);
  const barW = Math.min(24, band * 0.62);
  const y = (rupees: number) => m.top + innerH - (rupees / maxRupees) * innerH;
  const base = m.top + innerH;
  const labelEvery = band < 34 ? 2 : 1;

  const hovered = hover !== null ? data[hover] : null;

  return (
    <div>
      <div ref={wrapRef} className="relative">
        <svg width={width} height={height} role="img" aria-label="Daily sales for the last 14 days" className="block">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={m.left} x2={width - m.right} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} shapeRendering="crispEdges" />
              <text x={m.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill={TEXT} style={{ fontVariantNumeric: 'tabular-nums' }}>
                {compact(t)}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const cx = m.left + band * i + band / 2;
            const top = y(d.total / 100);
            return (
              <g key={d.date}>
                <path d={columnPath(cx - barW / 2, top, barW, base)} fill={hover === i ? BAR_HOVER : BAR} />
                {i % labelEvery === (data.length - 1) % labelEvery && (
                  <text x={cx} y={height - 8} textAnchor="middle" fontSize={11} fill={TEXT}>
                    {dateLabel(d.date).slice(0, 6)}
                  </text>
                )}
                <rect
                  x={m.left + band * i}
                  y={m.top}
                  width={band}
                  height={innerH}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                />
              </g>
            );
          })}
        </svg>
        {hovered && hover !== null && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg"
            style={{
              left: Math.min(Math.max(m.left + band * hover + band / 2, 70), width - 70),
              top: Math.max(y(hovered.total / 100) - 8, 40),
            }}
          >
            <p className="font-semibold text-slate-800">{dateLabel(hovered.date)}</p>
            <p className="text-slate-600">{money(hovered.total)}</p>
            <p className="text-slate-500">{hovered.count} invoice(s)</p>
          </div>
        )}
      </div>
      <div className="mt-1 flex justify-end">
        <button type="button" className="text-xs font-medium text-slate-500 hover:text-slate-800" onClick={() => setShowTable((s) => !s)}>
          {showTable ? 'Hide table' : 'View as table'}
        </button>
      </div>
      {showTable && (
        <div className="mt-2 overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Date</th>
                <th className="num">Invoices</th>
                <th className="num">Sales</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.date}>
                  <td>{dateLabel(d.date)}</td>
                  <td className="num">{d.count}</td>
                  <td className="num">{money(d.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
