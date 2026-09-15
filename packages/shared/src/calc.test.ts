import { describe, expect, it } from 'vitest';
import { allocate, calculateTotals, lineGross, proportional, roundQty } from './calc';

const base = {
  billDiscount: 0,
  deliveryCharges: 0,
  labourCharges: 0,
  taxEnabled: true,
  pricesIncludeTax: true,
  roundingUnit: 1,
};

describe('roundQty / lineGross', () => {
  it('rounds quantities to 3 decimals', () => {
    expect(roundQty(1.23456)).toBe(1.235);
    expect(roundQty(0.1 + 0.2)).toBe(0.3);
  });

  it('computes gross in minor units', () => {
    expect(lineGross(13.3, 26550)).toBe(353115);
    expect(lineGross(3, 145000)).toBe(435000);
  });
});

describe('allocate', () => {
  it('distributes exactly using largest remainder', () => {
    const parts = allocate(100, [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(100);
    expect(parts).toEqual([34, 33, 33]);
  });

  it('returns zeros when nothing to allocate', () => {
    expect(allocate(0, [5, 5])).toEqual([0, 0]);
    expect(allocate(10, [0, 0])).toEqual([0, 0]);
  });

  it('is proportional to weights', () => {
    expect(allocate(1000, [3000, 1000])).toEqual([750, 250]);
  });
});

describe('calculateTotals', () => {
  it('extracts GST from tax-inclusive prices', () => {
    const t = calculateTotals({ ...base, lines: [{ qty: 1, unitPrice: 118000, discount: 0, taxRate: 18 }] });
    expect(t.grandTotal).toBe(118000);
    expect(t.taxTotal).toBe(18000);
    expect(t.taxableValue).toBe(100000);
  });

  it('adds GST on tax-exclusive prices', () => {
    const t = calculateTotals({
      ...base,
      pricesIncludeTax: false,
      lines: [{ qty: 2, unitPrice: 50000, discount: 0, taxRate: 18 }],
    });
    expect(t.subtotal).toBe(100000);
    expect(t.taxTotal).toBe(18000);
    expect(t.grandTotal).toBe(118000);
  });

  it('ignores tax when tax is disabled', () => {
    const t = calculateTotals({
      ...base,
      taxEnabled: false,
      pricesIncludeTax: false,
      lines: [{ qty: 1, unitPrice: 100000, discount: 0, taxRate: 18 }],
    });
    expect(t.taxTotal).toBe(0);
    expect(t.grandTotal).toBe(100000);
  });

  it('applies line and bill discounts before tax and allocates bill discount', () => {
    const t = calculateTotals({
      ...base,
      pricesIncludeTax: false,
      billDiscount: 10000,
      lines: [
        { qty: 1, unitPrice: 300000, discount: 0, taxRate: 18 },
        { qty: 1, unitPrice: 110000, discount: 10000, taxRate: 0 },
      ],
    });
    expect(t.itemDiscount).toBe(10000);
    expect(t.lines[0].billDiscountShare).toBe(7500);
    expect(t.lines[1].billDiscountShare).toBe(2500);
    expect(t.lines[0].taxAmount).toBe(Math.round(292500 * 0.18));
    expect(t.grandTotal).toBe(292500 + 52650 + 97500);
  });

  it('adds delivery and labour charges and rounds the grand total', () => {
    const t = calculateTotals({
      ...base,
      taxEnabled: false,
      deliveryCharges: 150000,
      labourCharges: 50000,
      roundingUnit: 100,
      lines: [{ qty: 13.3, unitPrice: 26550, discount: 0, taxRate: 0 }],
    });
    expect(t.subtotal).toBe(353115);
    expect(t.grandTotal).toBe(553100);
    expect(t.roundOff).toBe(-15);
  });

  it('clamps discounts that exceed the value', () => {
    const t = calculateTotals({
      ...base,
      billDiscount: 999999,
      lines: [{ qty: 1, unitPrice: 5000, discount: 6000, taxRate: 18 }],
    });
    expect(t.itemDiscount).toBe(5000);
    expect(t.billDiscount).toBe(0);
    expect(t.grandTotal).toBe(0);
  });

  it('handles an empty cart', () => {
    const t = calculateTotals({ ...base, lines: [] });
    expect(t.grandTotal).toBe(0);
    expect(t.lines).toEqual([]);
  });
});

describe('proportional', () => {
  it('returns the full amount for a full share', () => {
    expect(proportional(1234, 5, 5)).toBe(1234);
  });

  it('scales partial shares', () => {
    expect(proportional(1000, 1, 3)).toBe(333);
  });
});
