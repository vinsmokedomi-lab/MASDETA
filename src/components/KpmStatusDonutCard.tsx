import { useMemo, useState } from 'react';
import { arc as d3Arc, pie as d3Pie, PieArcDatum } from 'd3';
import { ChevronRight } from 'lucide-react';
import { ValidationStatus } from '../types/kpm';

interface KpmStatusDonutCardProps {
  accepted: number;
  pending: number;
  rejected: number;
  yearLabel: string;
  onSelectStatus: (status: ValidationStatus) => void;
}

interface StatusSlice {
  status: ValidationStatus;
  label: string;
  count: number;
  color: string;
  textColor: string;
}

export function KpmStatusDonutCard({
  accepted,
  pending,
  rejected,
  yearLabel,
  onSelectStatus,
}: KpmStatusDonutCardProps) {
  const [hoveredStatus, setHoveredStatus] = useState<ValidationStatus | null>(null);
  const [pinnedStatus, setPinnedStatus] = useState<ValidationStatus | null>(null);

  const total = accepted + pending + rejected;
  const activeStatus = hoveredStatus ?? pinnedStatus;

  const slices: StatusSlice[] = useMemo(
    () => [
      {
        status: 'accepted',
        label: 'Diterima',
        count: accepted,
        color: '#0f766e', // teal-700
        textColor: 'text-teal-700',
      },
      {
        status: 'pending',
        label: 'Menunggu',
        count: pending,
        color: '#f59e0b', // amber-500
        textColor: 'text-amber-700',
      },
      {
        status: 'rejected',
        label: 'Ditolak',
        count: rejected,
        color: '#e11d48', // rose-600
        textColor: 'text-rose-600',
      },
    ],
    [accepted, pending, rejected]
  );

  const nonZeroCount = useMemo(
    () => slices.filter((slice) => slice.count > 0).length,
    [slices]
  );

  const pieArcs = useMemo(() => {
    const pieGenerator = d3Pie<StatusSlice>()
      .value((d) => d.count)
      .sort(null)
      .padAngle(nonZeroCount > 1 ? 0.035 : 0);

    return pieGenerator(slices.filter((slice) => slice.count > 0));
  }, [slices, nonZeroCount]);

  const baseArcGenerator = useMemo(
    () =>
      d3Arc<PieArcDatum<StatusSlice>>()
        .innerRadius(46)
        .outerRadius(64)
        .cornerRadius(4),
    []
  );

  const activeArcGenerator = useMemo(
    () =>
      d3Arc<PieArcDatum<StatusSlice>>()
        .innerRadius(46)
        .outerRadius(69)
        .cornerRadius(4),
    []
  );

  const activeSlice = useMemo(
    () => (activeStatus ? slices.find((s) => s.status === activeStatus) ?? null : null),
    [activeStatus, slices]
  );

  const centerPrimary = useMemo(() => {
    if (activeSlice && total > 0) {
      return `${Math.round((activeSlice.count / total) * 100)}%`;
    }
    return String(total);
  }, [activeSlice, total]);

  const centerSecondary = useMemo(() => {
    if (activeSlice) {
      return `${activeSlice.label} · ${activeSlice.count}`;
    }
    return 'Total Usulan';
  }, [activeSlice]);

  return (
    <section
      aria-label="Grafik Proporsi Status KPM"
      className="rounded-2xl border border-slate-200 bg-white p-4"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold text-slate-900">Proporsi Status</h2>
        <span className="text-xs text-slate-500">{yearLabel}</span>
      </div>

      {total === 0 ? (
        <div className="mt-4 flex items-center gap-4 py-2">
          <div className="relative flex h-[144px] w-[144px] shrink-0 items-center justify-center">
            <svg viewBox="-74 -74 148 148" className="h-full w-full" aria-hidden="true">
              <circle
                cx="0"
                cy="0"
                r="55"
                fill="none"
                stroke="#f1f5f9"
                strokeWidth="18"
              />
            </svg>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-xl font-bold text-slate-400 tabular-nums">0</span>
              <span className="text-[11px] text-slate-400">Kosong</span>
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-slate-700">
              Belum ada data usulan pada {yearLabel}.
            </p>
            <p className="mt-1 text-[11px] text-slate-500">
              Grafik donat akan terisi otomatis setelah data ditambahkan.
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-4">
          {/* D3 Donut Chart */}
          <div className="relative flex h-[148px] w-[148px] shrink-0 items-center justify-center">
            <svg
              viewBox="-74 -74 148 148"
              className="h-full w-full overflow-visible"
              role="img"
              aria-label={`Proporsi status ${yearLabel}: Diterima ${accepted}, Menunggu ${pending}, Ditolak ${rejected}`}
            >
              {pieArcs.map((datum) => {
                const isActive = activeStatus === datum.data.status;
                const isDimmed = activeStatus !== null && !isActive;
                const pathData =
                  (isActive ? activeArcGenerator(datum) : baseArcGenerator(datum)) ?? '';

                return (
                  <path
                    key={datum.data.status}
                    d={pathData}
                    fill={datum.data.color}
                    opacity={isDimmed ? 0.38 : 1}
                    className="cursor-pointer transition-opacity duration-150 focus:outline-none"
                    tabIndex={0}
                    role="button"
                    aria-label={`${datum.data.label}: ${datum.data.count} (${Math.round(
                      (datum.data.count / total) * 100
                    )}%)`}
                    onMouseEnter={() => setHoveredStatus(datum.data.status)}
                    onMouseLeave={() => setHoveredStatus(null)}
                    onFocus={() => setHoveredStatus(datum.data.status)}
                    onBlur={() => setHoveredStatus(null)}
                    onClick={() => {
                      if (pinnedStatus === datum.data.status) {
                        onSelectStatus(datum.data.status);
                      } else {
                        setPinnedStatus(datum.data.status);
                      }
                    }}
                  />
                );
              })}
            </svg>

            <button
              type="button"
              onClick={() => {
                if (activeSlice) {
                  onSelectStatus(activeSlice.status);
                } else {
                  setPinnedStatus(null);
                }
              }}
              className="absolute flex h-[86px] w-[86px] flex-col items-center justify-center rounded-full px-1 text-center transition-colors hover:bg-slate-50/80"
              aria-label={
                activeSlice
                  ? `Buka daftar ${activeSlice.label}`
                  : `Total usulan ${total}`
              }
            >
              <span className="text-xl leading-none font-bold text-slate-900 tabular-nums">
                {centerPrimary}
              </span>
              <span className="mt-1 max-w-[76px] truncate text-[10px] font-medium text-slate-500 tabular-nums">
                {centerSecondary}
              </span>
            </button>
          </div>

          {/* Interactive Status Legend / Action Rows */}
          <div className="min-w-0 flex-1 divide-y divide-slate-100">
            {slices.map((slice) => {
              const pct = total > 0 ? Math.round((slice.count / total) * 100) : 0;
              const isActive = activeStatus === slice.status;

              return (
                <button
                  key={slice.status}
                  type="button"
                  onMouseEnter={() => setHoveredStatus(slice.status)}
                  onMouseLeave={() => setHoveredStatus(null)}
                  onFocus={() => setHoveredStatus(slice.status)}
                  onBlur={() => setHoveredStatus(null)}
                  onClick={() => onSelectStatus(slice.status)}
                  className={`flex min-h-[44px] w-full items-center justify-between gap-2 rounded-lg px-1.5 py-2 text-left transition-colors ${
                    isActive ? 'bg-slate-50' : 'hover:bg-slate-50'
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                      style={{ backgroundColor: slice.color }}
                      aria-hidden="true"
                    />
                    <span className="truncate text-xs font-medium text-slate-800">
                      {slice.label}
                    </span>
                  </span>

                  <span className="flex shrink-0 items-center gap-1.5 tabular-nums">
                    <span className={`text-xs font-semibold ${slice.textColor}`}>
                      {slice.count}
                    </span>
                    <span className="w-8 text-right text-[11px] text-slate-500">
                      {pct}%
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
