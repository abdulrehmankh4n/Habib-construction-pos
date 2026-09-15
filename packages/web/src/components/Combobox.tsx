import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { ChevronDown, Loader2, X } from 'lucide-react';
import { useDebounce } from '../lib/hooks';

interface ComboboxProps<T> {
  value: T | null;
  onChange: (value: T | null) => void;
  queryKey: string;
  fetcher: (search: string) => Promise<T[]>;
  getKey: (item: T) => string | number;
  getLabel: (item: T) => string;
  renderOption?: (item: T) => ReactNode;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
  inputClassName?: string;
  clearable?: boolean;
  footer?: ReactNode;
  id?: string;
}

export function Combobox<T>({
  value,
  onChange,
  queryKey,
  fetcher,
  getKey,
  getLabel,
  renderOption,
  placeholder = 'Search…',
  disabled,
  autoFocus,
  className,
  inputClassName,
  clearable = true,
  footer,
  id,
}: ComboboxProps<T>) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [active, setActive] = useState(0);
  const search = useDebounce(text, 200);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const query = useQuery({
    queryKey: [queryKey, 'combobox', search],
    queryFn: () => fetcher(search),
    enabled: open,
    staleTime: 15_000,
  });
  const items = query.data ?? [];

  useEffect(() => {
    setActive(0);
  }, [search]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const select = (item: T) => {
    onChange(item);
    setOpen(false);
    setText('');
  };

  return (
    <div ref={wrapRef} className={clsx('relative', className)}>
      <div className="relative">
        <input
          id={id}
          ref={inputRef}
          disabled={disabled}
          autoFocus={autoFocus}
          autoComplete="off"
          className={clsx('input pr-14', inputClassName)}
          placeholder={value ? getLabel(value) : placeholder}
          value={open ? text : value ? getLabel(value) : ''}
          onFocus={() => {
            setOpen(true);
            setText('');
          }}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setOpen(true);
              setActive((a) => Math.min(a + 1, items.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === 'Enter') {
              if (open && items[active]) {
                e.preventDefault();
                select(items[active]);
              }
            } else if (e.key === 'Escape') {
              if (open) {
                e.stopPropagation();
                setOpen(false);
                inputRef.current?.blur();
              }
            } else if (e.key === 'Tab') {
              setOpen(false);
            }
          }}
        />
        <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
          {query.isFetching && open && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
          {clearable && value && !disabled && (
            <button
              type="button"
              aria-label="Clear"
              className="rounded p-0.5 text-slate-400 hover:text-slate-700"
              onClick={() => {
                onChange(null);
                setText('');
              }}
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <ChevronDown className="pointer-events-none h-4 w-4 text-slate-400" />
        </div>
      </div>
      {open && !disabled && (
        <div className="absolute z-40 mt-1 max-h-72 w-full min-w-[16rem] overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg">
          {items.length === 0 && !query.isFetching && <p className="px-3 py-2 text-sm text-slate-500">No matches</p>}
          {items.map((item, i) => (
            <button
              key={getKey(item)}
              type="button"
              className={clsx('block w-full px-3 py-2 text-left text-sm', i === active ? 'bg-brand-50' : 'hover:bg-slate-50')}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => select(item)}
            >
              {renderOption ? renderOption(item) : getLabel(item)}
            </button>
          ))}
          {footer && <div className="border-t border-slate-100 px-2 pt-1">{footer}</div>}
        </div>
      )}
    </div>
  );
}
