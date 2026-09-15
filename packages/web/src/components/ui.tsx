import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight, Loader2, Search, X } from 'lucide-react';
import { fromPaisa, parseQty, toPaisa } from '../lib/format';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success' | 'outline';
type Size = 'xs' | 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-700 text-white hover:bg-brand-800 shadow-sm disabled:bg-brand-300',
  secondary: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 shadow-sm disabled:text-slate-400',
  danger: 'bg-red-600 text-white hover:bg-red-700 shadow-sm disabled:bg-red-300',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm disabled:bg-emerald-300',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:text-slate-300',
  outline: 'border border-brand-700 text-brand-700 hover:bg-brand-50 disabled:opacity-50',
};

const SIZES: Record<Size, string> = {
  xs: 'h-7 px-2 text-xs gap-1',
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-9 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, icon, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-md font-medium transition-colors disabled:cursor-not-allowed',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
});

export function Field({
  label,
  hint,
  error,
  required,
  className,
  children,
  htmlFor,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  className?: string;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className={className}>
      {label && (
        <label htmlFor={htmlFor} className="label">
          {label}
          {required && <span className="ml-0.5 text-red-600">*</span>}
        </label>
      )}
      {children}
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref,
) {
  return <input ref={ref} className={clsx('input', className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, rows = 3, ...rest },
  ref,
) {
  return <textarea ref={ref} rows={rows} className={clsx('input', className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...rest },
  ref,
) {
  return (
    <select ref={ref} className={clsx('input pr-8', className)} {...rest}>
      {children}
    </select>
  );
});

export function Checkbox({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className={clsx('flex items-start gap-2.5', disabled ? 'opacity-60' : 'cursor-pointer')}>
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-700 focus:ring-brand-500"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <span className="block text-sm font-medium text-slate-800">{label}</span>
        {description && <span className="block text-xs text-slate-500">{description}</span>}
      </span>
    </label>
  );
}

interface MoneyInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: number | null;
  onChange: (paisa: number | null) => void;
  prefix?: boolean;
}

export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(function MoneyInput(
  { value, onChange, className, prefix = true, onBlur, ...rest },
  ref,
) {
  const [text, setText] = useState(fromPaisa(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(fromPaisa(value));
  }, [value]);
  return (
    <div className="relative">
      {prefix && <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">Rs</span>}
      <input
        ref={ref}
        inputMode="decimal"
        autoComplete="off"
        className={clsx('input text-right tabular-nums', prefix && 'pl-8', className)}
        value={text}
        onFocus={(e) => {
          focused.current = true;
          e.target.select();
        }}
        onChange={(e) => {
          const v = e.target.value;
          if (!/^[0-9,]*\.?[0-9]{0,2}$/.test(v)) return;
          setText(v);
          onChange(toPaisa(v));
        }}
        onBlur={(e) => {
          focused.current = false;
          setText(fromPaisa(value));
          onBlur?.(e);
        }}
        {...rest}
      />
    </div>
  );
});

interface QtyInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: number | null;
  onChange: (qty: number | null) => void;
  allowDecimal?: boolean;
}

export const QtyInput = forwardRef<HTMLInputElement, QtyInputProps>(function QtyInput(
  { value, onChange, allowDecimal = true, className, onBlur, ...rest },
  ref,
) {
  const [text, setText] = useState(value === null ? '' : String(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(value === null ? '' : String(value));
  }, [value]);
  return (
    <input
      ref={ref}
      inputMode={allowDecimal ? 'decimal' : 'numeric'}
      autoComplete="off"
      className={clsx('input text-right tabular-nums', className)}
      value={text}
      onFocus={(e) => {
        focused.current = true;
        e.target.select();
      }}
      onChange={(e) => {
        const v = e.target.value;
        const pattern = allowDecimal ? /^[0-9]*\.?[0-9]{0,3}$/ : /^[0-9]*$/;
        if (!pattern.test(v)) return;
        setText(v);
        onChange(parseQty(v));
      }}
      onBlur={(e) => {
        focused.current = false;
        setText(value === null ? '' : String(value));
        onBlur?.(e);
      }}
      {...rest}
    />
  );
});

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
  className,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className={clsx('relative', className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        className="input pl-8 pr-8"
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-700"
          onClick={() => onChange('')}
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

const BADGE: Record<string, string> = {
  gray: 'bg-slate-100 text-slate-700 ring-slate-200',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  blue: 'bg-sky-50 text-sky-700 ring-sky-200',
  brand: 'bg-brand-50 text-brand-800 ring-brand-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
};

export function Badge({ color = 'gray', children, className }: { color?: keyof typeof BADGE; children: ReactNode; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset', BADGE[color], className)}>
      {children}
    </span>
  );
}

export function Card({ title, actions, children, className, bodyClassName }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <section className={clsx('card', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
          {title && <h2 className="text-sm font-semibold text-slate-800">{title}</h2>}
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={clsx(bodyClassName ?? 'p-4')}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
      <Loader2 className="h-5 w-5 animate-spin" /> {label}
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      {icon && <div className="text-slate-300">{icon}</div>}
      <p className="font-medium text-slate-700">{title}</p>
      {description && <p className="max-w-md text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function StatCard({ label, value, hint, tone = 'default', icon }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'default' | 'good' | 'bad' | 'warn'; icon?: ReactNode }) {
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        {icon && <span className="text-slate-400">{icon}</span>}
      </div>
      <p
        className={clsx(
          'mt-1 text-2xl font-semibold',
          tone === 'good' && 'text-emerald-700',
          tone === 'bad' && 'text-red-700',
          tone === 'warn' && 'text-amber-700',
          tone === 'default' && 'text-slate-900',
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="no-print mb-4 flex gap-1 overflow-x-auto border-b border-slate-200">
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          onClick={() => onChange(t.value)}
          className={clsx(
            '-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors',
            value === t.value ? 'border-brand-700 text-brand-800' : 'border-transparent text-slate-500 hover:text-slate-800',
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Pagination({ page, pageSize, total, onChange }: { page: number; pageSize: number; total: number; onChange: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return total > 0 ? <p className="px-4 py-3 text-xs text-slate-500">{total} record(s)</p> : null;
  return (
    <div className="no-print flex items-center justify-between gap-2 px-4 py-3 text-sm text-slate-600">
      <span className="text-xs">
        Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
      </span>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => onChange(page - 1)} icon={<ChevronLeft className="h-4 w-4" />}>
          Prev
        </Button>
        <span className="px-2 text-xs">
          {page} / {pages}
        </span>
        <Button size="sm" variant="ghost" disabled={page >= pages} onClick={() => onChange(page + 1)}>
          Next <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  closeOnBackdrop = true,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  closeOnBackdrop?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    const prev = document.activeElement as HTMLElement | null;
    setTimeout(() => {
      const el = panelRef.current?.querySelector<HTMLElement>('[autofocus], input:not([type=hidden]), select, textarea, button');
      el?.focus();
    }, 20);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  const width = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl', '2xl': 'max-w-6xl' }[size];
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 sm:p-8" onMouseDown={(e) => closeOnBackdrop && e.target === e.currentTarget && onClose()}>
      <div ref={panelRef} role="dialog" aria-modal="true" className={clsx('card my-auto w-full shadow-xl', width)}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button type="button" aria-label="Close" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  danger,
  requireReason,
  loading,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  requireReason?: boolean;
  loading?: boolean;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (open) setReason('');
  }, [open]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} loading={loading} disabled={requireReason && !reason.trim()} onClick={() => onConfirm(reason.trim())}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm text-slate-700">
        <div>{message}</div>
        {requireReason && (
          <Field label="Reason" required>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Why is this being done?" />
          </Field>
        )}
      </div>
    </Modal>
  );
}

export function DateRange({ from, to, onChange }: { from: string; to: string; onChange: (from: string, to: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input type="date" className="w-40" value={from} max={to} onChange={(e) => onChange(e.target.value, to)} aria-label="From date" />
      <span className="text-sm text-slate-500">to</span>
      <Input type="date" className="w-40" value={to} min={from} onChange={(e) => onChange(from, e.target.value)} aria-label="To date" />
    </div>
  );
}

export function KeyValue({ label, value, className }: { label: ReactNode; value: ReactNode; className?: string }) {
  return (
    <div className={clsx('flex items-baseline justify-between gap-4 py-1 text-sm', className)}>
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-medium text-slate-800">{value}</span>
    </div>
  );
}

export function TableWrap({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx('overflow-x-auto', className)}>{children}</div>;
}
