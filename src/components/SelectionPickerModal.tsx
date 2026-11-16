import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, ChevronDown, Lock, MapPin, Plus, Search, X } from 'lucide-react';

export interface SelectionPickerOption {
  value: string;
  label: string;
  subtitle?: string;
  codeBadge?: string;
  group?: string;
  disabled?: boolean;
  disabledBadge?: string;
}

interface SelectionPickerModalProps {
  isOpen: boolean;
  title: string;
  options: SelectionPickerOption[];
  selectedValue: string;
  onClose: () => void;
  onSelect: (value: string) => void;
  searchable?: boolean;
  searchPlaceholder?: string;
  searchInputMode?: 'text' | 'numeric';
  emptyMessage?: string;
  emptySearchMessage?: string;
  showAddButton?: boolean;
  addButtonLabel?: string;
  /** Jika disediakan, menekan tombol + akan langsung memanggil handler eksternal (mis. membuka form Proposal baru). */
  onExternalAdd?: () => void;
  /** Konfigurasi tambah data langsung di dalam pop-up (mis. Tahun Anggaran atau Pekerjaan). */
  inlineCreateConfig?: {
    title: string;
    fieldLabel: string;
    placeholder: string;
    helperText?: string;
    submitLabel?: string;
    inputMode?: 'text' | 'numeric';
    maxLength?: number;
    normalizeInput?: (raw: string) => string;
    validateInput?: (val: string) => string | null;
    onCreate: (val: string) => boolean | void;
  };
}

export function SelectionPickerModal({
  isOpen,
  title,
  options,
  selectedValue,
  onClose,
  onSelect,
  searchable = false,
  searchPlaceholder = 'Cari pilihan...',
  searchInputMode = 'text',
  emptyMessage = 'Belum ada pilihan tersedia.',
  emptySearchMessage,
  showAddButton = false,
  addButtonLabel = 'Tambah baru',
  onExternalAdd,
  inlineCreateConfig,
}: SelectionPickerModalProps) {
  const [mode, setMode] = useState<'select' | 'create'>('select');
  const [searchQuery, setSearchQuery] = useState('');
  const [createValue, setCreateValue] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!isOpen) {
      setMode('select');
      setSearchQuery('');
      setCreateValue('');
      setCreateError(null);
      setCollapsedGroups({});
    }
  }, [isOpen]);

  const filteredOptions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!searchable || !q) return options;
    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(q) ||
        opt.value.toLowerCase().includes(q) ||
        (opt.group && opt.group.toLowerCase().includes(q)) ||
        (opt.subtitle && opt.subtitle.toLowerCase().includes(q)) ||
        (opt.codeBadge && opt.codeBadge.toLowerCase().includes(q))
    );
  }, [options, searchable, searchQuery]);

  const groupedOptions = useMemo(() => {
    const hasGroups = filteredOptions.some((opt) => Boolean(opt.group));
    if (!hasGroups) return null;
    const map = new Map<string, SelectionPickerOption[]>();
    for (const opt of filteredOptions) {
      const groupName = opt.group || 'Lainnya';
      const bucket = map.get(groupName);
      if (bucket) {
        bucket.push(opt);
      } else {
        map.set(groupName, [opt]);
      }
    }
    return Array.from(map.entries()).map(([groupName, items]) => ({
      groupName,
      items,
    }));
  }, [filteredOptions]);

  if (!isOpen) return null;

  const handleClose = () => {
    setMode('select');
    setSearchQuery('');
    setCreateValue('');
    setCreateError(null);
    onClose();
  };

  const handleOpenAdd = () => {
    if (onExternalAdd) {
      handleClose();
      onExternalAdd();
      return;
    }
    if (inlineCreateConfig) {
      const seed = inlineCreateConfig.normalizeInput
        ? inlineCreateConfig.normalizeInput(searchQuery.trim())
        : searchQuery.trim();
      setCreateValue(seed);
      setCreateError(null);
      setMode('create');
    }
  };

  const handleCreateSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!inlineCreateConfig) return;
    const normalized = inlineCreateConfig.normalizeInput
      ? inlineCreateConfig.normalizeInput(createValue.trim())
      : createValue.trim();

    if (!normalized) {
      setCreateError(`${inlineCreateConfig.fieldLabel} wajib diisi.`);
      return;
    }
    if (inlineCreateConfig.validateInput) {
      const err = inlineCreateConfig.validateInput(normalized);
      if (err) {
        setCreateError(err);
        return;
      }
    }

    const result = inlineCreateConfig.onCreate(normalized);
    if (result === false) return;
    onSelect(normalized);
    handleClose();
  };

  const showTopToolbar = searchable || showAddButton;

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-slate-950/50 backdrop-blur-xs sm:items-center sm:p-4"
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-label={mode === 'create' && inlineCreateConfig ? inlineCreateConfig.title : title}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-white shadow-xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile Drag Handle */}
        <div className="flex justify-center pt-2.5 sm:hidden">
          <div className="h-1.5 w-10 rounded-full bg-slate-300" />
        </div>

        {mode === 'select' ? (
          <>
            {/* Header */}
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
              <h2 className="truncate text-base font-bold text-slate-900">{title}</h2>

              <button
                type="button"
                onClick={handleClose}
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 shrink-0"
                aria-label="Tutup"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Optional Search Bar & Green Rounded-Square "+" Trigger */}
            {showTopToolbar && (
              <div className="border-b border-slate-100 px-5 py-3.5">
                <div className="flex items-center gap-2">
                  {searchable && (
                    <div className="relative flex-1 min-w-0">
                      <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        type="search"
                        inputMode={searchInputMode}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={searchPlaceholder}
                        className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white pr-3.5 pl-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15"
                      />
                    </div>
                  )}

                  {showAddButton && (onExternalAdd || inlineCreateConfig) && (
                    <button
                      type="button"
                      onClick={handleOpenAdd}
                      aria-label={addButtonLabel}
                      title={addButtonLabel}
                      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-700 text-white shadow-xs transition-colors hover:bg-teal-800 active:scale-[0.96]"
                    >
                      <Plus className="h-5 w-5" />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Options List */}
            <div className="flex-1 overflow-y-auto">
              {filteredOptions.length === 0 ? (
                <div className="px-5 py-10 text-center">
                  <p className="text-sm font-medium text-slate-600">
                    {searchable && searchQuery.trim()
                      ? emptySearchMessage || `"${searchQuery.trim()}" tidak ditemukan`
                      : emptyMessage}
                  </p>
                </div>
              ) : groupedOptions ? (
                <div className="divide-y divide-slate-200">
                  {groupedOptions.map(({ groupName, items }) => {
                    const isSearching = Boolean(searchable && searchQuery.trim());
                    const isCollapsed = !isSearching && Boolean(collapsedGroups[groupName]);
                    return (
                      <div key={groupName}>
                        <button
                          type="button"
                          onClick={() =>
                            setCollapsedGroups((prev) => ({
                              ...prev,
                              [groupName]: !prev[groupName],
                            }))
                          }
                          aria-expanded={!isCollapsed}
                          className="sticky top-0 z-10 flex min-h-[40px] w-full items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/95 px-5 py-2 text-left backdrop-blur-xs transition-colors hover:bg-slate-100/90"
                        >
                          <div className="flex min-w-0 items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5 shrink-0 text-teal-700" />
                            <span className="truncate text-xs font-bold text-slate-700">
                              {groupName}
                            </span>
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5">
                            <span className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 tabular-nums">
                              {items.length}
                            </span>
                            {!isSearching && (
                              <ChevronDown
                                className={`h-3.5 w-3.5 text-slate-400 transition-transform ${
                                  isCollapsed ? '-rotate-90' : ''
                                }`}
                              />
                            )}
                          </div>
                        </button>

                        {!isCollapsed && (
                          <div className="divide-y divide-slate-100">
                            {items.map((opt) => {
                              const isSelected = selectedValue === opt.value;
                              return (
                                <button
                                  key={opt.value}
                                  type="button"
                                  disabled={opt.disabled}
                                  onClick={() => {
                                    if (opt.disabled) return;
                                    onSelect(opt.value);
                                    handleClose();
                                  }}
                                  className={`flex min-h-[54px] w-full items-center justify-between gap-3 px-5 py-3 text-left transition-colors ${
                                    opt.disabled
                                      ? 'cursor-not-allowed bg-slate-50/70 opacity-65'
                                      : isSelected
                                        ? 'bg-teal-50/50 hover:bg-teal-50/70'
                                        : 'hover:bg-slate-50'
                                  }`}
                                >
                                  <div className="flex items-center gap-3 min-w-0">
                                    {opt.codeBadge && (
                                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-teal-200 bg-teal-50 font-mono text-xs font-bold text-teal-800">
                                        {opt.codeBadge}
                                      </div>
                                    )}
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-2 min-w-0">
                                        <p className="truncate text-sm font-semibold text-slate-900">
                                          {opt.label}
                                        </p>
                                        {opt.disabled && (
                                          <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                                            <Lock className="h-2.5 w-2.5" />
                                            {opt.disabledBadge || 'Terkunci'}
                                          </span>
                                        )}
                                      </div>
                                      {opt.subtitle && (
                                        <p className="mt-0.5 truncate text-xs text-slate-500">
                                          {opt.subtitle}
                                        </p>
                                      )}
                                    </div>
                                  </div>

                                  <div
                                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                                      isSelected
                                        ? 'border-teal-700 bg-teal-700 text-white'
                                        : 'border-slate-300 bg-white'
                                    }`}
                                  >
                                    {isSelected && <Check className="h-3.5 w-3.5" />}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {filteredOptions.map((opt) => {
                    const isSelected = selectedValue === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        disabled={opt.disabled}
                        onClick={() => {
                          if (opt.disabled) return;
                          onSelect(opt.value);
                          handleClose();
                        }}
                        className={`flex min-h-[54px] w-full items-center justify-between gap-3 px-5 py-3 text-left transition-colors ${
                          opt.disabled
                            ? 'cursor-not-allowed bg-slate-50/70 opacity-65'
                            : isSelected
                              ? 'bg-teal-50/50 hover:bg-teal-50/70'
                              : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {opt.codeBadge && (
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-teal-200 bg-teal-50 font-mono text-xs font-bold text-teal-800">
                              {opt.codeBadge}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-900">
                                {opt.label}
                              </p>
                              {opt.disabled && (
                                <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                                  <Lock className="h-2.5 w-2.5" />
                                  {opt.disabledBadge || 'Terkunci'}
                                </span>
                              )}
                            </div>
                            {opt.subtitle && (
                              <p className="mt-0.5 truncate text-xs text-slate-500">{opt.subtitle}</p>
                            )}
                          </div>
                        </div>

                        <div
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                            isSelected
                              ? 'border-teal-700 bg-teal-700 text-white'
                              : 'border-slate-300 bg-white'
                          }`}
                        >
                          {isSelected && <Check className="h-3.5 w-3.5" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-slate-100 px-5 py-3 text-right">
              <button
                type="button"
                onClick={handleClose}
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl px-5 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                Tutup
              </button>
            </div>
          </>
        ) : (
          inlineCreateConfig && (
            <form onSubmit={handleCreateSubmit} noValidate className="flex flex-col">
              {/* Create Sub-View Header */}
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
                <div className="flex items-center gap-2 min-w-0">
                  <button
                    type="button"
                    onClick={() => {
                      setMode('select');
                      setCreateError(null);
                    }}
                    className="inline-flex min-h-[44px] min-w-[44px] -ml-2 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 shrink-0"
                    aria-label="Kembali ke daftar pilihan"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </button>
                  <h2 className="truncate text-base font-bold text-slate-900">
                    {inlineCreateConfig.title}
                  </h2>
                </div>

                <button
                  type="button"
                  onClick={handleClose}
                  className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 shrink-0"
                  aria-label="Tutup"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Create Form Body */}
              <div className="space-y-2 px-5 py-5">
                <label
                  htmlFor="inline-create-input"
                  className="block text-xs font-semibold text-slate-700"
                >
                  {inlineCreateConfig.fieldLabel} <span className="text-rose-600">*</span>
                </label>
                <input
                  id="inline-create-input"
                  type="text"
                  autoFocus
                  inputMode={inlineCreateConfig.inputMode || 'text'}
                  maxLength={inlineCreateConfig.maxLength}
                  placeholder={inlineCreateConfig.placeholder}
                  value={createValue}
                  onChange={(e) => {
                    const next = inlineCreateConfig.normalizeInput
                      ? inlineCreateConfig.normalizeInput(e.target.value)
                      : e.target.value;
                    setCreateValue(next);
                    if (createError) setCreateError(null);
                  }}
                  className={`min-h-[44px] w-full rounded-xl border bg-white px-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15 ${
                    createError ? 'border-rose-400' : 'border-slate-300'
                  }`}
                />
                {inlineCreateConfig.helperText && (
                  <p className="text-[11px] text-slate-500">{inlineCreateConfig.helperText}</p>
                )}
                {createError && <p className="text-xs text-rose-600">{createError}</p>}
              </div>

              {/* Create Footer */}
              <div className="flex items-center justify-end gap-2.5 border-t border-slate-100 bg-white px-5 py-3.5">
                <button
                  type="button"
                  onClick={() => {
                    setMode('select');
                    setCreateError(null);
                  }}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-teal-700 px-6 text-sm font-semibold text-white hover:bg-teal-800"
                >
                  {inlineCreateConfig.submitLabel || 'Simpan'}
                </button>
              </div>
            </form>
          )
        )}
      </div>
    </div>
  );
}
