import type { AppSettings } from '@pos/shared';
import { ROUNDING_OPTIONS } from '@pos/shared';
import { Button, Card, Checkbox, Field, Input, Select, Textarea } from '../../components/ui';
import { MoneyInput } from '../../components/ui';
import { useSettingsForm } from './useSettingsForm';

export function ShopTab({ settings }: { settings: AppSettings | undefined }) {
  const shop = useSettingsForm(settings, 'shop');
  if (!shop.draft) return null;
  const d = shop.draft;
  return (
    <Card
      title="Shop profile"
      actions={
        <Button variant="primary" size="sm" disabled={!shop.dirty} loading={shop.save.isPending} onClick={() => shop.save.mutate(d)}>
          Save
        </Button>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Shop name" required>
          <Input value={d.name} onChange={(e) => shop.set('name', e.target.value)} />
        </Field>
        <Field label="Tagline" hint="Printed under the shop name on receipts">
          <Input value={d.tagline} onChange={(e) => shop.set('tagline', e.target.value)} />
        </Field>
        <Field label="Address" className="sm:col-span-2">
          <Textarea rows={2} value={d.address} onChange={(e) => shop.set('address', e.target.value)} />
        </Field>
        <Field label="City">
          <Input value={d.city} onChange={(e) => shop.set('city', e.target.value)} />
        </Field>
        <Field label="Email">
          <Input value={d.email} onChange={(e) => shop.set('email', e.target.value)} />
        </Field>
        <Field label="Phone">
          <Input value={d.phone} onChange={(e) => shop.set('phone', e.target.value)} />
        </Field>
        <Field label="Second phone">
          <Input value={d.phone2} onChange={(e) => shop.set('phone2', e.target.value)} />
        </Field>
        <Field label="NTN" hint="National Tax Number, printed on tax invoices">
          <Input value={d.ntn} onChange={(e) => shop.set('ntn', e.target.value)} />
        </Field>
        <Field label="STRN" hint="Sales Tax Registration Number">
          <Input value={d.strn} onChange={(e) => shop.set('strn', e.target.value)} />
        </Field>
      </div>
    </Card>
  );
}

export function SalesTaxTab({ settings }: { settings: AppSettings | undefined }) {
  const tax = useSettingsForm(settings, 'tax');
  const sales = useSettingsForm(settings, 'sales');
  const cash = useSettingsForm(settings, 'cash');
  if (!tax.draft || !sales.draft || !cash.draft) return null;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card
        title="Sales tax (GST)"
        actions={
          <Button variant="primary" size="sm" disabled={!tax.dirty} loading={tax.save.isPending} onClick={() => tax.save.mutate(tax.draft!)}>
            Save
          </Button>
        }
      >
        <div className="space-y-3">
          <Checkbox checked={tax.draft.enabled} onChange={(v) => tax.set('enabled', v)} label="Charge sales tax (GST)" description="Turn off if the shop is not registered for sales tax" />
          <Checkbox
            checked={tax.draft.pricesIncludeTax}
            onChange={(v) => tax.set('pricesIncludeTax', v)}
            label="Product prices already include GST"
            description="Typical for retail in Pakistan. When off, GST is added on top of the price."
          />
          <p className="rounded-md bg-slate-50 p-3 text-xs text-slate-600">
            GST rates are managed per product under Categories &amp; Units → Tax rates. The default rate is applied to new products.
          </p>
        </div>
      </Card>
      <Card
        title="Selling rules"
        actions={
          <Button variant="primary" size="sm" disabled={!sales.dirty} loading={sales.save.isPending} onClick={() => sales.save.mutate(sales.draft!)}>
            Save
          </Button>
        }
      >
        <div className="space-y-3">
          <Checkbox checked={sales.draft.allowCredit} onChange={(v) => sales.set('allowCredit', v)} label="Allow credit sales (udhaar)" description="Unpaid balance goes to the customer khata" />
          <Checkbox
            checked={sales.draft.allowNegativeStock}
            onChange={(v) => sales.set('allowNegativeStock', v)}
            label="Allow selling below available stock"
            description="Useful for sand and crush delivered directly from the yard"
          />
          <Field label="Round bill totals to">
            <Select value={sales.draft.roundingUnit} onChange={(e) => sales.set('roundingUnit', Number(e.target.value))}>
              {ROUNDING_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Walk-in customer label">
            <Input value={sales.draft.walkInLabel} onChange={(e) => sales.set('walkInLabel', e.target.value)} />
          </Field>
        </div>
      </Card>
      <Card
        title="Cash"
        actions={
          <Button variant="primary" size="sm" disabled={!cash.dirty} loading={cash.save.isPending} onClick={() => cash.save.mutate(cash.draft!)}>
            Save
          </Button>
        }
      >
        <Field label="Opening cash in drawer" hint="Cash that was in the shop when you started using this system">
          <MoneyInput value={cash.draft.openingBalance} onChange={(v) => cash.set('openingBalance', v ?? 0)} />
        </Field>
      </Card>
    </div>
  );
}
