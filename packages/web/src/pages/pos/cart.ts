import {
  calculateTotals,
  lineGross,
  resolveUnit,
  roundQty,
  tierPrice,
  type AppSettings,
  type Customer,
  type PriceTier,
  type Product,
  type Totals,
} from '@pos/shared';

export interface CartLine {
  key: string;
  product: Product;
  unitId: number;
  qty: number;
  unitPrice: number;
  discount: number;
  priceEdited: boolean;
}

export interface DeliveryInfo {
  required: boolean;
  address: string;
  vehicleNo: string;
  driverName: string;
  driverPhone: string;
}

export interface CartState {
  mode: 'sale' | 'quotation';
  lines: CartLine[];
  customer: Customer | null;
  walkInName: string;
  walkInPhone: string;
  priceTier: PriceTier;
  billDiscount: number;
  billDiscountPercent: number | null;
  deliveryCharges: number;
  labourCharges: number;
  notes: string;
  delivery: DeliveryInfo;
  quotationId: number | null;
  editQuotationId: number | null;
  heldBillId: number | null;
}

export const emptyDelivery: DeliveryInfo = { required: false, address: '', vehicleNo: '', driverName: '', driverPhone: '' };

export const emptyCart: CartState = {
  mode: 'sale',
  lines: [],
  customer: null,
  walkInName: '',
  walkInPhone: '',
  priceTier: 'retail',
  billDiscount: 0,
  billDiscountPercent: null,
  deliveryCharges: 0,
  labourCharges: 0,
  notes: '',
  delivery: emptyDelivery,
  quotationId: null,
  editQuotationId: null,
  heldBillId: null,
};

export type CartAction =
  | { type: 'add'; product: Product; unitId?: number; qty?: number; unitPrice?: number }
  | { type: 'qty'; key: string; qty: number }
  | { type: 'unit'; key: string; unitId: number }
  | { type: 'price'; key: string; unitPrice: number }
  | { type: 'discount'; key: string; discount: number }
  | { type: 'remove'; key: string }
  | { type: 'customer'; customer: Customer | null }
  | { type: 'tier'; tier: PriceTier }
  | { type: 'set'; patch: Partial<CartState> }
  | { type: 'refreshProduct'; product: Product }
  | { type: 'load'; state: CartState }
  | { type: 'clear'; keepMode?: boolean };

let seq = 0;
const newKey = () => `${Date.now().toString(36)}-${(seq++).toString(36)}`;

export function priceFor(product: Product, unitId: number, tier: PriceTier): number {
  const unit = resolveUnit(product, unitId);
  return unit ? tierPrice(unit, tier) : product.salePrice;
}

function reprice(lines: CartLine[], tier: PriceTier): CartLine[] {
  return lines.map((l) => (l.priceEdited ? l : { ...l, unitPrice: priceFor(l.product, l.unitId, tier) }));
}

export function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'add': {
      const unitId = action.unitId ?? action.product.unitId;
      const addQty = action.qty ?? 1;
      const existing = state.lines.find((l) => l.product.id === action.product.id && l.unitId === unitId && action.unitPrice === undefined);
      if (existing) {
        return {
          ...state,
          lines: state.lines.map((l) => (l.key === existing.key ? { ...l, qty: roundQty(l.qty + addQty), product: action.product } : l)),
        };
      }
      const line: CartLine = {
        key: newKey(),
        product: action.product,
        unitId,
        qty: addQty,
        unitPrice: action.unitPrice ?? priceFor(action.product, unitId, state.priceTier),
        discount: 0,
        priceEdited: action.unitPrice !== undefined,
      };
      return { ...state, lines: [...state.lines, line] };
    }
    case 'qty':
      return { ...state, lines: state.lines.map((l) => (l.key === action.key ? { ...l, qty: action.qty } : l)) };
    case 'unit':
      return {
        ...state,
        lines: state.lines.map((l) =>
          l.key === action.key
            ? { ...l, unitId: action.unitId, unitPrice: priceFor(l.product, action.unitId, state.priceTier), priceEdited: false, discount: 0 }
            : l,
        ),
      };
    case 'price':
      return { ...state, lines: state.lines.map((l) => (l.key === action.key ? { ...l, unitPrice: action.unitPrice, priceEdited: true } : l)) };
    case 'discount':
      return { ...state, lines: state.lines.map((l) => (l.key === action.key ? { ...l, discount: action.discount } : l)) };
    case 'remove':
      return { ...state, lines: state.lines.filter((l) => l.key !== action.key) };
    case 'customer': {
      const tier = action.customer?.priceTier ?? 'retail';
      return {
        ...state,
        customer: action.customer,
        priceTier: tier,
        lines: tier !== state.priceTier ? reprice(state.lines, tier) : state.lines,
        delivery: action.customer && !state.delivery.address ? { ...state.delivery, address: action.customer.address ?? '' } : state.delivery,
      };
    }
    case 'tier':
      return { ...state, priceTier: action.tier, lines: reprice(state.lines, action.tier) };
    case 'set':
      return { ...state, ...action.patch };
    case 'refreshProduct':
      return { ...state, lines: state.lines.map((l) => (l.product.id === action.product.id ? { ...l, product: action.product } : l)) };
    case 'load':
      return action.state;
    case 'clear':
      return { ...emptyCart, mode: action.keepMode ? state.mode : 'sale' };
    default:
      return state;
  }
}

export function effectiveBillDiscount(state: CartState): number {
  if (state.billDiscountPercent === null) return state.billDiscount;
  const base = state.lines.reduce((s, l) => s + Math.max(0, lineGross(l.qty, l.unitPrice) - l.discount), 0);
  return Math.round((base * state.billDiscountPercent) / 100);
}

export function computeTotals(state: CartState, settings: AppSettings | undefined): Totals {
  return calculateTotals({
    lines: state.lines.map((l) => ({ qty: l.qty, unitPrice: l.unitPrice, discount: l.discount, taxRate: l.product.taxRate })),
    billDiscount: effectiveBillDiscount(state),
    deliveryCharges: state.deliveryCharges,
    labourCharges: state.labourCharges,
    taxEnabled: settings?.tax.enabled ?? false,
    pricesIncludeTax: settings?.tax.pricesIncludeTax ?? true,
    roundingUnit: settings?.sales.roundingUnit ?? 1,
  });
}

export function cartPayload(state: CartState, billDiscount: number) {
  return {
    customerId: state.customer?.id ?? null,
    customerName: state.customer ? null : state.walkInName || null,
    customerPhone: state.customer ? null : state.walkInPhone || null,
    priceTier: state.priceTier,
    items: state.lines.map((l) => ({ productId: l.product.id, unitId: l.unitId, qty: l.qty, unitPrice: l.unitPrice, discount: l.discount })),
    billDiscount,
    deliveryCharges: state.deliveryCharges,
    labourCharges: state.labourCharges,
    notes: state.notes || null,
  };
}

export function stockWarning(line: CartLine, all: CartLine[]): string | null {
  if (!line.product.trackStock) return null;
  const needed = all
    .filter((l) => l.product.id === line.product.id)
    .reduce((s, l) => s + l.qty * (resolveUnit(l.product, l.unitId)?.factor ?? 1), 0);
  if (roundQty(needed) > roundQty(line.product.stockQty)) {
    return `Only ${roundQty(line.product.stockQty)} ${line.product.unitSymbol} in stock`;
  }
  return null;
}
