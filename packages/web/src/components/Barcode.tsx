import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

export function Barcode({ value, height = 36, width = 1.3, fontSize = 11, displayValue = true }: { value: string; height?: number; width?: number; fontSize?: number; displayValue?: boolean }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current || !value) return;
    try {
      JsBarcode(ref.current, value, { format: 'CODE128', height, width, fontSize, displayValue, margin: 0, background: 'transparent' });
    } catch {
      ref.current.innerHTML = '';
    }
  }, [value, height, width, fontSize, displayValue]);
  return <svg ref={ref} className="max-w-full" />;
}
