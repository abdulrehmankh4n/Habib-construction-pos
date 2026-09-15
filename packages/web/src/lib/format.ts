import { formatDateDMY, formatRupees, roundQty } from '@pos/shared';

export { amountInWords, formatRupees, formatDateDMY } from '@pos/shared';

const TZ = 'Asia/Karachi';

export const money = (paisa: number | null | undefined): string =>
  paisa === null || paisa === undefined ? '—' : formatRupees(paisa);

export const moneyPlain = (paisa: number | null | undefined): string =>
  paisa === null || paisa === undefined ? '' : formatRupees(paisa, false);

export function qty(value: number | null | undefined, unit?: string): string {
  if (value === null || value === undefined) return '—';
  const text = new Intl.NumberFormat('en-PK', { maximumFractionDigits: 3 }).format(roundQty(value));
  return unit ? `${text} ${unit}` : text;
}

export function toPaisa(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  const s = String(input).replace(/,/g, '').trim();
  if (s === '') return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

export function fromPaisa(paisa: number | null | undefined): string {
  if (paisa === null || paisa === undefined) return '';
  return paisa % 100 === 0 ? String(paisa / 100) : (paisa / 100).toFixed(2);
}

export function parseQty(input: string): number | null {
  const s = input.replace(/,/g, '').trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? roundQty(n) : null;
}

export function today(): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return parts;
}

export function addDays(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function monthStart(day = today()): string {
  return `${day.slice(0, 7)}-01`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function dateLabel(value: string | null | undefined): string {
  if (!value) return '—';
  const [y, m, d] = value.slice(0, 10).split('-');
  return `${d} ${MONTHS[Number(m) - 1]} ${y}`;
}

export function timeLabel(value: string | null | undefined): string {
  if (!value || value.length < 16) return '';
  const h = Number(value.slice(11, 13));
  const min = value.slice(14, 16);
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${((h + 11) % 12) + 1}:${min} ${suffix}`;
}

export function dateTimeLabel(value: string | null | undefined): string {
  if (!value) return '—';
  return `${formatDateDMY(value)} ${timeLabel(value)}`.trim();
}

export function percent(value: number): string {
  return `${new Intl.NumberFormat('en-PK', { maximumFractionDigits: 2 }).format(value)}%`;
}

export function titleCase(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  const escape = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = '﻿' + rows.map((r) => r.map(escape).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const csvMoney = (paisa: number | null | undefined) => (paisa === null || paisa === undefined ? '' : (paisa / 100).toFixed(2));
