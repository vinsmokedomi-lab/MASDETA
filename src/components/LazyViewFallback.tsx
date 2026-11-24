export function LazyViewFallback({ label = 'Memuat halaman...' }: { label?: string }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-xs">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-teal-700 border-t-transparent" />
        <p className="text-xs font-semibold text-slate-600">{label}</p>
      </div>
    </div>
  );
}
