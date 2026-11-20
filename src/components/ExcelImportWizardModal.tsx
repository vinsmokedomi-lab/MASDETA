import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Upload,
  X,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { KpmRecord, ProposalRecord } from '../types/kpm';
import { ImportPreviewSummary, previewImportFile } from '../utils/csvImporter';
import { useOfflineStatus } from '../contexts/OfflineContext';

interface ExcelImportWizardModalProps {
  isOpen: boolean;
  existingRecords: KpmRecord[];
  existingProposals: ProposalRecord[];
  onClose: () => void;
  onConfirmImport: (csvText: string, skipDuplicates: boolean) => Promise<void>;
}

export const ExcelImportWizardModal: React.FC<ExcelImportWizardModalProps> = ({
  isOpen,
  existingRecords,
  existingProposals,
  onClose,
  onConfirmImport,
}) => {
  const { isOffline } = useOfflineStatus();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState('');
  const [csvText, setCsvText] = useState('');
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [parseError, setParseError] = useState('');

  const preview: ImportPreviewSummary | null = useMemo(() => {
    if (!csvText.trim()) return null;
    return previewImportFile({
      csvText,
      existingRecords,
      existingProposals,
    });
  }, [csvText, existingRecords, existingProposals]);

  if (!isOpen) return null;

  const resetModal = () => {
    setFileName('');
    setCsvText('');
    setParseError('');
    setIsParsing(false);
    setIsImporting(false);
  };

  const handleClose = () => {
    if (isImporting) return;
    resetModal();
    onClose();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setFileName(file.name);
    setParseError('');
    setIsParsing(true);

    try {
      const lower = file.name.toLowerCase();
      if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer, { type: 'array' });
        const firstSheet = wb.SheetNames[0];
        if (!firstSheet) throw new Error('Workbook Excel tidak memiliki sheet.');
        const sheet = wb.Sheets[firstSheet];
        const generatedCsv = XLSX.utils.sheet_to_csv(sheet, { FS: ';' });
        setCsvText(generatedCsv);
      } else {
        const text = await file.text();
        setCsvText(text);
      }
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Gagal membaca file Excel/CSV.');
      setCsvText('');
    } finally {
      setIsParsing(false);
    }
  };

  const handleExecuteImport = async () => {
    if (isOffline || !csvText || !preview || preview.error || isImporting) return;
    setIsImporting(true);
    try {
      await onConfirmImport(csvText, skipDuplicates);
      resetModal();
      onClose();
    } catch {
      setIsImporting(false);
    }
  };

  const countToImport = preview
    ? skipDuplicates
      ? preview.validCount
      : preview.totalRows
    : 0;

  return (
    <div className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm p-0 sm:p-4">
      <div className="w-full max-w-md max-h-[90vh] flex flex-col bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200/80 overflow-hidden animate-in slide-in-from-bottom-4 duration-200">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Wizard Impor Excel & CSV</h3>
              <p className="text-[11px] text-slate-500">Pratinjau & cek duplikat sebelum disimpan</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="w-10 h-10 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            onChange={handleFileChange}
            className="hidden"
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full p-4 rounded-2xl border-2 border-dashed border-slate-300 hover:border-teal-500 bg-slate-50/70 hover:bg-teal-50/30 transition-colors flex flex-col items-center text-center gap-1.5"
          >
            {isParsing ? (
              <Loader2 className="w-6 h-6 text-teal-600 animate-spin" />
            ) : (
              <Upload className="w-6 h-6 text-teal-700" />
            )}
            <span className="text-xs font-bold text-slate-800">
              {fileName ? fileName : 'Pilih File Excel (.xlsx / .xls) atau CSV'}
            </span>
            <span className="text-[11px] text-slate-500">
              Kolom didukung: NAMA, ITEM, NIK KTP, NIK KK, ALAMAT, RT, RW, PROPOSAL, TAHUN
            </span>
          </button>

          {parseError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{parseError}</span>
            </div>
          )}

          {preview?.error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{preview.error}</span>
            </div>
          )}

          {preview && !preview.error && (
            <>
              <div className="grid grid-cols-3 gap-2">
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 text-center">
                  <p className="text-base font-bold text-slate-900 tabular-nums">{preview.totalRows}</p>
                  <p className="text-[10px] text-slate-500">Total Baris</p>
                </div>
                <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200/80 text-center">
                  <p className="text-base font-bold text-emerald-700 tabular-nums">
                    {preview.validCount}
                  </p>
                  <p className="text-[10px] text-emerald-700">Siap Impor</p>
                </div>
                <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200/80 text-center">
                  <p className="text-base font-bold text-amber-700 tabular-nums">
                    {preview.duplicateCount}
                  </p>
                  <p className="text-[10px] text-amber-700">Duplikat</p>
                </div>
              </div>

              {preview.newProposalCount > 0 && (
                <div className="p-3 rounded-xl bg-teal-50/70 border border-teal-200 text-[11px] text-teal-900">
                  <span className="font-bold">{preview.newProposalCount} proposal baru</span> akan
                  dibuat otomatis: {preview.newProposals.slice(0, 3).join(', ')}
                  {preview.newProposals.length > 3 ? `, +${preview.newProposals.length - 3} lainnya` : ''}
                </div>
              )}

              <label className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={skipDuplicates}
                  onChange={(e) => setSkipDuplicates(e.target.checked)}
                  className="w-4 h-4 accent-teal-700 rounded"
                />
                <span className="text-xs font-medium text-slate-700">
                  Lewati otomatis data duplikat dalam proposal yang sama
                </span>
              </label>

              <div className="rounded-2xl border border-slate-200 overflow-hidden">
                <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-700">
                    Pratinjau Data ({Math.min(preview.rows.length, 30)} dari {preview.rows.length})
                  </span>
                </div>
                <div className="max-h-52 overflow-y-auto divide-y divide-slate-100">
                  {preview.rows.slice(0, 30).map((row) => (
                    <div
                      key={row.rowNumber}
                      className="px-3 py-2 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 truncate">
                          {row.rowNumber}. {row.nama}
                        </p>
                        <p className="text-[10px] text-slate-500 truncate tabular-nums">
                          {row.item} · {row.nikKtp || 'Tanpa NIK'} · {row.proposal} ({row.tahun})
                        </p>
                        {row.note && (
                          <p className="text-[10px] text-amber-700 truncate">{row.note}</p>
                        )}
                      </div>
                      <span
                        className={`shrink-0 text-[10px] font-bold ${
                          row.status === 'duplicate'
                            ? 'text-amber-600'
                            : row.status === 'missing_item'
                              ? 'text-slate-600'
                              : 'text-emerald-700'
                        }`}
                      >
                        {row.status === 'duplicate'
                          ? 'Duplikat'
                          : row.status === 'missing_item'
                            ? 'Default OV'
                            : 'Valid'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="p-4 border-t border-slate-100 bg-white flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleClose}
            className="flex-1 h-11 rounded-xl border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={isOffline || !preview || Boolean(preview.error) || countToImport === 0 || isImporting}
            onClick={handleExecuteImport}
            className="flex-[1.5] h-11 rounded-xl bg-teal-700 text-white text-xs font-semibold hover:bg-teal-800 disabled:opacity-45 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5"
          >
            {isImporting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Mengimpor...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                Impor {countToImport} Data
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
