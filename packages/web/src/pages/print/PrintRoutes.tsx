import { useEffect, useState } from 'react';
import { Route, Routes, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { CreditAgreement, LedgerStatement, Payment, Product, Quotation, Sale, SaleReturn, ZakatReport } from '@pos/shared';
import { api } from '../../lib/api';
import { useSettings } from '../../lib/auth';
import { Spinner } from '../../components/ui';
import { A4_CSS, PrintShell, thermalCss } from './PrintShell';
import { SaleReceipt } from './SaleReceipt';
import { SaleInvoiceA4 } from './SaleInvoiceA4';
import { DeliveryChallan } from './DeliveryChallan';
import { QuotationPrint } from './QuotationPrint';
import { StatementPrint } from './StatementPrint';
import { AgreementPrint, agreementCss } from './AgreementPrint';
import { PaymentReceiptSlip, ReturnSlip, ZakatPrint } from './SmallPrints';
import { LABEL_JOB_KEY, ProductLabel, type LabelJob } from '../LabelsPage';

function SalePrintPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const format = params.get('format') ?? 'thermal80';
  const settings = useSettings();
  const sale = useQuery({ queryKey: ['sales', 'print', id], queryFn: () => api.get<Sale>(`/sales/${id}`) });
  const ready = !!sale.data && !!settings.data;
  const css = format === 'a4' || format === 'challan' ? A4_CSS : thermalCss(format === 'thermal58' ? 58 : 80);
  return (
    <PrintShell css={css} ready={ready}>
      {!ready ? (
        <Spinner />
      ) : format === 'a4' ? (
        <SaleInvoiceA4 sale={sale.data!} settings={settings.data!} />
      ) : format === 'challan' ? (
        <DeliveryChallan sale={sale.data!} settings={settings.data!} />
      ) : (
        <SaleReceipt sale={sale.data!} settings={settings.data!} />
      )}
    </PrintShell>
  );
}

function ReturnPrintPage() {
  const { id } = useParams();
  const settings = useSettings();
  const ret = useQuery({ queryKey: ['sales', 'return-print', id], queryFn: () => api.get<SaleReturn>(`/sales/returns/${id}`) });
  const ready = !!ret.data && !!settings.data;
  return (
    <PrintShell css={thermalCss(80)} ready={ready}>
      {ready ? <ReturnSlip ret={ret.data!} settings={settings.data!} /> : <Spinner />}
    </PrintShell>
  );
}

function QuotationPrintPage() {
  const { id } = useParams();
  const settings = useSettings();
  const q = useQuery({ queryKey: ['quotations', 'print', id], queryFn: () => api.get<Quotation>(`/quotations/${id}`) });
  const ready = !!q.data && !!settings.data;
  return <PrintShell css={A4_CSS} ready={ready}>{ready ? <QuotationPrint quotation={q.data!} settings={settings.data!} /> : <Spinner />}</PrintShell>;
}

function StatementPrintPage() {
  const { party, id } = useParams();
  const [params] = useSearchParams();
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const settings = useSettings();
  const kind = party === 'supplier' ? 'suppliers' : 'customers';
  const statement = useQuery({
    queryKey: [kind, 'statement-print', id, from, to],
    queryFn: () => api.get<LedgerStatement>(`/${kind}/${id}/statement`, { from, to }),
  });
  const ready = !!statement.data && !!settings.data;
  return (
    <PrintShell css={A4_CSS} ready={ready}>
      {ready ? <StatementPrint statement={statement.data!} settings={settings.data!} party={party === 'supplier' ? 'supplier' : 'customer'} /> : <Spinner />}
    </PrintShell>
  );
}

function PaymentPrintPage() {
  const { id } = useParams();
  const settings = useSettings();
  const payment = useQuery({ queryKey: ['payments', 'print', id], queryFn: () => api.get<Payment>(`/payments/${id}`) });
  const ready = !!payment.data && !!settings.data;
  return (
    <PrintShell css={thermalCss(80)} ready={ready}>
      {ready ? <PaymentReceiptSlip payment={payment.data!} settings={settings.data!} /> : <Spinner />}
    </PrintShell>
  );
}

function AgreementPrintPage() {
  const { id } = useParams();
  const settings = useSettings();
  const agreement = useQuery({ queryKey: ['agreements', 'print', id], queryFn: () => api.get<CreditAgreement>(`/agreements/${id}`) });
  const ready = !!agreement.data && !!settings.data;
  return (
    <PrintShell css={agreementCss(settings.data)} ready={ready}>
      {ready ? <AgreementPrint agreement={agreement.data!} settings={settings.data!} /> : <Spinner />}
    </PrintShell>
  );
}

function ZakatPrintPage() {
  const { id } = useParams();
  const settings = useSettings();
  const report = useQuery({ queryKey: ['zakat', 'print', id], queryFn: () => api.get<ZakatReport>(`/zakat/reports/${id}`) });
  const ready = !!report.data && !!settings.data;
  return <PrintShell css={A4_CSS} ready={ready}>{ready ? <ZakatPrint report={report.data!} settings={settings.data!} /> : <Spinner />}</PrintShell>;
}

function LabelsPrintPage() {
  const settings = useSettings();
  const [job, setJob] = useState<LabelJob | null>(null);
  const [products, setProducts] = useState<Record<number, Product>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let parsed: LabelJob | null = null;
      try {
        const raw = localStorage.getItem(LABEL_JOB_KEY);
        parsed = raw ? (JSON.parse(raw) as LabelJob) : null;
      } catch {
        parsed = null;
      }
      if (!parsed) {
        setLoaded(true);
        return;
      }
      const list = await Promise.all(parsed.entries.map((e) => api.get<Product>(`/products/${e.productId}`)));
      if (cancelled) return;
      setProducts(Object.fromEntries(list.map((p) => [p.id, p])));
      setJob(parsed);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const labels = job ? job.entries.flatMap((e) => Array.from({ length: Math.max(0, e.copies) }, () => products[e.productId]).filter(Boolean)) : [];
  const css =
    job?.layout === 'roll'
      ? `@page { size: 50mm 30mm; margin: 0; } .labels { display: block; }`
      : `@page { size: A4; margin: 10mm 7mm; } .labels { display: grid; grid-template-columns: repeat(3, 63.5mm); column-gap: 2.5mm; }`;

  return (
    <PrintShell css={css} ready={loaded && labels.length > 0}>
      {!loaded ? (
        <Spinner />
      ) : !labels.length ? (
        <p className="p-6 text-sm text-slate-600">No labels to print. Go back to Barcode / QR labels and select products.</p>
      ) : (
        <div className="labels bg-white">
          {labels.map((p, i) => (
            <ProductLabel key={`${p.id}-${i}`} product={p} code={job!.code} showPrice={job!.showPrice} shopName={settings.data?.shop.name ?? ''} layout={job!.layout} />
          ))}
        </div>
      )}
    </PrintShell>
  );
}

export function PrintRoutes() {
  return (
    <Routes>
      <Route path="sale/:id" element={<SalePrintPage />} />
      <Route path="return/:id" element={<ReturnPrintPage />} />
      <Route path="quotation/:id" element={<QuotationPrintPage />} />
      <Route path="statement/:party/:id" element={<StatementPrintPage />} />
      <Route path="payment/:id" element={<PaymentPrintPage />} />
      <Route path="agreement/:id" element={<AgreementPrintPage />} />
      <Route path="zakat/:id" element={<ZakatPrintPage />} />
      <Route path="labels" element={<LabelsPrintPage />} />
      <Route path="*" element={<p className="p-6 text-sm text-slate-600">Unknown document</p>} />
    </Routes>
  );
}
