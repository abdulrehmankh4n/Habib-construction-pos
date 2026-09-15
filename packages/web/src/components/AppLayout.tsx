import { useEffect, useState, type ComponentType } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import {
  BarChart3,
  Banknote,
  Calculator,
  ClipboardList,
  Factory,
  FileSignature,
  FileText,
  FolderTree,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  QrCode,
  Receipt,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Truck,
  UserCog,
  Users,
  Wallet,
} from 'lucide-react';
import { ROLE_LABELS, type Permission } from '@pos/shared';
import { useAuth, useSettings } from '../lib/auth';
import { useLocalStorage } from '../lib/hooks';
import type { LiveStatus } from '../lib/live';

interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  perm: Permission | Permission[];
}

const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: 'Sales',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, perm: 'dashboard.view' },
      { to: '/pos', label: 'POS / New Sale', icon: ShoppingCart, perm: 'pos.sell' },
      { to: '/sales', label: 'Sales & Returns', icon: Receipt, perm: 'sales.view' },
      { to: '/quotations', label: 'Quotations', icon: FileText, perm: 'quotations.manage' },
      { to: '/deliveries', label: 'Deliveries', icon: Truck, perm: 'deliveries.manage' },
    ],
  },
  {
    group: 'Inventory',
    items: [
      { to: '/products', label: 'Products', icon: Package, perm: 'products.view' },
      { to: '/catalog', label: 'Categories & Units', icon: FolderTree, perm: 'catalog.manage' },
      { to: '/stock', label: 'Stock Control', icon: ClipboardList, perm: 'inventory.adjust' },
      { to: '/purchases', label: 'Purchases', icon: ShoppingBag, perm: 'purchases.view' },
      { to: '/labels', label: 'Barcode / QR Labels', icon: QrCode, perm: 'products.manage' },
    ],
  },
  {
    group: 'Parties',
    items: [
      { to: '/customers', label: 'Customers (Khata)', icon: Users, perm: 'customers.view' },
      { to: '/agreements', label: 'Credit Agreements', icon: FileSignature, perm: 'agreements.manage' },
      { to: '/suppliers', label: 'Suppliers', icon: Factory, perm: 'suppliers.view' },
    ],
  },
  {
    group: 'Accounts',
    items: [
      { to: '/cashbook', label: 'Cash Book', icon: Wallet, perm: 'cashbook.view' },
      { to: '/expenses', label: 'Expenses', icon: Banknote, perm: 'expenses.view' },
      { to: '/reports', label: 'Reports', icon: BarChart3, perm: 'reports.view' },
      { to: '/zakat', label: 'Zakat', icon: Calculator, perm: 'zakat.view' },
    ],
  },
  {
    group: 'Administration',
    items: [
      { to: '/users', label: 'Users', icon: UserCog, perm: 'users.manage' },
      { to: '/settings', label: 'Settings', icon: Settings, perm: ['settings.manage', 'backup.manage', 'audit.view'] },
    ],
  },
];

function LiveBadge({ status }: { status: LiveStatus }) {
  const map = {
    live: { dot: 'bg-emerald-500', text: 'Live', title: 'Connected: changes from other counters appear instantly' },
    connecting: { dot: 'bg-amber-400', text: 'Connecting', title: 'Connecting to the server…' },
    offline: { dot: 'bg-red-500', text: 'Offline', title: 'Connection to the server lost. Retrying…' },
  }[status];
  return (
    <span title={map.title} className="hidden items-center gap-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 sm:inline-flex">
      <span className={clsx('h-2 w-2 rounded-full', map.dot, status === 'live' && 'animate-pulse')} />
      {map.text}
    </span>
  );
}

export function AppLayout({ live }: { live: LiveStatus }) {
  const { user, can, logout } = useAuth();
  const settings = useSettings();
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useLocalStorage('pos.sidebar.collapsed', false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const isPos = location.pathname.startsWith('/pos');

  useEffect(() => {
    setMobileOpen(false);
    setMenuOpen(false);
  }, [location.pathname]);

  const allowed = (perm: NavItem['perm']) => (Array.isArray(perm) ? perm.some((p) => can(p)) : can(perm));
  const narrow = collapsed || isPos;

  const nav = (
    <nav className="flex-1 overflow-y-auto px-2 py-3">
      {NAV.map((g) => {
        const items = g.items.filter((i) => allowed(i.perm));
        if (!items.length) return null;
        return (
          <div key={g.group} className="mb-3">
            {!narrow && <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{g.group}</p>}
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                title={item.label}
                className={({ isActive }) =>
                  clsx(
                    'mb-0.5 flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    isActive ? 'bg-brand-700 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white',
                    narrow && 'lg:justify-center lg:px-2',
                  )
                }
              >
                <item.icon className="h-[18px] w-[18px] shrink-0" />
                <span className={clsx(narrow && 'lg:hidden')}>{item.label}</span>
              </NavLink>
            ))}
          </div>
        );
      })}
    </nav>
  );

  return (
    <div className="flex h-full">
      <aside
        className={clsx(
          'no-print fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-slate-900 transition-transform lg:static lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          narrow ? 'lg:w-16' : 'lg:w-60',
        )}
      >
        <div className={clsx('flex h-14 items-center gap-2 border-b border-slate-800 px-4', narrow && 'lg:justify-center lg:px-2')}>
          <img src="/favicon.svg" alt="" className="h-8 w-8" />
          <div className={clsx('min-w-0', narrow && 'lg:hidden')}>
            <p className="truncate text-sm font-semibold text-white">{settings.data?.shop.name ?? 'Construction POS'}</p>
            <p className="truncate text-[11px] text-slate-400">Point of Sale</p>
          </div>
        </div>
        {nav}
        {!isPos && (
          <button
            type="button"
            className="hidden items-center gap-2 border-t border-slate-800 px-4 py-3 text-xs text-slate-400 hover:text-white lg:flex"
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            {!collapsed && 'Collapse'}
          </button>
        )}
      </aside>
      {mobileOpen && <div className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden" onClick={() => setMobileOpen(false)} />}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print flex h-14 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4">
          <div className="flex items-center gap-2">
            <button type="button" aria-label="Open menu" className="rounded p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setMobileOpen(true)}>
              <Menu className="h-5 w-5" />
            </button>
            <LiveBadge status={live} />
          </div>
          <div className="relative">
            <button type="button" className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-slate-100" onClick={() => setMenuOpen((o) => !o)}>
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-800">
                {user?.fullName.slice(0, 1).toUpperCase()}
              </span>
              <span className="hidden text-left sm:block">
                <span className="block text-sm font-medium leading-tight text-slate-800">{user?.fullName}</span>
                <span className="block text-[11px] leading-tight text-slate-500">{user ? ROLE_LABELS[user.role] : ''}</span>
              </span>
            </button>
            {menuOpen && (
              <div className="absolute right-0 z-50 mt-1 w-48 rounded-md border border-slate-200 bg-white py-1 shadow-lg">
                <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50" onClick={() => navigate('/change-password')}>
                  <KeyRound className="h-4 w-4" /> Change password
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                  onClick={async () => {
                    await logout();
                    navigate('/login');
                  }}
                >
                  <LogOut className="h-4 w-4" /> Sign out
                </button>
              </div>
            )}
          </div>
        </header>
        <main className={clsx('min-h-0 flex-1', isPos ? 'overflow-hidden' : 'overflow-y-auto p-4 lg:p-6')}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
