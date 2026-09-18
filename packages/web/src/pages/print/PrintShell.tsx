import { useEffect, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { AppSettings } from '@pos/shared';
import { Button } from '../../components/ui';

export function usePrintReady(ready: boolean) {
  const [params] = useSearchParams();
  const auto = params.get('autoprint') === '1';
  useEffect(() => {
    if (!ready || !auto) return;
    const t = setTimeout(() => window.print(), 350);
    return () => clearTimeout(t);
  }, [ready, auto]);
}

export function PrintShell({ css, ready, children }: { css: string; ready: boolean; children: ReactNode }) {
  const [params] = useSearchParams();
  usePrintReady(ready);
  const embedded = params.get('embedded') === '1';
  return (
    <>
      <style>{`
        @media print { .no-print { display: none !important; } }
        ${css}
      `}</style>
      {!embedded && (
        <div className="no-print flex justify-center gap-2 bg-slate-100 p-3">
          <Button variant="primary" onClick={() => window.print()}>
            Print
          </Button>
          <Button onClick={() => window.close()}>Close</Button>
        </div>
      )}
      <div className="flex justify-center bg-slate-100 py-4 print:bg-white print:py-0">{children}</div>
    </>
  );
}

export function ShopHeader({ settings, title, compact }: { settings: AppSettings; title: string; compact?: boolean }) {
  const s = settings.shop;
  if (compact) {
    return (
      <div className="text-center">
        <p className="text-[13pt] font-bold leading-tight">{s.name}</p>
        {s.tagline && <p className="text-[8pt]">{s.tagline}</p>}
        {s.address && <p className="text-[8pt] leading-tight">{s.address}{s.city ? `, ${s.city}` : ''}</p>}
        <p className="text-[8pt]">{[s.phone, s.phone2].filter(Boolean).join(' / ')}</p>
        {(s.ntn || s.strn) && (
          <p className="text-[8pt]">
            {s.ntn && `NTN ${s.ntn}`} {s.strn && `STRN ${s.strn}`}
          </p>
        )}
        <p className="mt-1 border-y border-dashed border-black py-0.5 text-[10pt] font-bold uppercase">{title}</p>
      </div>
    );
  }
  return (
    <div className="flex items-start justify-between border-b-2 border-slate-800 pb-3">
      <div>
        <h1 className="text-2xl font-bold">{s.name}</h1>
        {s.tagline && <p className="text-sm text-slate-600">{s.tagline}</p>}
        <p className="mt-1 text-xs text-slate-600">
          {s.address}
          {s.city ? `, ${s.city}` : ''}
        </p>
        <p className="text-xs text-slate-600">
          {[s.phone, s.phone2].filter(Boolean).join(' · ')}
          {s.email ? ` · ${s.email}` : ''}
        </p>
        {(s.ntn || s.strn) && (
          <p className="text-xs text-slate-600">
            {s.ntn && `NTN: ${s.ntn}`} {s.strn && ` · STRN: ${s.strn}`}
          </p>
        )}
      </div>
      <div className="text-right">
        <h2 className="text-xl font-bold uppercase tracking-wide">{title}</h2>
      </div>
    </div>
  );
}

export const A4_CSS = `
  @page { size: A4; margin: 12mm; }
  .a4-doc { width: 186mm; background: white; padding: 0; color: #0f172a; }
  @media screen { .a4-doc { box-shadow: 0 1px 6px rgba(0,0,0,.15); padding: 10mm; } }
`;

export const thermalCss = (width: 58 | 80) => `
  @page { size: ${width}mm auto; margin: ${width === 80 ? 3 : 2}mm; }
  .slip { width: ${width === 80 ? 74 : 54}mm; background: white; color: #000; font-size: 9pt; line-height: 1.25; }
  @media screen { .slip { box-shadow: 0 1px 6px rgba(0,0,0,.15); padding: 4mm; } }
`;
