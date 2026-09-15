import type { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { Permission } from '@pos/shared';
import { useAuth } from './lib/auth';
import { useLiveSync } from './lib/live';
import { AppLayout } from './components/AppLayout';
import { Spinner } from './components/ui';
import { LoginPage } from './pages/LoginPage';
import { ChangePasswordPage } from './pages/ChangePasswordPage';
import { DashboardPage } from './pages/DashboardPage';
import { PosPage } from './pages/pos/PosPage';
import { SalesPage } from './pages/sales/SalesPage';
import { SaleDetailPage } from './pages/sales/SaleDetailPage';
import { QuotationsPage } from './pages/quotations/QuotationsPage';
import { QuotationDetailPage } from './pages/quotations/QuotationDetailPage';
import { DeliveriesPage } from './pages/DeliveriesPage';
import { ProductsPage } from './pages/products/ProductsPage';
import { ProductFormPage } from './pages/products/ProductFormPage';
import { CatalogPage } from './pages/CatalogPage';
import { StockPage } from './pages/StockPage';
import { PurchasesPage } from './pages/purchases/PurchasesPage';
import { PurchaseFormPage } from './pages/purchases/PurchaseFormPage';
import { PurchaseDetailPage } from './pages/purchases/PurchaseDetailPage';
import { LabelsPage } from './pages/LabelsPage';
import { CustomersPage } from './pages/customers/CustomersPage';
import { CustomerDetailPage } from './pages/customers/CustomerDetailPage';
import { AgreementsPage } from './pages/AgreementsPage';
import { SuppliersPage } from './pages/suppliers/SuppliersPage';
import { SupplierDetailPage } from './pages/suppliers/SupplierDetailPage';
import { CashBookPage } from './pages/CashBookPage';
import { ExpensesPage } from './pages/ExpensesPage';
import { ReportsPage } from './pages/reports/ReportsPage';
import { ZakatPage } from './pages/ZakatPage';
import { UsersPage } from './pages/UsersPage';
import { SettingsPage } from './pages/settings/SettingsPage';
import { PrintRoutes } from './pages/print/PrintRoutes';

function Guard({ perm, children }: { perm: Permission | Permission[]; children: ReactNode }) {
  const { can } = useAuth();
  const ok = Array.isArray(perm) ? perm.some((p) => can(p)) : can(perm);
  if (!ok) {
    return (
      <div className="card mx-auto mt-10 max-w-md p-6 text-center">
        <p className="font-semibold text-slate-800">Access denied</p>
        <p className="mt-1 text-sm text-slate-500">Your role does not have permission to open this page.</p>
      </div>
    );
  }
  return <>{children}</>;
}

function Home() {
  const { can } = useAuth();
  if (can('dashboard.view')) return <Navigate to="/dashboard" replace />;
  if (can('pos.sell')) return <Navigate to="/pos" replace />;
  return <Navigate to="/sales" replace />;
}

export function App() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const signedIn = !!user && !user.mustChangePassword;
  const live = useLiveSync(signedIn);

  if (loading) return <Spinner label="Starting…" />;

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace state={{ from: location.pathname + location.search }} />} />
      </Routes>
    );
  }

  if (user.mustChangePassword) {
    return (
      <Routes>
        <Route path="*" element={<ChangePasswordPage forced />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route path="/print/*" element={<PrintRoutes />} />
      <Route element={<AppLayout live={live} />}>
        <Route index element={<Home />} />
        <Route path="/change-password" element={<ChangePasswordPage />} />
        <Route path="/dashboard" element={<Guard perm="dashboard.view"><DashboardPage /></Guard>} />
        <Route path="/pos" element={<Guard perm="pos.sell"><PosPage /></Guard>} />
        <Route path="/sales" element={<Guard perm="sales.view"><SalesPage /></Guard>} />
        <Route path="/sales/:id" element={<Guard perm="sales.view"><SaleDetailPage /></Guard>} />
        <Route path="/quotations" element={<Guard perm="quotations.manage"><QuotationsPage /></Guard>} />
        <Route path="/quotations/:id" element={<Guard perm="quotations.manage"><QuotationDetailPage /></Guard>} />
        <Route path="/deliveries" element={<Guard perm="deliveries.manage"><DeliveriesPage /></Guard>} />
        <Route path="/products" element={<Guard perm="products.view"><ProductsPage /></Guard>} />
        <Route path="/products/new" element={<Guard perm="products.manage"><ProductFormPage /></Guard>} />
        <Route path="/products/:id" element={<Guard perm="products.view"><ProductFormPage /></Guard>} />
        <Route path="/catalog" element={<Guard perm="catalog.manage"><CatalogPage /></Guard>} />
        <Route path="/stock" element={<Guard perm="inventory.adjust"><StockPage /></Guard>} />
        <Route path="/purchases" element={<Guard perm="purchases.view"><PurchasesPage /></Guard>} />
        <Route path="/purchases/new" element={<Guard perm="purchases.manage"><PurchaseFormPage /></Guard>} />
        <Route path="/purchases/:id" element={<Guard perm="purchases.view"><PurchaseDetailPage /></Guard>} />
        <Route path="/labels" element={<Guard perm="products.manage"><LabelsPage /></Guard>} />
        <Route path="/customers" element={<Guard perm="customers.view"><CustomersPage /></Guard>} />
        <Route path="/customers/:id" element={<Guard perm="customers.view"><CustomerDetailPage /></Guard>} />
        <Route path="/agreements" element={<Guard perm="agreements.manage"><AgreementsPage /></Guard>} />
        <Route path="/suppliers" element={<Guard perm="suppliers.view"><SuppliersPage /></Guard>} />
        <Route path="/suppliers/:id" element={<Guard perm="suppliers.view"><SupplierDetailPage /></Guard>} />
        <Route path="/cashbook" element={<Guard perm="cashbook.view"><CashBookPage /></Guard>} />
        <Route path="/expenses" element={<Guard perm="expenses.view"><ExpensesPage /></Guard>} />
        <Route path="/reports" element={<Guard perm="reports.view"><ReportsPage /></Guard>} />
        <Route path="/zakat" element={<Guard perm="zakat.view"><ZakatPage /></Guard>} />
        <Route path="/users" element={<Guard perm="users.manage"><UsersPage /></Guard>} />
        <Route path="/settings" element={<Guard perm={['settings.manage', 'backup.manage', 'audit.view']}><SettingsPage /></Guard>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
