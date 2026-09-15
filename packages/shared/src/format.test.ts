import { describe, expect, it } from 'vitest';
import { amountInWords, formatRupees, normalizePkPhone, renderTemplate } from './format';

describe('formatRupees', () => {
  it('formats whole and fractional rupees', () => {
    expect(formatRupees(145000)).toBe('Rs 1,450');
    expect(formatRupees(26550)).toBe('Rs 265.50');
    expect(formatRupees(-5000)).toBe('Rs -50');
  });
});

describe('amountInWords', () => {
  it('uses the lakh / crore system', () => {
    expect(amountInWords(12545000)).toBe('Rupees One Lakh Twenty Five Thousand Four Hundred Fifty Only');
    expect(amountInWords(2500000000)).toBe('Rupees Two Crore Fifty Lakh Only');
    expect(amountInWords(105050)).toBe('Rupees One Thousand Fifty and Fifty Paisa Only');
    expect(amountInWords(0)).toBe('Rupees Zero Only');
  });
});

describe('normalizePkPhone', () => {
  it('normalises Pakistani mobile numbers', () => {
    expect(normalizePkPhone('0300-1234567', 'international')).toBe('923001234567');
    expect(normalizePkPhone('+92 300 1234567', 'local')).toBe('03001234567');
    expect(normalizePkPhone('3001234567', 'local')).toBe('03001234567');
    expect(normalizePkPhone('042-111-222', 'local')).toBeNull();
  });
});

describe('renderTemplate', () => {
  it('replaces single and double brace placeholders', () => {
    expect(renderTemplate('Hi {name}, due {{amount}} {unknown}', { name: 'Ali', amount: 'Rs 500' })).toBe(
      'Hi Ali, due Rs 500 {unknown}',
    );
  });
});
