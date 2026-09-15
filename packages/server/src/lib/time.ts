let timezone = 'Asia/Karachi';

export function setTimezone(tz: string) {
  new Intl.DateTimeFormat('en-US', { timeZone: tz });
  timezone = tz;
}

function parts(date: Date) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const map: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) map[p.type] = p.value;
  return map;
}

export function nowLocal(date: Date = new Date()): string {
  const p = parts(date);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

export function todayLocal(date: Date = new Date()): string {
  return nowLocal(date).slice(0, 10);
}

export function addDays(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function isValidDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function withCurrentTime(day: string): string {
  const now = nowLocal();
  return day === now.slice(0, 10) ? now : `${day} ${now.slice(11)}`;
}

export function monthStart(day: string): string {
  return `${day.slice(0, 7)}-01`;
}
