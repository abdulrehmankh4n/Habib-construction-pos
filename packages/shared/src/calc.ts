export interface LineInput {
  qty: number;
  unitPrice: number;
  discount: number;
  taxRate: number;
}

export interface TotalsInput {
  lines: LineInput[];
  billDiscount: number;
  deliveryCharges: number;
  labourCharges: number;
  taxEnabled: boolean;
  pricesIncludeTax: boolean;
  roundingUnit: number;
}

export interface LineTotals {
  gross: number;
  discount: number;
  billDiscountShare: number;
  net: number;
  taxRate: number;
  taxableValue: number;
  taxAmount: number;
  total: number;
}

export interface Totals {
  lines: LineTotals[];
  subtotal: number;
  itemDiscount: number;
  billDiscount: number;
  taxableValue: number;
  taxTotal: number;
  deliveryCharges: number;
  labourCharges: number;
  roundOff: number;
  grandTotal: number;
}

export const QTY_DECIMALS = 3;

export function roundQty(qty: number): number {
  return Math.round(qty * 10 ** QTY_DECIMALS) / 10 ** QTY_DECIMALS;
}

export function lineGross(qty: number, unitPrice: number): number {
  return Math.round(roundQty(qty) * unitPrice);
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

function nonNegativeInt(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

export function allocate(amount: number, weights: number[]): number[] {
  const totalWeight = sum(weights);
  if (amount <= 0 || totalWeight <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (amount * w) / totalWeight);
  const result = raw.map(Math.floor);
  let remainder = amount - sum(result);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; k < order.length && remainder > 0; k++) {
    result[order[k].i] += 1;
    remainder--;
  }
  return result;
}

export function taxFromInclusive(amount: number, rate: number): number {
  if (rate <= 0) return 0;
  return Math.round((amount * rate) / (100 + rate));
}

export function taxFromExclusive(amount: number, rate: number): number {
  if (rate <= 0) return 0;
  return Math.round((amount * rate) / 100);
}

export function calculateTotals(input: TotalsInput): Totals {
  const grossList = input.lines.map((l) => nonNegativeInt(lineGross(l.qty, l.unitPrice)));
  const discounts = input.lines.map((l, i) => Math.min(nonNegativeInt(l.discount), grossList[i]));
  const afterLineDiscount = grossList.map((g, i) => g - discounts[i]);
  const billDiscount = Math.min(nonNegativeInt(input.billDiscount), sum(afterLineDiscount));
  const shares = allocate(billDiscount, afterLineDiscount);

  const lines: LineTotals[] = input.lines.map((l, i) => {
    const net = afterLineDiscount[i] - shares[i];
    const rate = input.taxEnabled ? Math.max(0, l.taxRate) : 0;
    let taxAmount: number;
    let taxableValue: number;
    let total: number;
    if (rate === 0) {
      taxAmount = 0;
      taxableValue = net;
      total = net;
    } else if (input.pricesIncludeTax) {
      taxAmount = taxFromInclusive(net, rate);
      taxableValue = net - taxAmount;
      total = net;
    } else {
      taxAmount = taxFromExclusive(net, rate);
      taxableValue = net;
      total = net + taxAmount;
    }
    return {
      gross: grossList[i],
      discount: discounts[i],
      billDiscountShare: shares[i],
      net,
      taxRate: rate,
      taxableValue,
      taxAmount,
      total,
    };
  });

  const deliveryCharges = nonNegativeInt(input.deliveryCharges);
  const labourCharges = nonNegativeInt(input.labourCharges);
  const beforeRounding = sum(lines.map((l) => l.total)) + deliveryCharges + labourCharges;
  const unit = Math.max(1, nonNegativeInt(input.roundingUnit));
  const grandTotal = Math.round(beforeRounding / unit) * unit;

  return {
    lines,
    subtotal: sum(grossList),
    itemDiscount: sum(discounts),
    billDiscount,
    taxableValue: sum(lines.map((l) => l.taxableValue)),
    taxTotal: sum(lines.map((l) => l.taxAmount)),
    deliveryCharges,
    labourCharges,
    roundOff: grandTotal - beforeRounding,
    grandTotal,
  };
}

export function proportional(amount: number, part: number, whole: number): number {
  if (whole <= 0) return 0;
  if (part >= whole) return amount;
  return Math.round((amount * part) / whole);
}
