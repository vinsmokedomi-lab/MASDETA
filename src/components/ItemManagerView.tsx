import { FormEvent, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  ChevronDown,
  Edit3,
  Minus,
  PackagePlus,
  Plus,
  Search,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react';
import { TAHUN_OPTIONS } from '../data/kpmOptions';
import { ItemBantuan, KpmRecord } from '../types/kpm';
import { capitalizeWords, getItemsForYear, normalizeSubItemKey } from '../utils/imageProcessor';
import { FilterSelect } from './FormControls';
import { isNativeAppPlatform } from '../utils/platform';

interface ItemManagerViewProps {
  items: ItemBantuan[];
  records?: KpmRecord[];
  canAdd?: boolean;
  canUpdate?: boolean;
  canDelete?: boolean;
  onBack: () => void;
  onSaveItem: (item: ItemBantuan, orderIndex: number, originalCode?: string) => void;
  onDeleteItem: (tahun: string, code: string) => void;
  onMoveItemOrder: (tahun: string, code: string, direction: 'up' | 'down') => void;
  onUpdateItemSubItems: (tahun: string, code: string, subItems: string[]) => void;
  onCopyItemsFromYear: (fromYear: string, toYear: string) => void;
}

type SatuanOption = 'Unit' | 'Set' | 'Pcs';

interface DeleteLayerState {
  layer: 1 | 2;
  kind: 'item' | 'subitem' | 'form-subitem';
  tahun: string;
  code: string;
  name: string;
  subItemIndex?: number;
  subItemName?: string;
  affectedCount: number;
  confirmedCheck: boolean;
}

export function ItemManagerView({
  items,
  records = [],
  canAdd = true,
  canUpdate = true,
  canDelete = true,
  onBack,
  onSaveItem,
  onDeleteItem,
  onMoveItemOrder,
  onUpdateItemSubItems,
  onCopyItemsFromYear,
}: ItemManagerViewProps) {
  const isNativeApp = isNativeAppPlatform();
  const [selectedYear, setSelectedYear] = useState<string>('2026');
  const [expandedCode, setExpandedCode] = useState<string | null>(null);
  const [inlineSubItemInput, setInlineSubItemInput] = useState('');

  // Form Sub-Screen state ('list' vs 'form')
  const [mode, setMode] = useState<'list' | 'form'>('list');
  const [editingOriginalCode, setEditingOriginalCode] = useState<string | undefined>(undefined);
  const [formYear, setFormYear] = useState<string>('2026');
  const [formName, setFormName] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formOrder, setFormOrder] = useState<number>(1);
  const [formSubItems, setFormSubItems] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  // Master Item Picker Modal
  const [isMasterPickerOpen, setIsMasterPickerOpen] = useState(false);
  const [masterSearch, setMasterSearch] = useState('');

  // Sub-Item Picker Modal
  const [isSubItemPickerOpen, setIsSubItemPickerOpen] = useState(false);
  const [subItemSearch, setSubItemSearch] = useState('');
  const [selectedSubItemDraft, setSelectedSubItemDraft] = useState('');
  const [subItemVolume, setSubItemVolume] = useState<number>(1);
  const [subItemSatuan, setSubItemSatuan] = useState<SatuanOption>('Unit');

  // Layered Delete Confirmation ("Notif Berlapis")
  const [deleteLayerState, setDeleteLayerState] = useState<DeleteLayerState | null>(null);

  const countAffectedKpm = (tahun: string, code: string): number =>
    records.filter((r) => r.tahun === tahun && r.item === code).length;

  const requestDeleteItem = (item: ItemBantuan) => {
    if (!canDelete) return;
    setDeleteLayerState({
      layer: 1,
      kind: 'item',
      tahun: item.tahun,
      code: item.code,
      name: item.name,
      affectedCount: countAffectedKpm(item.tahun, item.code),
      confirmedCheck: false,
    });
  };

  const requestDeleteExpandedSubItem = (item: ItemBantuan, subIdx: number, subName: string) => {
    if (!canDelete) return;
    setDeleteLayerState({
      layer: 1,
      kind: 'subitem',
      tahun: item.tahun,
      code: item.code,
      name: item.name,
      subItemIndex: subIdx,
      subItemName: subName,
      affectedCount: countAffectedKpm(item.tahun, item.code),
      confirmedCheck: false,
    });
  };

  const requestDeleteFormSubItem = (subIdx: number, subName: string) => {
    if (editingOriginalCode && !canDelete) return;
    setDeleteLayerState({
      layer: 1,
      kind: 'form-subitem',
      tahun: formYear,
      code: (formCode || editingOriginalCode || '').trim().toUpperCase(),
      name: formName || 'Paket Item',
      subItemIndex: subIdx,
      subItemName: subName,
      affectedCount: editingOriginalCode ? countAffectedKpm(formYear, editingOriginalCode) : 0,
      confirmedCheck: false,
    });
  };

  const handleConfirmLayeredDelete = () => {
    if (!deleteLayerState || !deleteLayerState.confirmedCheck) return;
    if (deleteLayerState.kind === 'item') {
      onDeleteItem(deleteLayerState.tahun, deleteLayerState.code);
      if (expandedCode === deleteLayerState.code) {
        setExpandedCode(null);
      }
    } else if (deleteLayerState.kind === 'subitem' && deleteLayerState.subItemIndex !== undefined) {
      const targetItem = items.find(
        (i) => i.tahun === deleteLayerState.tahun && i.code === deleteLayerState.code
      );
      if (targetItem) {
        onUpdateItemSubItems(
          targetItem.tahun,
          targetItem.code,
          targetItem.subItems.filter((_, i) => i !== deleteLayerState.subItemIndex)
        );
      }
    } else if (
      deleteLayerState.kind === 'form-subitem' &&
      deleteLayerState.subItemIndex !== undefined
    ) {
      setFormSubItems((prev) => prev.filter((_, i) => i !== deleteLayerState.subItemIndex));
    }
    setDeleteLayerState(null);
  };

  const itemYearOptions = useMemo(() => {
    const set = new Set<string>(TAHUN_OPTIONS);
    items.forEach((i) => {
      if (i.tahun) set.add(i.tahun);
    });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [items]);

  const yearCatalogItems = useMemo(
    () => getItemsForYear(items, selectedYear),
    [items, selectedYear]
  );

  const formYearItems = useMemo(
    () => getItemsForYear(items, formYear),
    [items, formYear]
  );

  const copySourceYear = useMemo(() => {
    if (items.some((i) => i.tahun === '2026' && selectedYear !== '2026')) {
      return '2026';
    }
    const candidate = itemYearOptions.find(
      (yr) => yr !== selectedYear && items.some((i) => i.tahun === yr)
    );
    return candidate || null;
  }, [items, itemYearOptions, selectedYear]);

  // Unique master item templates collected across all years
  const masterItemTemplates = useMemo(() => {
    const map = new Map<string, { name: string; code: string; subItems: string[] }>();
    for (const item of items) {
      const cleanName = capitalizeWords(item.name.trim());
      if (!cleanName) continue;
      const key = cleanName.toLowerCase();
      if (!map.has(key)) {
        map.set(key, {
          name: cleanName,
          code: item.code,
          subItems: [...item.subItems],
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'id'));
  }, [items]);

  // Unique canonical sub-item suggestions across all years
  const canonicalSubItemSuggestions = useMemo(() => {
    const map = new Map<string, string>();
    for (const pkg of items) {
      for (const s of pkg.subItems) {
        const clean = s.replace(/\s*\(\d+\s*(unit|set|pcs)\)\s*$/i, '').trim();
        const key = normalizeSubItemKey(clean);
        if (key && !map.has(key)) {
          map.set(key, capitalizeWords(clean));
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => a.localeCompare(b, 'id'));
  }, [items]);

  const maxOrderChoice = useMemo(() => {
    const count = formYearItems.length;
    return editingOriginalCode ? Math.max(1, count) : count + 1;
  }, [formYearItems.length, editingOriginalCode]);

  const openCreateForm = () => {
    const currentYearItems = getItemsForYear(items, selectedYear);
    setEditingOriginalCode(undefined);
    setFormYear(selectedYear);
    setFormName('');
    setFormCode('');
    setFormOrder(currentYearItems.length + 1);
    setFormSubItems([]);
    setFormError(null);
    setMode('form');
  };

  const openEditForm = (item: ItemBantuan, index: number) => {
    setEditingOriginalCode(item.code);
    setFormYear(item.tahun);
    setFormName(item.name);
    setFormCode(item.code);
    setFormOrder(index + 1);
    setFormSubItems([...item.subItems]);
    setFormError(null);
    setMode('form');
  };

  const handleSelectMasterTemplate = (tpl: {
    name: string;
    code: string;
    subItems: string[];
  }) => {
    setFormName(tpl.name);
    if (!editingOriginalCode && !formCode.trim()) {
      setFormCode(tpl.code);
    }
    if (formSubItems.length === 0 && tpl.subItems.length > 0) {
      setFormSubItems([...tpl.subItems]);
    }
    setFormError(null);
    setIsMasterPickerOpen(false);
    setMasterSearch('');
  };

  const handleUseCustomMasterName = () => {
    const clean = capitalizeWords(masterSearch.trim());
    if (!clean) return;
    setFormName(clean);
    setFormError(null);
    setIsMasterPickerOpen(false);
    setMasterSearch('');
  };

  const handleAddSubItemFromModal = () => {
    const baseName = capitalizeWords(
      (selectedSubItemDraft || subItemSearch).trim()
    );
    if (!baseName) return;

    const formatted =
      subItemVolume === 1 && subItemSatuan === 'Unit'
        ? baseName
        : `${baseName} (${subItemVolume} ${subItemSatuan})`;

    const key = normalizeSubItemKey(formatted);
    if (!formSubItems.some((s) => normalizeSubItemKey(s) === key)) {
      setFormSubItems((prev) => [...prev, formatted]);
    }
    setFormError(null);
    setIsSubItemPickerOpen(false);
    setSubItemSearch('');
    setSelectedSubItemDraft('');
    setSubItemVolume(1);
    setSubItemSatuan('Unit');
  };

  const handleFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    const cleanName = capitalizeWords(formName.trim());
    const cleanCode = formCode.trim().toUpperCase();

    if (!formYear) {
      setFormError('Tahun wajib dipilih.');
      return;
    }
    if (!cleanName) {
      setFormError('Nama master item wajib diisi.');
      return;
    }
    if (!cleanCode) {
      setFormError('Kode item wajib diisi.');
      return;
    }
    const duplicateCode = formYearItems.some(
      (i) => i.code === cleanCode && i.code !== editingOriginalCode
    );
    if (duplicateCode) {
      setFormError(`Kode item "${cleanCode}" sudah terdaftar pada tahun ${formYear}.`);
      return;
    }
    if (formSubItems.length === 0) {
      setFormError('Silakan tambahkan minimal 1 sub-item terlebih dahulu.');
      return;
    }

    onSaveItem(
      {
        id: `${formYear}-${cleanCode}`,
        tahun: formYear,
        code: cleanCode,
        name: cleanName,
        subItems: formSubItems,
      },
      Math.max(0, formOrder - 1),
      editingOriginalCode
    );

    setSelectedYear(formYear);
    setExpandedCode(cleanCode);
    setMode('list');
  };

  const handleInlineAddSubItem = (pkg: ItemBantuan) => {
    const raw = inlineSubItemInput.trim();
    if (!raw) return;
    const key = normalizeSubItemKey(raw);
    const existingCanonical =
      canonicalSubItemSuggestions.find((s) => normalizeSubItemKey(s) === key) ||
      capitalizeWords(raw);
    if (pkg.subItems.some((s) => normalizeSubItemKey(s) === key)) {
      setInlineSubItemInput('');
      return;
    }
    onUpdateItemSubItems(pkg.tahun, pkg.code, [...pkg.subItems, existingCanonical]);
    setInlineSubItemInput('');
  };

  // RENDER FORM SCREEN (TAMBAH / EDIT ITEM)
  if (mode === 'form') {
    const canConfigureSubItems = Boolean(formYear && formName.trim() && formCode.trim());
    const filteredTemplates = masterItemTemplates.filter((tpl) =>
      tpl.name.toLowerCase().includes(masterSearch.trim().toLowerCase()) ||
      tpl.code.toLowerCase().includes(masterSearch.trim().toLowerCase())
    );
    const customMasterClean = capitalizeWords(masterSearch.trim());
    const hasExactMasterMatch = masterItemTemplates.some(
      (t) => t.name.toLowerCase() === customMasterClean.toLowerCase()
    );

    const filteredSubSuggestions = canonicalSubItemSuggestions.filter((sub) =>
      sub.toLowerCase().includes(subItemSearch.trim().toLowerCase())
    );
    const customSubClean = capitalizeWords(subItemSearch.trim());
    const hasExactSubMatch = canonicalSubItemSuggestions.some(
      (s) => s.toLowerCase() === customSubClean.toLowerCase()
    );

    return (
      <div className="min-h-screen pb-24">
        <header
          className={`sticky top-0 z-20 flex h-14 items-center gap-1.5 border-b border-slate-200 bg-white/95 px-3 backdrop-blur-md ${
            !isNativeApp ? 'lg:px-6' : ''
          }`}
        >
          <button
            type="button"
            onClick={() => setMode('list')}
            className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl text-slate-700 transition-colors hover:bg-slate-100"
            aria-label="Kembali ke daftar item"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="truncate text-base font-bold text-slate-900">
            {editingOriginalCode ? 'Edit Item Bantuan' : 'Tambah Item Bantuan'}
          </h1>
        </header>

        <form
          onSubmit={handleFormSubmit}
          noValidate
          className={`space-y-4 px-4 pt-4 ${
            !isNativeApp ? 'lg:mx-auto lg:max-w-4xl lg:px-6 lg:pt-6' : ''
          }`}
        >
          <section className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4">
            {/* 1. Tahun */}
            <div>
              <label htmlFor="item-form-tahun" className="block text-xs font-semibold text-slate-700">
                Tahun <span className="text-rose-600">*</span>
              </label>
              <FilterSelect
                ariaLabel="Pilih tahun item"
                value={formYear}
                onChange={(nextYr) => {
                  setFormYear(nextYr);
                  const yrCount = getItemsForYear(items, nextYr).length;
                  setFormOrder(editingOriginalCode ? Math.max(1, yrCount) : yrCount + 1);
                  setFormError(null);
                }}
                className="mt-1.5"
              >
                {itemYearOptions.map((yr) => (
                  <option key={yr} value={yr}>
                    {yr}
                  </option>
                ))}
              </FilterSelect>
            </div>

            {/* 2. Nama Master Item / Paket Item (Pilih dari daftar atau ketik baru inisial kapital) */}
            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Nama Master Item / Paket Item <span className="text-rose-600">*</span>
              </label>
              <button
                type="button"
                onClick={() => {
                  setMasterSearch('');
                  setIsMasterPickerOpen(true);
                }}
                className="mt-1.5 flex min-h-[44px] w-full items-center justify-between gap-2 rounded-xl border border-slate-300 bg-white px-3.5 text-left text-sm transition-colors hover:border-teal-700 focus:border-teal-700 focus:outline-none"
              >
                <span className={formName ? 'truncate font-medium text-slate-900' : 'truncate text-xs text-slate-400'}>
                  {formName || 'Pilih paket yang ada atau ketik baru'}
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
              </button>
            </div>

            {/* 3. Kode Item & 4. Urutan Prioritas Item */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="item-form-code" className="block text-xs font-semibold text-slate-700">
                  Kode Item <span className="text-rose-600">*</span>
                </label>
                <input
                  id="item-form-code"
                  type="text"
                  maxLength={6}
                  value={formCode}
                  onChange={(e) => {
                    setFormCode(e.target.value.toUpperCase());
                    if (formError) setFormError(null);
                  }}
                  placeholder="Contoh: KPR"
                  className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm font-bold uppercase text-slate-900 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15"
                />
              </div>

              <div>
                <label htmlFor="item-form-order" className="block text-xs font-semibold text-slate-700">
                  Urutan Prioritas <span className="text-rose-600">*</span>
                </label>
                <FilterSelect
                  ariaLabel="Pilih urutan prioritas item"
                  value={String(formOrder)}
                  onChange={(val) => setFormOrder(Number(val) || 1)}
                  className="mt-1.5"
                >
                  {Array.from({ length: maxOrderChoice }, (_, idx) => idx + 1).map((num) => (
                    <option key={num} value={num}>
                      Urutan {num}
                    </option>
                  ))}
                </FilterSelect>
              </div>
            </div>
          </section>

          {/* 5. Opsi Tambah Sub-Item (muncul setelah Tahun, Nama Master Item, dan Kode Item terisi) */}
          {canConfigureSubItems && (
            <section className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    Sub-Item Paket <span className="text-rose-600">*</span>
                  </h2>
                  <p className="text-xs text-slate-500">
                    Daftar perlengkapan di dalam paket {formCode}
                  </p>
                </div>
                <span className="shrink-0 text-xs font-bold text-teal-700 tabular-nums">
                  {formSubItems.length} Item
                </span>
              </div>

              {formSubItems.length > 0 && (
                <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
                  {formSubItems.map((sub, idx) => (
                    <div
                      key={`${sub}-${idx}`}
                      className="flex items-center justify-between gap-2 bg-slate-50/50 px-3 py-2.5"
                    >
                      <span className="text-xs font-semibold text-slate-800">
                        {idx + 1}. {sub}
                      </span>
                      <button
                        type="button"
                        disabled={Boolean(editingOriginalCode) && !canDelete}
                        onClick={() => requestDeleteFormSubItem(idx, sub)}
                        aria-label={`Hapus sub-item ${sub}`}
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  setSubItemSearch('');
                  setSelectedSubItemDraft('');
                  setSubItemVolume(1);
                  setSubItemSatuan('Unit');
                  setIsSubItemPickerOpen(true);
                }}
                className="inline-flex min-h-[42px] w-full items-center justify-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50 px-4 text-xs font-bold text-teal-800 transition-colors hover:bg-teal-100"
              >
                <Plus className="h-4 w-4" />
                <span>Tambah Sub-Item</span>
              </button>
            </section>
          )}

          {formError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700">
              {formError}
            </div>
          )}

          <div className="flex items-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => setMode('list')}
              className="min-h-[46px] flex-1 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Batal
            </button>
            <button
              type="submit"
              className="min-h-[46px] flex-1 rounded-xl bg-teal-700 text-sm font-semibold text-white hover:bg-teal-800"
            >
              Simpan Item
            </button>
          </div>
        </form>

        {/* Modal Picker: Nama Master Item */}
        {isMasterPickerOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 backdrop-blur-[1px] sm:items-center sm:p-4">
            <div className="flex max-h-[82vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-white sm:rounded-3xl">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5">
                <h2 className="text-base font-bold text-slate-900">Nama Master Item</h2>
                <button
                  type="button"
                  onClick={() => setIsMasterPickerOpen(false)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
                  aria-label="Tutup"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="border-b border-slate-100 p-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    autoFocus
                    autoCapitalize="words"
                    value={masterSearch}
                    onChange={(e) => setMasterSearch(capitalizeWords(e.target.value))}
                    placeholder="Pencarian..."
                    className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white pr-9 pl-10 text-sm text-slate-900 focus:border-teal-700 focus:outline-none"
                  />
                  {masterSearch && (
                    <button
                      type="button"
                      onClick={() => setMasterSearch('')}
                      className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded-lg p-1 text-slate-400 hover:text-slate-700"
                      aria-label="Bersihkan pencarian"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
                {customMasterClean && !hasExactMasterMatch && (
                  <button
                    type="button"
                    onClick={handleUseCustomMasterName}
                    className="flex w-full items-center gap-2.5 bg-teal-50/70 px-4 py-3.5 text-left transition-colors hover:bg-teal-100/70"
                  >
                    <Plus className="h-4 w-4 shrink-0 text-teal-700" />
                    <span className="text-sm font-bold text-teal-900">
                      Gunakan &ldquo;{customMasterClean}&rdquo;
                    </span>
                  </button>
                )}

                {filteredTemplates.map((tpl) => {
                  const selected = formName.toLowerCase() === tpl.name.toLowerCase();
                  return (
                    <button
                      key={tpl.name}
                      type="button"
                      onClick={() => handleSelectMasterTemplate(tpl)}
                      className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 ${
                        selected ? 'bg-teal-50/60' : ''
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {tpl.name}
                        </p>
                        <p className="truncate text-xs text-slate-500">
                          Kode: {tpl.code} · {tpl.subItems.length} sub-item
                        </p>
                      </div>
                      {selected && <Check className="h-4 w-4 shrink-0 text-teal-700" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Modal Picker: Tambah Sub-Item (Pilih master atau ketik baru + Volume & Satuan) */}
        {isSubItemPickerOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 backdrop-blur-[1px] sm:items-center sm:p-4">
            <div className="flex max-h-[86vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-white sm:rounded-3xl">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5">
                <h2 className="text-base font-bold text-slate-900">Tambah Sub-Item</h2>
                <button
                  type="button"
                  onClick={() => setIsSubItemPickerOpen(false)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
                  aria-label="Tutup"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-3 border-b border-slate-100 p-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Nama Sub-Item (Pilih atau Ketik Baru)
                  </label>
                  <div className="relative mt-1.5">
                    <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      autoFocus
                      autoCapitalize="words"
                      value={selectedSubItemDraft || subItemSearch}
                      onChange={(e) => {
                        setSelectedSubItemDraft('');
                        setSubItemSearch(capitalizeWords(e.target.value));
                      }}
                      placeholder="Pencarian..."
                      className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white pr-9 pl-10 text-sm text-slate-900 focus:border-teal-700 focus:outline-none"
                    />
                    {(selectedSubItemDraft || subItemSearch) && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedSubItemDraft('');
                          setSubItemSearch('');
                        }}
                        className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded-lg p-1 text-slate-400 hover:text-slate-700"
                        aria-label="Hapus pilihan"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Volume & Satuan */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">Jumlah</label>
                    <div className="mt-1.5 flex min-h-[42px] items-center justify-between rounded-xl border border-slate-300 bg-white px-2">
                      <button
                        type="button"
                        onClick={() => setSubItemVolume((v) => Math.max(1, v - 1))}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
                        aria-label="Kurangi jumlah"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="text-sm font-bold text-slate-900 tabular-nums">
                        {subItemVolume}
                      </span>
                      <button
                        type="button"
                        onClick={() => setSubItemVolume((v) => v + 1)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
                        aria-label="Tambah jumlah"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700">Satuan</label>
                    <FilterSelect
                      ariaLabel="Pilih satuan sub-item"
                      value={subItemSatuan}
                      onChange={(val) => setSubItemSatuan(val as SatuanOption)}
                      className="mt-1.5"
                    >
                      <option value="Unit">Unit</option>
                      <option value="Set">Set</option>
                      <option value="Pcs">Pcs</option>
                    </FilterSelect>
                  </div>
                </div>
              </div>

              <div className="max-h-52 flex-1 overflow-y-auto divide-y divide-slate-100">
                {customSubClean && !hasExactSubMatch && !selectedSubItemDraft && (
                  <button
                    type="button"
                    onClick={() => setSelectedSubItemDraft(customSubClean)}
                    className="flex w-full items-center gap-2 bg-teal-50/60 px-4 py-2.5 text-left text-xs font-bold text-teal-800 hover:bg-teal-100/70"
                  >
                    <Plus className="h-3.5 w-3.5 shrink-0" />
                    <span>Gunakan &ldquo;{customSubClean}&rdquo;</span>
                  </button>
                )}

                {filteredSubSuggestions.map((sub) => {
                  const isPicked = selectedSubItemDraft === sub;
                  return (
                    <button
                      key={sub}
                      type="button"
                      onClick={() => {
                        setSelectedSubItemDraft(sub);
                        setSubItemSearch('');
                      }}
                      className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-xs font-medium transition-colors hover:bg-slate-50 ${
                        isPicked ? 'bg-teal-50 font-bold text-teal-800' : 'text-slate-800'
                      }`}
                    >
                      <span>{sub}</span>
                      {isPicked && <Check className="h-3.5 w-3.5 text-teal-700" />}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-2 border-t border-slate-100 bg-slate-50/70 p-3">
                <button
                  type="button"
                  onClick={() => setIsSubItemPickerOpen(false)}
                  className="min-h-[42px] flex-1 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={!(selectedSubItemDraft || subItemSearch).trim()}
                  onClick={handleAddSubItemFromModal}
                  className="min-h-[42px] flex-1 rounded-xl bg-teal-700 text-xs font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  Tambahkan
                </button>
              </div>
            </div>
          </div>
        )}

        {deleteLayerState && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Konfirmasi Hapus Sub-Item"
            className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 p-4 backdrop-blur-[1px] sm:items-center"
          >
            <div className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-5 shadow-xl space-y-4">
              {deleteLayerState.layer === 1 ? (
                <>
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                      <AlertTriangle className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700">
                        Konfirmasi Tahap 1 dari 2
                      </p>
                      <h3 className="text-sm font-bold text-slate-900">
                        Hapus Sub-Item dari Paket?
                      </h3>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 space-y-1 text-xs">
                    <p className="font-bold text-slate-900">{deleteLayerState.subItemName}</p>
                    <p className="text-slate-600">
                      Paket: {deleteLayerState.name} ({deleteLayerState.code || '-'} ·{' '}
                      {deleteLayerState.tahun})
                    </p>
                    <p className="font-semibold text-amber-800">
                      {deleteLayerState.affectedCount > 0
                        ? `Dipakai oleh ${deleteLayerState.affectedCount} data KPM pada tahun ${deleteLayerState.tahun}.`
                        : 'Sub-item akan dihapus dari susunan paket ini.'}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setDeleteLayerState(null)}
                      className="min-h-[42px] flex-1 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setDeleteLayerState((prev) =>
                          prev ? { ...prev, layer: 2, confirmedCheck: false } : null
                        )
                      }
                      className="min-h-[42px] flex-1 rounded-xl bg-amber-600 text-xs font-semibold text-white hover:bg-amber-700"
                    >
                      Lanjutkan Hapus
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-rose-100 text-rose-700">
                      <ShieldAlert className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-rose-700">
                        Konfirmasi Tahap 2 dari 2
                      </p>
                      <h3 className="text-sm font-bold text-rose-900">
                        Penghapusan Permanen Sub-Item
                      </h3>
                    </div>
                  </div>
                  <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs leading-relaxed text-rose-800">
                    Menghapus sub-item <strong>{deleteLayerState.subItemName}</strong> akan
                    menghilangkannya dari checklist penyaluran paket{' '}
                    <strong>{deleteLayerState.code || deleteLayerState.name}</strong>.
                  </p>
                  <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={deleteLayerState.confirmedCheck}
                      onChange={(e) =>
                        setDeleteLayerState((prev) =>
                          prev ? { ...prev, confirmedCheck: e.target.checked } : null
                        )
                      }
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-600"
                    />
                    <span className="text-xs font-semibold text-slate-700">
                      Saya yakin menghapus sub-item ini dari susunan paket.
                    </span>
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setDeleteLayerState((prev) => (prev ? { ...prev, layer: 1 } : null))
                      }
                      className="min-h-[42px] flex-1 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Kembali
                    </button>
                    <button
                      type="button"
                      disabled={!deleteLayerState.confirmedCheck}
                      onClick={handleConfirmLayeredDelete}
                      className="min-h-[42px] flex-1 rounded-xl bg-rose-600 text-xs font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      Ya, Hapus Permanen
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // RENDER MAIN LIST SCREEN (PILIH TAHUN + TOMBOL TAMBAH ITEM + DAFTAR ITEM)
  return (
    <div className="min-h-screen pb-24">
      <header
        className={`sticky top-0 z-20 flex h-14 items-center gap-1.5 border-b border-slate-200 bg-white/95 px-3 backdrop-blur-md ${
          !isNativeApp ? 'lg:px-6' : ''
        }`}
      >
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl text-slate-700 transition-colors hover:bg-slate-100"
          aria-label="Kembali"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="truncate text-base font-bold text-slate-900">Kelola Item &amp; Sub-Item</h1>
      </header>

      <div
        className={`space-y-4 px-4 pt-4 ${
          !isNativeApp ? 'lg:mx-auto lg:max-w-[1440px] lg:px-6 lg:pt-6' : ''
        }`}
      >
        {/* Top Bar: Pilih Tahun + Tombol Tambah Item */}
        <div className={`flex items-center gap-2 ${!isNativeApp ? 'lg:justify-between' : ''}`}>
          <FilterSelect
            ariaLabel="Pilih tahun katalog item"
            value={selectedYear}
            onChange={(nextYear) => {
              setSelectedYear(nextYear);
              setExpandedCode(null);
            }}
            className="w-[104px] shrink-0"
          >
            {itemYearOptions.map((yr) => (
              <option key={yr} value={yr}>
                {yr}
              </option>
            ))}
          </FilterSelect>

          {canAdd && (
            <button
              type="button"
              onClick={openCreateForm}
              className={`inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-teal-800 active:scale-[0.99] ${
                !isNativeApp ? 'lg:flex-none lg:px-5' : ''
              }`}
            >
              <PackagePlus className="h-4 w-4 shrink-0" />
              <span>Tambah Item</span>
            </button>
          )}
        </div>

        {/* Item List for Selected Year */}
        {yearCatalogItems.length === 0 ? (
          <div
            className={`rounded-2xl border border-slate-200 bg-white p-6 text-center space-y-3 ${
              !isNativeApp ? 'lg:mx-auto lg:max-w-xl' : ''
            }`}
          >
            <p className="text-sm font-bold text-slate-900">
              Belum ada master item untuk tahun {selectedYear}
            </p>
            <p className="text-xs text-slate-500">
              {copySourceYear
                ? `Tambahkan item baru atau salin susunan paket dari tahun ${copySourceYear}.`
                : 'Belum ada item bantuan yang tersimpan pada tahun mana pun.'}
            </p>
            {canAdd && copySourceYear && (
              <div className="flex flex-col gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => onCopyItemsFromYear(copySourceYear, selectedYear)}
                  className="inline-flex min-h-[42px] w-full items-center justify-center rounded-xl border border-teal-200 bg-teal-50 px-4 text-xs font-bold text-teal-800 hover:bg-teal-100"
                >
                  Salin Susunan Paket dari Tahun {copySourceYear}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div
            className={`overflow-hidden rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100 ${
              !isNativeApp
                ? 'lg:grid lg:grid-cols-2 lg:items-start lg:gap-4 lg:divide-y-0 lg:overflow-visible lg:rounded-none lg:border-0 lg:bg-transparent'
                : ''
            }`}
          >
            <datalist id="canonical-subitem-suggestions">
              {canonicalSubItemSuggestions.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>

            {yearCatalogItems.map((item, idx) => {
              const isExpanded = expandedCode === item.code;
              return (
                <div
                  key={`${item.tahun}-${item.code}`}
                  className={`bg-white ${
                    !isNativeApp
                      ? 'lg:overflow-hidden lg:rounded-2xl lg:border lg:border-slate-200 lg:shadow-xs'
                      : ''
                  }`}
                >
                  <div className="flex items-center justify-between gap-1.5 px-3 py-3">
                    <span className="w-5 shrink-0 text-center font-mono text-xs font-bold text-slate-400 tabular-nums">
                      {idx + 1}
                    </span>

                    <button
                      type="button"
                      onClick={() => {
                        setExpandedCode(isExpanded ? null : item.code);
                        setInlineSubItemInput('');
                      }}
                      className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                    >
                      <span className="flex h-9 w-11 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-xs font-bold text-teal-800">
                        {item.code}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900">{item.name}</p>
                        <p className="truncate text-xs text-slate-500">
                          {item.subItems.length} sub-item
                          {item.subItems.length > 0 ? ` · ${item.subItems.join(', ')}` : ''}
                        </p>
                      </div>
                      <ChevronDown
                        className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${
                          isExpanded ? 'rotate-180' : ''
                        }`}
                      />
                    </button>

                    {canUpdate && (
                      <div className="flex shrink-0 items-center gap-0.5">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => onMoveItemOrder(item.tahun, item.code, 'up')}
                          aria-label={`Naikkan urutan ${item.code}`}
                          className="inline-flex h-8 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === yearCatalogItems.length - 1}
                          onClick={() => onMoveItemOrder(item.tahun, item.code, 'down')}
                          aria-label={`Turunkan urutan ${item.code}`}
                          className="inline-flex h-8 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  {isExpanded && (
                    <div className="border-t border-slate-100 bg-slate-50/70 px-4 py-3 space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-bold text-slate-700">
                          Daftar Sub-Item ({item.code} · {item.tahun})
                        </p>
                        {(canUpdate || canDelete) && (
                          <div className="flex shrink-0 items-center gap-1">
                            {canUpdate && (
                              <button
                                type="button"
                                onClick={() => openEditForm(item, idx)}
                                aria-label={`Edit paket ${item.code}`}
                                title="Ubah Paket"
                                className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-600 transition-colors hover:bg-teal-50 hover:text-teal-700"
                              >
                                <Edit3 className="h-[18px] w-[18px]" />
                              </button>
                            )}
                            {canDelete && (
                              <button
                                type="button"
                                onClick={() => requestDeleteItem(item)}
                                aria-label={`Hapus paket ${item.code} tahun ${item.tahun}`}
                                title="Hapus Paket"
                                className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-rose-600 transition-colors hover:bg-rose-50 hover:text-rose-700"
                              >
                                <Trash2 className="h-[18px] w-[18px]" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      {item.subItems.length > 0 && (
                        <div className="divide-y divide-slate-200/70 overflow-hidden rounded-xl border border-slate-200 bg-white">
                          {item.subItems.map((sub, subIdx) => (
                            <div
                              key={`${sub}-${subIdx}`}
                              className="flex items-center justify-between gap-2 px-3 py-2"
                            >
                              <span className="text-xs font-medium text-slate-800">
                                {subIdx + 1}. {sub}
                              </span>
                              {canDelete && (
                                <button
                                  type="button"
                                  onClick={() => requestDeleteExpandedSubItem(item, subIdx, sub)}
                                  aria-label={`Hapus sub-item ${sub}`}
                                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {canUpdate && (
                        <div className="flex gap-2">
                          <input
                            type="text"
                            autoCapitalize="words"
                            list="canonical-subitem-suggestions"
                            value={inlineSubItemInput}
                            onChange={(e) => setInlineSubItemInput(capitalizeWords(e.target.value))}
                            placeholder="Tambah sub-item cepat..."
                            className="min-h-[38px] flex-1 rounded-xl border border-slate-300 bg-white px-3 text-xs focus:border-teal-700 focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => handleInlineAddSubItem(item)}
                            className="inline-flex min-h-[38px] items-center gap-1 rounded-xl bg-teal-700 px-3 text-xs font-semibold text-white hover:bg-teal-800"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            <span>Tambah</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Layered Delete Confirmation Modal ("Notif Berlapis") */}
      {deleteLayerState && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Konfirmasi Hapus Item Bantuan"
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 p-4 backdrop-blur-[1px] sm:items-center"
        >
          <div className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-5 shadow-xl space-y-4">
            {deleteLayerState.layer === 1 ? (
              <>
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                    <AlertTriangle className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700">
                      Notifikasi Lapis 1 dari 2
                    </p>
                    <h3 className="text-sm font-bold text-slate-900">
                      {deleteLayerState.kind === 'item'
                        ? 'Apakah Anda yakin ingin menghapus paket item ini?'
                        : 'Apakah Anda yakin ingin menghapus sub-item ini?'}
                    </h3>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 space-y-1 text-xs">
                  {deleteLayerState.kind === 'item' ? (
                    <p className="font-bold text-slate-900">
                      {deleteLayerState.name} ({deleteLayerState.code} · {deleteLayerState.tahun})
                    </p>
                  ) : (
                    <>
                      <p className="font-bold text-slate-900">{deleteLayerState.subItemName}</p>
                      <p className="text-slate-600">
                        Paket: {deleteLayerState.name} ({deleteLayerState.code} ·{' '}
                        {deleteLayerState.tahun})
                      </p>
                    </>
                  )}
                  <p className="font-semibold text-amber-800">
                    {deleteLayerState.affectedCount > 0
                      ? `Terkait dengan ${deleteLayerState.affectedCount} data KPM pada tahun ${deleteLayerState.tahun}.`
                      : `Belum ada data KPM yang memakai ${
                          deleteLayerState.kind === 'item' ? 'item' : 'paket'
                        } ini di tahun ${deleteLayerState.tahun}.`}
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setDeleteLayerState(null)}
                    className="min-h-[42px] flex-1 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setDeleteLayerState((prev) =>
                        prev ? { ...prev, layer: 2, confirmedCheck: false } : null
                      )
                    }
                    className="min-h-[42px] flex-1 rounded-xl bg-amber-600 text-xs font-semibold text-white hover:bg-amber-700"
                  >
                    Lanjutkan Hapus
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-rose-100 text-rose-700">
                    <ShieldAlert className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-rose-700">
                      Notifikasi Lapis 2 dari 2
                    </p>
                    <h3 className="text-sm font-bold text-rose-900">
                      Konfirmasi Penghapusan Permanen
                    </h3>
                  </div>
                </div>

                <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs leading-relaxed text-rose-800">
                  {deleteLayerState.kind === 'item' ? (
                    <>
                      Master item <strong>{deleteLayerState.name}</strong> (
                      <strong>{deleteLayerState.code}</strong>) akan dihapus permanen dari katalog
                      tahun <strong>{deleteLayerState.tahun}</strong>. Rekapitulasi item &amp;
                      checklist penerima akan ikut terpengaruh.
                    </>
                  ) : (
                    <>
                      Sub-item <strong>{deleteLayerState.subItemName}</strong> akan dihapus permanen
                      dari paket <strong>{deleteLayerState.code}</strong> ({deleteLayerState.tahun}
                      ) termasuk daftar kewajiban penyalurannya.
                    </>
                  )}
                </p>

                <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={deleteLayerState.confirmedCheck}
                    onChange={(e) =>
                      setDeleteLayerState((prev) =>
                        prev ? { ...prev, confirmedCheck: e.target.checked } : null
                      )
                    }
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-600"
                  />
                  <span className="text-xs font-semibold text-slate-700">
                    Saya yakin menghapus {deleteLayerState.kind === 'item' ? 'item' : 'sub-item'} ini
                    secara permanen.
                  </span>
                </label>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setDeleteLayerState((prev) => (prev ? { ...prev, layer: 1 } : null))
                    }
                    className="min-h-[42px] flex-1 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Kembali
                  </button>
                  <button
                    type="button"
                    disabled={!deleteLayerState.confirmedCheck}
                    onClick={handleConfirmLayeredDelete}
                    className="min-h-[42px] flex-1 rounded-xl bg-rose-600 text-xs font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    Ya, Hapus Permanen
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
