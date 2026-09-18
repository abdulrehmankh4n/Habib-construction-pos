import { amountInWords, formatDateDMY, formatRupees, renderTemplate, type AppSettings, type CreditAgreement } from '@pos/shared';
import { money } from '../../lib/format';

function Signatures({ agreement, settings, urdu }: { agreement: CreditAgreement; settings: AppSettings; urdu: boolean }) {
  return (
    <div className="mt-10 space-y-8 text-[10pt]">
      <div className="flex justify-between gap-8">
        <div className="flex-1">
          <div className="mb-1 h-12 border-b border-slate-500" />
          <p className="font-semibold">{urdu ? 'دستخط / انگوٹھا: خریدار' : 'Signature / thumb impression: Buyer'}</p>
          <p>{agreement.customerName}</p>
          <p>CNIC: {agreement.cnic}</p>
        </div>
        <div className="flex-1">
          <div className="mb-1 h-12 border-b border-slate-500" />
          <p className="font-semibold">{urdu ? 'دستخط: فروخت کنندہ' : 'Signature: Seller'}</p>
          <p>{settings.shop.name}</p>
          {settings.shop.ntn && <p>NTN: {settings.shop.ntn}</p>}
        </div>
      </div>
      <div className="flex justify-between gap-8">
        <div className="flex-1">
          <div className="mb-1 h-12 border-b border-slate-500" />
          <p className="font-semibold">{urdu ? 'گواہ نمبر 1' : 'Witness 1'}</p>
          <p>{agreement.witness1Name ?? '______________________'}</p>
          <p>CNIC: {agreement.witness1Cnic ?? '______________________'}</p>
        </div>
        <div className="flex-1">
          <div className="mb-1 h-12 border-b border-slate-500" />
          <p className="font-semibold">{urdu ? 'گواہ نمبر 2' : 'Witness 2'}</p>
          <p>{agreement.witness2Name ?? '______________________'}</p>
          <p>CNIC: {agreement.witness2Cnic ?? '______________________'}</p>
        </div>
      </div>
    </div>
  );
}

export function AgreementPrint({ agreement, settings }: { agreement: CreditAgreement; settings: AppSettings }) {
  const days = Math.max(0, Math.round((Date.parse(agreement.dueDate) - Date.parse(agreement.agreementDate.slice(0, 10))) / 86_400_000));
  const vars = {
    agreementNo: agreement.agreementNo,
    date: formatDateDMY(agreement.agreementDate),
    customerName: agreement.customerName,
    fatherName: agreement.fatherName ?? '____________',
    cnic: agreement.cnic ?? '____________',
    phone: agreement.phone ?? '____________',
    address: agreement.address ?? '____________',
    amount: formatRupees(agreement.amount),
    amountNumber: formatRupees(agreement.amount, false),
    amountWords: amountInWords(agreement.amount),
    dueDate: formatDateDMY(agreement.dueDate),
    days,
    installments: agreement.installments,
    installmentClause:
      agreement.installments > 1 ? `, in ${agreement.installments} instalments of about ${money(Math.ceil(agreement.amount / agreement.installments / 100) * 100)} each` : '',
    terms: agreement.terms ?? '',
    shopName: settings.shop.name,
    shopAddress: settings.shop.address,
    shopCity: settings.shop.city,
  };
  const tidy = (text: string) => text.replace(/  +/g, ' ').replace(/ +([,.])/g, '$1').replace(/, ,/g, ',');
  const english = tidy(renderTemplate(settings.agreement.englishTemplate, vars));
  const urdu = tidy(renderTemplate(settings.agreement.urduTemplate, vars));
  const lang = settings.agreement.language;

  return (
    <div className="agreement-doc bg-white text-slate-900">
      <div className="agreement-top" />
      <div className="text-center">
        <p className="text-[9pt] text-slate-500">Agreement No. {agreement.agreementNo}</p>
        {lang !== 'urdu' && <h1 className="text-[15pt] font-bold uppercase tracking-wide">Agreement for Payment of Outstanding Amount</h1>}
        {lang !== 'english' && <h1 className="urdu text-[18pt] font-bold">اقرار نامہ برائے ادائیگی بقایا رقم</h1>}
      </div>
      {lang !== 'english' && <div className="urdu mt-5 whitespace-pre-wrap text-[13pt] leading-[2.1]">{urdu}</div>}
      {lang === 'bilingual' && <hr className="my-5 border-slate-300" />}
      {lang !== 'urdu' && <div className="mt-5 whitespace-pre-wrap text-[11pt] leading-relaxed">{english}</div>}
      <Signatures agreement={agreement} settings={settings} urdu={lang === 'urdu'} />
      <p className="mt-6 text-center text-[8pt] text-slate-500">
        This document is generated from {settings.shop.name} POS records on {formatDateDMY(agreement.createdAt)} and should be executed on judicial stamp paper of the applicable value.
      </p>
    </div>
  );
}

export const agreementCss = (settings: AppSettings | undefined) => `
  @page { size: ${settings?.agreement.paperSize === 'a4' ? 'A4' : '8.5in 14in'}; margin: 0.6in; }
  .agreement-doc { width: ${settings?.agreement.paperSize === 'a4' ? '190mm' : '7.3in'}; background: white; }
  .agreement-top { height: ${settings?.agreement.topMarginInches ?? 4.5}in; }
  @media screen { .agreement-doc { box-shadow: 0 1px 6px rgba(0,0,0,.15); padding: 0.6in; } .agreement-top { background: repeating-linear-gradient(45deg, #f8fafc, #f8fafc 10px, #f1f5f9 10px, #f1f5f9 20px); border: 1px dashed #cbd5e1; position: relative; } }
`;
