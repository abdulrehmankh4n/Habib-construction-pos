const numberFormat = new Intl.NumberFormat('en-PK', { maximumFractionDigits: 2, minimumFractionDigits: 0 });
const moneyFormat2 = new Intl.NumberFormat('en-PK', { maximumFractionDigits: 2, minimumFractionDigits: 2 });

export function formatNumber(value: number): string {
  return numberFormat.format(value);
}

export function formatRupees(paisa: number, withSymbol = true): string {
  const rupees = paisa / 100;
  const text = paisa % 100 === 0 ? numberFormat.format(rupees) : moneyFormat2.format(rupees);
  return withSymbol ? `Rs ${text}` : text;
}

const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function belowHundred(n: number): string {
  if (n < 20) return ONES[n];
  return `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`;
}

function belowThousand(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return [h ? `${ONES[h]} Hundred` : '', rest ? belowHundred(rest) : ''].filter(Boolean).join(' ');
}

export function integerInWords(n: number): string {
  if (n === 0) return 'Zero';
  const parts: string[] = [];
  const arab = Math.floor(n / 1_000_000_000);
  const crore = Math.floor((n % 1_000_000_000) / 10_000_000);
  const lakh = Math.floor((n % 10_000_000) / 100_000);
  const thousand = Math.floor((n % 100_000) / 1000);
  const rest = n % 1000;
  if (arab) parts.push(`${integerInWords(arab)} Arab`);
  if (crore) parts.push(`${belowHundred(crore)} Crore`);
  if (lakh) parts.push(`${belowHundred(lakh)} Lakh`);
  if (thousand) parts.push(`${belowHundred(thousand)} Thousand`);
  if (rest) parts.push(belowThousand(rest));
  return parts.join(' ');
}

export function amountInWords(paisa: number): string {
  const negative = paisa < 0;
  const abs = Math.abs(Math.round(paisa));
  const rupees = Math.floor(abs / 100);
  const ps = abs % 100;
  let text = `Rupees ${integerInWords(rupees)}`;
  if (ps) text += ` and ${integerInWords(ps)} Paisa`;
  return `${negative ? 'Minus ' : ''}${text} Only`;
}

export function renderTemplate(template: string, vars: Record<string, string | number | null | undefined>): string {
  return template.replace(/\{\{?\s*([a-zA-Z0-9_]+)\s*\}?\}/g, (match, key: string) => {
    if (!(key in vars)) return match;
    const v = vars[key];
    return v === null || v === undefined ? '' : String(v);
  });
}

export function normalizePkPhone(phone: string | null | undefined, format: 'local' | 'international'): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0092')) digits = digits.slice(2);
  if (digits.startsWith('92') && digits.length === 12) digits = `0${digits.slice(2)}`;
  if (digits.length === 10 && digits.startsWith('3')) digits = `0${digits}`;
  if (!/^03\d{9}$/.test(digits)) return null;
  return format === 'international' ? `92${digits.slice(1)}` : digits;
}

export function formatDateDMY(value: string | null | undefined): string {
  if (!value) return '';
  const [y, m, d] = value.slice(0, 10).split('-');
  return d && m && y ? `${d}-${m}-${y}` : value;
}
