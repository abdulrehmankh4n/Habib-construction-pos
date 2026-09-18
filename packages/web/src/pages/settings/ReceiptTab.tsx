import type { AppSettings } from '@pos/shared';
import { Button, Card, Checkbox, Field, Input, Select, Textarea } from '../../components/ui';
import { useSettingsForm } from './useSettingsForm';

export function ReceiptTab({ settings }: { settings: AppSettings | undefined }) {
  const receipt = useSettingsForm(settings, 'receipt');
  const quotation = useSettingsForm(settings, 'quotation');
  if (!receipt.draft || !quotation.draft) return null;
  const d = receipt.draft;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card
        title="Receipt & invoice printing"
        actions={
          <Button variant="primary" size="sm" disabled={!receipt.dirty} loading={receipt.save.isPending} onClick={() => receipt.save.mutate(d)}>
            Save
          </Button>
        }
      >
        <div className="space-y-3">
          <Field label="Default receipt size">
            <Select value={d.paper} onChange={(e) => receipt.set('paper', e.target.value as AppSettings['receipt']['paper'])}>
              <option value="thermal80">Thermal 80 mm (standard POS printer)</option>
              <option value="thermal58">Thermal 58 mm (small printer)</option>
              <option value="a4">A4 invoice</option>
            </Select>
          </Field>
          <Checkbox checked={d.autoPrint} onChange={(v) => receipt.set('autoPrint', v)} label="Print automatically after each sale" description="Opens the print dialog as soon as the sale is completed" />
          <Checkbox checked={d.showUrduNames} onChange={(v) => receipt.set('showUrduNames', v)} label="Show Urdu product names on receipts" />
          <Field label="Receipt footer (English)">
            <Input value={d.footer} onChange={(e) => receipt.set('footer', e.target.value)} />
          </Field>
          <Field label="Receipt footer (Urdu)">
            <Input className="urdu text-right" dir="rtl" value={d.urduFooter} onChange={(e) => receipt.set('urduFooter', e.target.value)} />
          </Field>
          <Field label="Invoice terms & conditions">
            <Textarea rows={3} value={d.terms} onChange={(e) => receipt.set('terms', e.target.value)} />
          </Field>
        </div>
      </Card>
      <Card
        title="Quotations"
        actions={
          <Button variant="primary" size="sm" disabled={!quotation.dirty} loading={quotation.save.isPending} onClick={() => quotation.save.mutate(quotation.draft!)}>
            Save
          </Button>
        }
      >
        <div className="space-y-3">
          <Field label="Quotation validity (days)">
            <Input type="number" min={1} max={365} value={quotation.draft.validityDays} onChange={(e) => quotation.set('validityDays', Number(e.target.value))} />
          </Field>
          <Field label="Quotation terms">
            <Textarea rows={4} value={quotation.draft.terms} onChange={(e) => quotation.set('terms', e.target.value)} />
          </Field>
        </div>
      </Card>
    </div>
  );
}
