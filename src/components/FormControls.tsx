import { ChangeEvent, ReactNode, SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * Dropdown dengan hint murni.
 * - Saat belum ada pilihan, `placeholder` tampil abu-abu pudar seperti placeholder input.
 * - Hint TIDAK muncul sebagai opsi ketika dropdown dibuka (option disembunyikan).
 */
interface PlaceholderSelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value' | 'placeholder'> {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  children: ReactNode;
  /** Tampilkan ikon chevron di kanan (default true). */
  chevron?: boolean;
  /**
   * Khusus field opsional: setelah ada pilihan, tampilkan opsi nyata dengan label ini
   * di paling atas agar pilihan bisa dikosongkan lagi. Hint tetap tidak muncul di daftar.
   */
  clearLabel?: string;
}

export function PlaceholderSelect({
  value,
  onChange,
  placeholder,
  children,
  chevron = true,
  clearLabel,
  className = '',
  ...rest
}: PlaceholderSelectProps) {
  const isEmpty = value === '';
  return (
    <div className="relative w-full">
      <select
        {...rest}
        value={value}
        data-empty={isEmpty ? 'true' : undefined}
        onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)}
        className={`${className} ${chevron ? 'appearance-none pr-9' : ''} ${
          isEmpty ? 'text-slate-400' : 'text-slate-900'
        }`}
      >
        {isEmpty || !clearLabel ? (
          <option value="" disabled hidden>
            {placeholder}
          </option>
        ) : (
          <option value="">{clearLabel}</option>
        )}
        {children}
      </select>
      {chevron && (
        <ChevronDown className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
      )}
    </div>
  );
}

/**
 * Dropdown filter kompak (tahun, item, dst.) yang diletakkan di dalam konten halaman,
 * bukan di header.
 */
interface FilterSelectProps {
  ariaLabel: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  className?: string;
}

export function FilterSelect({
  ariaLabel,
  value,
  onChange,
  children,
  className = '',
}: FilterSelectProps) {
  return (
    <div className={`relative ${className}`}>
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-[44px] w-full appearance-none truncate rounded-xl border border-slate-200 bg-white pr-8 pl-3 text-xs font-semibold text-slate-800 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15"
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
    </div>
  );
}

/**
 * Tab segmen kompak: kolom dibagi rata sehingga tidak pernah perlu di-scroll,
 * walaupun di layar HP kecil. Label dipotong (truncate) bila terlalu sempit.
 */
export interface SegmentedTab<K extends string> {
  key: K;
  label: string;
  count?: number;
}

interface SegmentedTabsProps<K extends string> {
  tabs: SegmentedTab<K>[];
  value: K;
  onChange: (key: K) => void;
  className?: string;
  /** Label di atas, angka di bawah. Dipakai bila ada 5 tab atau lebih. */
  stacked?: boolean;
}

export function SegmentedTabs<K extends string>({
  tabs,
  value,
  onChange,
  className = '',
  stacked = false,
}: SegmentedTabsProps<K>) {
  return (
    <div
      role="tablist"
      className={`grid gap-0.5 rounded-xl bg-slate-200/70 p-0.5 ${className}`}
      style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
    >
      {tabs.map((tab) => {
        const active = value === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.key)}
            className={`flex min-w-0 items-center justify-center rounded-lg font-semibold leading-none transition-colors ${
              stacked
                ? 'min-h-[40px] flex-col gap-1 px-1 py-1 text-[10px]'
                : 'min-h-[34px] gap-1 px-1.5 text-[11px]'
            } ${
              active ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span className={stacked ? 'w-full truncate text-center' : 'truncate'}>
              {tab.label}
            </span>
            {tab.count !== undefined && (
              <span
                className={`shrink-0 tabular-nums ${stacked ? 'text-xs font-bold' : ''} ${
                  active ? 'text-teal-700' : 'text-slate-500'
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
