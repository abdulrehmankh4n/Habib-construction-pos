export const PAYMENT_METHODS = ['cash', 'card', 'bank_transfer', 'jazzcash', 'easypaisa', 'cheque'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  card: 'Debit / Credit Card',
  bank_transfer: 'Bank Transfer',
  jazzcash: 'JazzCash',
  easypaisa: 'Easypaisa',
  cheque: 'Cheque',
};

export const REFUND_METHODS = [...PAYMENT_METHODS, 'account'] as const;
export type RefundMethod = (typeof REFUND_METHODS)[number];

export const REFUND_METHOD_LABELS: Record<RefundMethod, string> = {
  ...PAYMENT_METHOD_LABELS,
  account: 'Adjust in Account (Khata)',
};

export const ROLES = ['admin', 'manager', 'cashier'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrator (Owner)',
  manager: 'Manager',
  cashier: 'Cashier / Salesman',
};

export const PERMISSIONS = [
  'dashboard.view',
  'pos.sell',
  'sales.view',
  'sales.void',
  'sales.return',
  'sales.price_below_min',
  'sales.exceed_credit',
  'quotations.manage',
  'deliveries.manage',
  'products.view',
  'products.manage',
  'products.view_cost',
  'catalog.manage',
  'inventory.adjust',
  'customers.view',
  'customers.manage',
  'customers.receive_payment',
  'agreements.manage',
  'notifications.send',
  'suppliers.view',
  'suppliers.manage',
  'suppliers.pay',
  'purchases.view',
  'purchases.manage',
  'expenses.view',
  'expenses.manage',
  'payments.void',
  'cashbook.view',
  'cashbook.close',
  'reports.view',
  'reports.profit',
  'zakat.view',
  'users.manage',
  'settings.manage',
  'backup.manage',
  'audit.view',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const MANAGER_EXCLUDED: Permission[] = ['users.manage', 'settings.manage'];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  admin: PERMISSIONS,
  manager: PERMISSIONS.filter((p) => !MANAGER_EXCLUDED.includes(p)),
  cashier: [
    'pos.sell',
    'sales.view',
    'quotations.manage',
    'deliveries.manage',
    'products.view',
    'customers.view',
    'customers.manage',
    'customers.receive_payment',
    'notifications.send',
  ],
};

export function permissionsForRole(role: Role): Permission[] {
  return [...(ROLE_PERMISSIONS[role] ?? [])];
}

export function roleHasPermission(role: Role, permission: Permission): boolean {
  return (ROLE_PERMISSIONS[role] ?? []).includes(permission);
}

export const CUSTOMER_TYPES = ['retail', 'contractor', 'builder', 'wholesale', 'government', 'other'] as const;
export type CustomerType = (typeof CUSTOMER_TYPES)[number];

export const CUSTOMER_TYPE_LABELS: Record<CustomerType, string> = {
  retail: 'Retail',
  contractor: 'Contractor (Thekedar)',
  builder: 'Builder / Developer',
  wholesale: 'Wholesale / Dealer',
  government: 'Government / Institution',
  other: 'Other',
};

export const PRICE_TIERS = ['retail', 'wholesale'] as const;
export type PriceTier = (typeof PRICE_TIERS)[number];

export const DELIVERY_STATUSES = ['pending', 'dispatched', 'delivered', 'cancelled'] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  pending: 'Pending',
  dispatched: 'Dispatched',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export const STOCK_MOVEMENT_TYPES = [
  'opening',
  'purchase',
  'purchase_return',
  'purchase_void',
  'sale',
  'sale_return',
  'sale_void',
  'adjustment',
] as const;
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

export const STOCK_MOVEMENT_LABELS: Record<StockMovementType, string> = {
  opening: 'Opening Stock',
  purchase: 'Purchase',
  purchase_return: 'Purchase Return',
  purchase_void: 'Purchase Cancelled',
  sale: 'Sale',
  sale_return: 'Sale Return',
  sale_void: 'Sale Cancelled',
  adjustment: 'Adjustment',
};

export const ADJUSTMENT_REASONS = [
  'Damage / Breakage',
  'Wastage',
  'Theft / Loss',
  'Physical Count Correction',
  'Internal Use',
  'Found / Recovered',
  'Other',
] as const;

export const FBR_STATUSES = ['not_applicable', 'pending', 'synced', 'failed'] as const;
export type FbrStatus = (typeof FBR_STATUSES)[number];

export const ROUNDING_OPTIONS = [
  { value: 1, label: 'No rounding (exact paisa)' },
  { value: 100, label: 'Nearest Rs 1' },
  { value: 500, label: 'Nearest Rs 5' },
  { value: 1000, label: 'Nearest Rs 10' },
] as const;
