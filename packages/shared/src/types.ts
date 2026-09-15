import type {
  CustomerType,
  DeliveryStatus,
  FbrStatus,
  PaymentMethod,
  Permission,
  PriceTier,
  RefundMethod,
  Role,
  StockMovementType,
} from './constants';

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface SessionUser {
  id: number;
  username: string;
  fullName: string;
  role: Role;
  permissions: Permission[];
  mustChangePassword: boolean;
}

export interface User {
  id: number;
  username: string;
  fullName: string;
  phone: string | null;
  role: Role;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface AppSettings {
  shop: {
    name: string;
    tagline: string;
    address: string;
    city: string;
    phone: string;
    phone2: string;
    email: string;
    ntn: string;
    strn: string;
  };
  tax: {
    enabled: boolean;
    pricesIncludeTax: boolean;
  };
  sales: {
    allowCredit: boolean;
    allowNegativeStock: boolean;
    roundingUnit: number;
    walkInLabel: string;
  };
  receipt: {
    paper: 'thermal80' | 'thermal58' | 'a4';
    autoPrint: boolean;
    showUrduNames: boolean;
    footer: string;
    urduFooter: string;
    terms: string;
  };
  quotation: {
    validityDays: number;
    terms: string;
  };
  cash: {
    openingBalance: number;
  };
  fbr: {
    enabled: boolean;
    environment: 'sandbox' | 'production';
    posId: string;
    token: string;
    timeoutSeconds: number;
  };
  backup: {
    autoEnabled: boolean;
    retentionCount: number;
  };
  notifications: {
    whatsappEnabled: boolean;
    smsEnabled: boolean;
    autoSmsOnSale: boolean;
    autoSmsOnPayment: boolean;
    smsMethod: 'GET' | 'POST';
    smsUrl: string;
    smsBody: string;
    smsHeaders: string;
    smsPhoneFormat: 'local' | 'international';
    saleTemplate: string;
    paymentTemplate: string;
    reminderTemplate: string;
  };
  agreement: {
    paperSize: 'legal' | 'a4';
    topMarginInches: number;
    language: 'english' | 'urdu' | 'bilingual';
    defaultDays: number;
    englishTemplate: string;
    urduTemplate: string;
  };
  zakat: {
    rate: number;
    nisabValue: number;
    valuationBasis: 'retail' | 'wholesale' | 'cost';
  };
}

export interface CreditAgreement {
  id: number;
  agreementNo: string;
  customerId: number;
  customerName: string;
  fatherName: string | null;
  cnic: string | null;
  phone: string | null;
  address: string | null;
  amount: number;
  agreementDate: string;
  dueDate: string;
  installments: number;
  terms: string | null;
  witness1Name: string | null;
  witness1Cnic: string | null;
  witness2Name: string | null;
  witness2Cnic: string | null;
  status: 'active' | 'settled' | 'cancelled';
  notes: string | null;
  currentBalance?: number;
  isOverdue?: boolean;
  createdByName: string | null;
  createdAt: string;
}

export interface NotificationLog {
  id: number;
  channel: 'sms' | 'whatsapp';
  recipient: string;
  message: string;
  status: 'sent' | 'failed' | 'opened';
  error: string | null;
  referenceType: string | null;
  referenceId: number | null;
  customerName: string | null;
  createdByName: string | null;
  createdAt: string;
}

export interface ZakatLine {
  productId: number;
  sku: string;
  productName: string;
  categoryId: number;
  categoryName: string;
  unitSymbol: string;
  qty: number;
  rate: number;
  value: number;
}

export interface ZakatComputation {
  reportDate: string;
  valuationBasis: 'retail' | 'wholesale' | 'cost';
  lines: ZakatLine[];
  categories: { categoryId: number; categoryName: string; itemCount: number; value: number; included: boolean }[];
  stockValue: number;
  cashValue: number;
  receivablesValue: number;
  otherAssets: number;
  liabilities: number;
  netZakatable: number;
  nisabValue: number;
  meetsNisab: boolean;
  rate: number;
  zakatPayable: number;
}

export interface ZakatReport {
  id: number;
  reportDate: string;
  valuationBasis: string;
  stockValue: number;
  cashValue: number;
  receivablesValue: number;
  otherAssets: number;
  liabilities: number;
  netZakatable: number;
  nisabValue: number;
  rate: number;
  zakatPayable: number;
  notes: string | null;
  createdByName: string | null;
  createdAt: string;
  snapshot?: ZakatComputation;
}

export interface LiveEvent {
  topics: string[];
  at: string;
}

export interface Sequence {
  name: string;
  prefix: string;
  nextValue: number;
  padding: number;
}

export interface Category {
  id: number;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  productCount: number;
  subcategories: Subcategory[];
}

export interface Subcategory {
  id: number;
  categoryId: number;
  name: string;
  sortOrder: number;
  isActive: boolean;
  productCount: number;
}

export interface Brand {
  id: number;
  name: string;
  isActive: boolean;
  productCount: number;
}

export interface Unit {
  id: number;
  name: string;
  symbol: string;
  allowDecimal: boolean;
  isActive: boolean;
}

export interface TaxRate {
  id: number;
  name: string;
  rate: number;
  isDefault: boolean;
  isActive: boolean;
}

export interface ProductUnit {
  id?: number;
  unitId: number;
  unitName?: string;
  unitSymbol?: string;
  allowDecimal?: boolean;
  factor: number;
  salePrice: number | null;
  wholesalePrice: number | null;
  barcode: string | null;
}

export interface Product {
  id: number;
  sku: string;
  barcode: string | null;
  name: string;
  urduName: string | null;
  categoryId: number;
  categoryName: string;
  subcategoryId: number | null;
  subcategoryName: string | null;
  brandId: number | null;
  brandName: string | null;
  specification: string | null;
  size: string | null;
  unitId: number;
  unitName: string;
  unitSymbol: string;
  allowDecimal: boolean;
  purchasePrice?: number;
  costPrice?: number;
  salePrice: number;
  wholesalePrice: number | null;
  minSalePrice: number | null;
  stockQty: number;
  minStock: number;
  supplierId: number | null;
  supplierName: string | null;
  taxRateId: number;
  taxRate: number;
  taxRateName: string;
  hsCode: string | null;
  location: string | null;
  trackStock: boolean;
  notes: string | null;
  isActive: boolean;
  imageUrl: string | null;
  createdAt: string;
  updatedAt: string;
  units: ProductUnit[];
}

export interface StockMovement {
  id: number;
  productId: number;
  productName?: string;
  movementType: StockMovementType;
  qtyChange: number;
  balanceAfter: number;
  unitCost?: number;
  referenceType: string | null;
  referenceId: number | null;
  referenceNo: string | null;
  note: string | null;
  createdByName: string | null;
  createdAt: string;
}

export interface Customer {
  id: number;
  name: string;
  fatherName: string | null;
  phone: string | null;
  cnic: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  ntn: string | null;
  strn: string | null;
  customerType: CustomerType;
  priceTier: PriceTier;
  creditLimit: number | null;
  openingBalance: number;
  balance: number;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface Supplier {
  id: number;
  name: string;
  company: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  ntn: string | null;
  strn: string | null;
  openingBalance: number;
  balance: number;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface LedgerEntry {
  id: number;
  entryDate: string;
  entryType: string;
  referenceType: string | null;
  referenceId: number | null;
  referenceNo: string | null;
  description: string | null;
  debit: number;
  credit: number;
  balance: number;
}

export interface LedgerStatement {
  party: { id: number; name: string; phone: string | null; address: string | null };
  from: string | null;
  to: string | null;
  openingBalance: number;
  entries: LedgerEntry[];
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
}

export interface Payment {
  id: number;
  paymentNo: string;
  direction: 'in' | 'out';
  partyType: 'customer' | 'supplier' | 'walk_in';
  customerId: number | null;
  supplierId: number | null;
  partyName: string | null;
  saleId: number | null;
  saleReturnId: number | null;
  purchaseId: number | null;
  purchaseReturnId: number | null;
  method: PaymentMethod;
  amount: number;
  reference: string | null;
  paymentDate: string;
  notes: string | null;
  isVoid: boolean;
  voidReason: string | null;
  createdByName: string | null;
  createdAt: string;
}

export interface SaleItem {
  id: number;
  productId: number;
  productName: string;
  urduName: string | null;
  sku: string | null;
  unitId: number;
  unitName: string;
  unitFactor: number;
  qty: number;
  baseQty: number;
  unitPrice: number;
  discount: number;
  billDiscountShare: number;
  taxRate: number;
  taxableValue: number;
  taxAmount: number;
  lineTotal: number;
  costPrice?: number;
  hsCode: string | null;
  returnedQty: number;
}

export interface SaleReturnSummary {
  id: number;
  returnNo: string;
  returnDate: string;
  totalAmount: number;
  refundMethod: RefundMethod;
}

export interface Sale {
  id: number;
  invoiceNo: string;
  saleDate: string;
  customerId: number | null;
  customerName: string | null;
  customerPhone: string | null;
  customerAddress?: string | null;
  customerNtn?: string | null;
  status: 'completed' | 'void';
  priceTier: PriceTier;
  subtotal: number;
  itemDiscount: number;
  billDiscount: number;
  taxableValue: number;
  taxTotal: number;
  deliveryCharges: number;
  labourCharges: number;
  roundOff: number;
  grandTotal: number;
  paidAmount: number;
  balanceDue: number;
  cashTendered: number;
  changeDue: number;
  costTotal?: number;
  pricesIncludeTax: boolean;
  deliveryRequired: boolean;
  deliveryStatus: DeliveryStatus | null;
  deliveryAddress: string | null;
  vehicleNo: string | null;
  driverName: string | null;
  driverPhone: string | null;
  deliveredAt: string | null;
  notes: string | null;
  quotationId: number | null;
  fbrStatus: FbrStatus;
  fbrInvoiceNo: string | null;
  fbrError: string | null;
  createdBy: number;
  createdByName: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  returnedTotal: number;
  itemCount?: number;
  customerBalance?: number | null;
  createdAt: string;
  items?: SaleItem[];
  payments?: Payment[];
  returns?: SaleReturnSummary[];
}

export interface SaleReturnItem {
  id: number;
  saleItemId: number;
  productId: number;
  productName: string;
  unitName: string;
  qty: number;
  baseQty: number;
  amount: number;
  taxAmount: number;
  restock: boolean;
}

export interface SaleReturn {
  id: number;
  returnNo: string;
  saleId: number;
  invoiceNo: string;
  customerId: number | null;
  customerName: string | null;
  returnDate: string;
  totalAmount: number;
  taxTotal: number;
  refundMethod: RefundMethod;
  refundAmount: number;
  reason: string | null;
  notes: string | null;
  createdByName: string | null;
  createdAt: string;
  items?: SaleReturnItem[];
}

export interface QuotationItem {
  id: number;
  productId: number;
  productName: string;
  urduName: string | null;
  unitId: number;
  unitName: string;
  unitFactor: number;
  qty: number;
  unitPrice: number;
  discount: number;
  billDiscountShare: number;
  taxRate: number;
  taxableValue: number;
  taxAmount: number;
  lineTotal: number;
}

export interface Quotation {
  id: number;
  quotationNo: string;
  quotationDate: string;
  validUntil: string | null;
  customerId: number | null;
  customerName: string | null;
  customerPhone: string | null;
  customerAddress?: string | null;
  status: 'open' | 'converted' | 'cancelled';
  priceTier: PriceTier;
  subtotal: number;
  itemDiscount: number;
  billDiscount: number;
  taxableValue: number;
  taxTotal: number;
  deliveryCharges: number;
  labourCharges: number;
  roundOff: number;
  grandTotal: number;
  pricesIncludeTax: boolean;
  notes: string | null;
  saleId: number | null;
  saleInvoiceNo?: string | null;
  createdByName: string | null;
  createdAt: string;
  items?: QuotationItem[];
}

export interface HeldBill {
  id: number;
  label: string;
  customerId: number | null;
  customerName: string | null;
  payload: unknown;
  total: number;
  createdByName: string | null;
  createdAt: string;
}

export interface PurchaseItem {
  id: number;
  productId: number;
  productName: string;
  unitId: number;
  unitName: string;
  unitFactor: number;
  qty: number;
  baseQty: number;
  unitCost: number;
  discount: number;
  lineTotal: number;
  landedUnitCost: number;
  returnedQty: number;
}

export interface Purchase {
  id: number;
  purchaseNo: string;
  supplierId: number;
  supplierName: string;
  supplierInvoiceNo: string | null;
  purchaseDate: string;
  status: 'completed' | 'void';
  subtotal: number;
  itemDiscount: number;
  billDiscount: number;
  taxAmount: number;
  freightCharges: number;
  otherCharges: number;
  grandTotal: number;
  paidAmount: number;
  vehicleNo: string | null;
  notes: string | null;
  returnedTotal: number;
  createdByName: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  createdAt: string;
  items?: PurchaseItem[];
  payments?: Payment[];
  returns?: PurchaseReturn[];
}

export interface PurchaseReturn {
  id: number;
  returnNo: string;
  purchaseId: number;
  purchaseNo?: string;
  supplierId: number;
  supplierName?: string;
  returnDate: string;
  totalAmount: number;
  refundMethod: RefundMethod;
  refundAmount: number;
  reason: string | null;
  notes: string | null;
  createdByName: string | null;
  createdAt: string;
}

export interface StockAdjustment {
  id: number;
  adjustmentNo: string;
  productId: number;
  productName: string;
  unitSymbol: string;
  adjustmentType: 'in' | 'out';
  qty: number;
  reason: string;
  note: string | null;
  unitCost?: number;
  createdByName: string | null;
  createdAt: string;
}

export interface ExpenseCategory {
  id: number;
  name: string;
  isActive: boolean;
}

export interface Expense {
  id: number;
  expenseNo: string;
  expenseDate: string;
  categoryId: number;
  categoryName: string;
  amount: number;
  method: PaymentMethod;
  paidTo: string | null;
  reference: string | null;
  notes: string | null;
  isVoid: boolean;
  voidReason: string | null;
  createdByName: string | null;
  createdAt: string;
}

export interface CashBookEntry {
  time: string;
  type: string;
  referenceNo: string | null;
  description: string;
  cashIn: number;
  cashOut: number;
  balance: number;
}

export interface CashBookDay {
  date: string;
  openingCash: number;
  cashIn: number;
  cashOut: number;
  expectedCash: number;
  entries: CashBookEntry[];
  methodTotals: { method: PaymentMethod; received: number; paid: number }[];
  closing: DayClosing | null;
}

export interface DayClosing {
  id: number;
  closingDate: string;
  openingCash: number;
  cashIn: number;
  cashOut: number;
  expectedCash: number;
  countedCash: number;
  difference: number;
  notes: string | null;
  closedByName: string | null;
  createdAt: string;
}

export interface DashboardData {
  today: {
    salesCount: number;
    salesTotal: number;
    cashReceived: number;
    creditSales: number;
    returnsTotal: number;
    expensesTotal: number;
    grossProfit: number | null;
  };
  month: {
    salesTotal: number;
    grossProfit: number | null;
    expensesTotal: number;
  };
  receivables: number;
  payables: number;
  lowStockCount: number;
  pendingDeliveries: number;
  fbrPending: number;
  agreementsDue: number;
  stockCostValue: number | null;
  stockSaleValue: number;
  salesTrend: { date: string; total: number; count: number }[];
  topProducts: { productId: number; productName: string; qty: number; unitSymbol: string; total: number }[];
  lowStock: { id: number; name: string; stockQty: number; minStock: number; unitSymbol: string }[];
  recentSales: { id: number; invoiceNo: string; saleDate: string; customerName: string | null; grandTotal: number; status: string }[];
}

export interface AuditLog {
  id: number;
  userId: number | null;
  username: string | null;
  action: string;
  entityType: string | null;
  entityId: number | null;
  details: string | null;
  ip: string | null;
  createdAt: string;
}

export interface BackupFile {
  name: string;
  size: number;
  createdAt: string;
}
