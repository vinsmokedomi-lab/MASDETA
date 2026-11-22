import { ProposalDestinationType } from '../types/kpm';
import {
  ProposalDestinationContext,
  ProposalStyleTemplate,
} from '../data/proposalTemplates';

interface ProposalCoverRendererProps {
  styleTemplate: ProposalStyleTemplate;
  context: ProposalDestinationContext;
  destination: ProposalDestinationType;
  totalKpm: number;
  variant?: 'thumbnail' | 'preview';
}

function getCoverFontFamily(fontStyle: ProposalStyleTemplate['fontStyle']): string {
  if (fontStyle === 'serif' || fontStyle === 'classic') {
    return 'Georgia, "Times New Roman", serif';
  }
  return '"Roboto", ui-sans-serif, system-ui, -apple-system, sans-serif';
}

function renderCoverArtworkSvg(style: ProposalStyleTemplate) {
  const { primary, secondary, accent, tint } = style.palette;

  switch (style.coverLayout) {
    case 'blue-wave':
      return (
        <svg viewBox="0 0 216 330" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          <rect width="216" height="330" fill="#FFFFFF" />
          <path d="M0,0 L216,0 L216,88 C168,118 82,66 0,104 Z" fill={primary} />
          <path d="M0,74 C76,112 152,64 216,96 L216,112 C150,82 78,128 0,94 Z" fill={secondary} opacity="0.85" />
          <path d="M0,92 C74,124 146,84 216,114 L216,122 C148,96 74,134 0,104 Z" fill={accent} opacity="0.7" />
          <path d="M0,296 C64,274 148,314 216,286 L216,330 L0,330 Z" fill={primary} />
          <path d="M0,286 C68,266 150,302 216,276 L216,290 C148,314 66,276 0,298 Z" fill={accent} opacity="0.8" />
        </svg>
      );

    case 'terracotta-pillars':
      return (
        <svg viewBox="0 0 216 330" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          <rect width="216" height="330" fill="#FFFFFF" />
          <rect x="0" y="0" width="22" height="330" fill={primary} />
          <rect x="22" y="0" width="8" height="330" fill={secondary} />
          <rect x="30" y="0" width="4" height="330" fill={accent} />
          <rect x="34" y="0" width="182" height="16" fill={tint} />
          <rect x="34" y="314" width="182" height="16" fill={tint} />
          <rect x="46" y="42" width="154" height="2" fill={primary} />
          <rect x="46" y="286" width="154" height="2" fill={secondary} />
        </svg>
      );

    case 'navy-right-arc':
      return (
        <svg viewBox="0 0 216 330" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          <rect width="216" height="330" fill="#FFFFFF" />
          <path d="M126,0 L216,0 L216,330 L146,330 C186,232 184,108 126,0 Z" fill={primary} />
          <path d="M114,0 L128,0 C184,108 186,232 146,330 L132,330 C172,232 170,108 114,0 Z" fill={accent} opacity="0.85" />
          <rect x="0" y="0" width="10" height="330" fill={secondary} />
          <rect x="22" y="294" width="84" height="3" fill={secondary} />
        </svg>
      );

    case 'diagonal-ribbons':
      return (
        <svg viewBox="0 0 216 330" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          <rect width="216" height="330" fill="#FFFFFF" />
          <polygon points="0,0 216,0 216,44 0,106" fill={primary} />
          <polygon points="0,104 216,42 216,56 0,118" fill={accent} />
          <polygon points="0,286 216,236 216,248 0,298" fill={accent} opacity="0.8" />
          <polygon points="0,296 216,246 216,330 0,330" fill={primary} />
        </svg>
      );

    case 'gold-mosaic':
      return (
        <svg viewBox="0 0 216 330" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          <rect width="216" height="330" fill="#FFFDF8" />
          <polygon points="0,0 108,0 0,88" fill={primary} />
          <polygon points="108,0 216,0 216,66 72,38" fill={secondary} opacity="0.88" />
          <polygon points="0,88 72,38 118,74 0,108" fill={accent} opacity="0.85" />
          <polygon points="216,244 216,330 96,330" fill={primary} />
          <polygon points="0,278 134,330 0,330" fill={secondary} opacity="0.85" />
          <polygon points="106,296 216,244 176,330" fill={accent} opacity="0.65" />
          <rect x="16" y="16" width="184" height="298" fill="none" stroke={primary} strokeWidth="1.2" opacity="0.35" />
        </svg>
      );

    case 'orange-top-block':
      return (
        <svg viewBox="0 0 216 330" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          <rect width="216" height="330" fill="#FFFFFF" />
          <rect x="108" y="0" width="108" height="92" fill={primary} />
          <rect x="92" y="18" width="16" height="74" fill={accent} />
          <rect x="0" y="0" width="108" height="14" fill={secondary} />
          <rect x="0" y="308" width="216" height="22" fill={primary} />
          <rect x="0" y="300" width="132" height="8" fill={accent} />
        </svg>
      );

    case 'emerald-left-bar':
      return (
        <svg viewBox="0 0 216 330" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          <rect width="216" height="330" fill="#FFFFFF" />
          <rect x="0" y="0" width="46" height="330" fill={primary} />
          <rect x="46" y="0" width="8" height="330" fill={accent} />
          <circle cx="23" cy="54" r="14" fill={secondary} />
          <circle cx="23" cy="54" r="6" fill="#FFFFFF" />
          <rect x="66" y="28" width="132" height="3" fill={secondary} />
          <rect x="66" y="298" width="132" height="3" fill={primary} />
        </svg>
      );

    case 'indigo-split-frame':
      return (
        <svg viewBox="0 0 216 330" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          <rect width="216" height="330" fill={tint} />
          <rect x="14" y="14" width="188" height="302" fill="#FFFFFF" stroke={primary} strokeWidth="2" />
          <rect x="20" y="20" width="176" height="290" fill="none" stroke={accent} strokeWidth="1" />
          <rect x="14" y="14" width="188" height="58" fill={primary} />
          <rect x="14" y="72" width="188" height="6" fill={secondary} />
          <rect x="14" y="294" width="188" height="22" fill={primary} />
        </svg>
      );

    case 'burgundy-classic':
      return (
        <svg viewBox="0 0 216 330" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          <rect width="216" height="330" fill="#FFFDFD" />
          <rect x="12" y="12" width="192" height="306" fill="none" stroke={primary} strokeWidth="2.5" />
          <rect x="18" y="18" width="180" height="294" fill="none" stroke={secondary} strokeWidth="0.9" />
          <polygon points="12,12 46,12 12,46" fill={primary} />
          <polygon points="204,12 170,12 204,46" fill={primary} />
          <polygon points="12,318 46,318 12,284" fill={primary} />
          <polygon points="204,318 170,318 204,284" fill={primary} />
          <rect x="44" y="68" width="128" height="2" fill={primary} />
          <rect x="44" y="264" width="128" height="2" fill={primary} />
        </svg>
      );

    case 'teal-corner-geo':
      return (
        <svg viewBox="0 0 216 330" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          <rect width="216" height="330" fill="#FFFFFF" />
          <polygon points="0,0 138,0 0,116" fill={primary} />
          <polygon points="138,0 174,0 0,144 0,116" fill={accent} />
          <polygon points="216,330 82,330 216,216" fill={primary} />
          <polygon points="82,330 48,330 216,188 216,216" fill={secondary} opacity="0.7" />
        </svg>
      );

    case 'amber-horizon':
      return (
        <svg viewBox="0 0 216 330" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          <rect width="216" height="330" fill="#FFFFFF" />
          <rect x="0" y="0" width="216" height="36" fill={primary} />
          <rect x="0" y="36" width="216" height="10" fill={secondary} />
          <rect x="0" y="46" width="216" height="6" fill={accent} />
          <rect x="0" y="138" width="216" height="64" fill={tint} />
          <rect x="0" y="138" width="216" height="2" fill={secondary} />
          <rect x="0" y="202" width="216" height="2" fill={secondary} />
          <rect x="0" y="302" width="216" height="28" fill={primary} />
        </svg>
      );

    case 'slate-executive':
      return (
        <svg viewBox="0 0 216 330" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          <rect width="216" height="330" fill="#FFFFFF" />
          <rect x="0" y="0" width="216" height="84" fill={primary} />
          <rect x="0" y="84" width="216" height="5" fill={accent} />
          <rect x="18" y="106" width="4" height="176" fill={secondary} />
          <rect x="0" y="314" width="216" height="16" fill={primary} />
          <rect x="148" y="306" width="68" height="8" fill={accent} />
        </svg>
      );

    case 'forest-curve':
      return (
        <svg viewBox="0 0 216 330" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          <rect width="216" height="330" fill="#FFFFFF" />
          <path d="M0,0 L216,0 L216,70 Q108,128 0,70 Z" fill={primary} />
          <path d="M0,66 Q108,124 216,66 L216,78 Q108,136 0,78 Z" fill={accent} />
          <path d="M0,276 Q108,238 216,276 L216,330 L0,330 Z" fill={primary} />
          <path d="M0,268 Q108,230 216,268 L216,278 Q108,240 0,278 Z" fill={secondary} opacity="0.8" />
        </svg>
      );

    case 'cobalt-grid':
      return (
        <svg viewBox="0 0 216 330" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          <rect width="216" height="330" fill="#FFFFFF" />
          <rect x="0" y="0" width="216" height="20" fill={primary} />
          <rect x="0" y="20" width="72" height="14" fill={secondary} />
          <rect x="72" y="20" width="72" height="14" fill={accent} />
          <rect x="144" y="20" width="72" height="14" fill={tint} />
          <rect x="18" y="54" width="180" height="232" fill="none" stroke={primary} strokeWidth="1.2" opacity="0.3" />
          <rect x="0" y="304" width="144" height="26" fill={primary} />
          <rect x="144" y="304" width="72" height="26" fill={secondary} />
        </svg>
      );

    case 'plum-editorial':
    default:
      return (
        <svg viewBox="0 0 216 330" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          <rect width="216" height="330" fill="#FFFFFF" />
          <rect x="0" y="0" width="14" height="330" fill={primary} />
          <rect x="202" y="0" width="14" height="330" fill={primary} />
          <rect x="14" y="28" width="188" height="4" fill={secondary} />
          <rect x="14" y="36" width="188" height="1.5" fill={accent} />
          <rect x="14" y="294" width="188" height="1.5" fill={accent} />
          <rect x="14" y="299" width="188" height="4" fill={secondary} />
          <rect x="72" y="76" width="72" height="3" fill={primary} />
        </svg>
      );
  }
}

export function ProposalCoverRenderer({
  styleTemplate,
  context,
  destination,
  totalKpm,
  variant = 'preview',
}: ProposalCoverRendererProps) {
  const isThumb = variant === 'thumbnail';
  const fontFamily = getCoverFontFamily(styleTemplate.fontStyle);
  const { primary, secondary, tint, border } = styleTemplate.palette;

  const isLeftAligned =
    styleTemplate.coverLayout === 'terracotta-pillars' ||
    styleTemplate.coverLayout === 'navy-right-arc' ||
    styleTemplate.coverLayout === 'emerald-left-bar' ||
    styleTemplate.coverLayout === 'slate-executive';

  const hasDarkTopHeader =
    styleTemplate.coverLayout === 'blue-wave' ||
    styleTemplate.coverLayout === 'diagonal-ribbons' ||
    styleTemplate.coverLayout === 'indigo-split-frame' ||
    styleTemplate.coverLayout === 'slate-executive' ||
    styleTemplate.coverLayout === 'forest-curve';

  const destinationCaption =
    destination === 'OPD'
      ? 'DINAS SOSIAL PROVINSI KALIMANTAN BARAT'
      : destination === 'Kecamatan'
      ? (context.kecamatan || 'PEMERINTAH KECAMATAN').toUpperCase()
      : (context.kelurahan || 'PEMERINTAH KELURAHAN').toUpperCase();

  return (
    <div
      className={`relative overflow-hidden bg-white select-none ${
        isThumb ? 'aspect-[216/330] w-full rounded-lg border border-slate-200' : 'h-full w-full'
      }`}
      style={{ fontFamily }}
    >
      {renderCoverArtworkSvg(styleTemplate)}

      {/* Content Overlay */}
      <div
        className={`relative z-10 flex h-full flex-col justify-between ${
          isThumb ? 'p-2.5' : 'px-12 py-14'
        } ${
          styleTemplate.coverLayout === 'terracotta-pillars'
            ? isThumb
              ? 'pl-5'
              : 'pl-24'
            : styleTemplate.coverLayout === 'emerald-left-bar'
            ? isThumb
              ? 'pl-6'
              : 'pl-28'
            : styleTemplate.coverLayout === 'navy-right-arc'
            ? isThumb
              ? 'pr-6'
              : 'pr-36'
            : ''
        } ${isLeftAligned ? 'items-start text-left' : 'items-center text-center'}`}
      >
        {/* Top Kicker */}
        <div className={isThumb ? 'pt-1' : 'pt-4'}>
          <p
            className={`font-bold uppercase tracking-[0.16em] ${
              isThumb ? 'text-[5.5px] leading-tight' : 'text-xs tracking-[0.22em]'
            }`}
            style={{ color: hasDarkTopHeader ? '#FFFFFF' : primary }}
          >
            {styleTemplate.coverKicker}
          </p>
          {!isThumb && (
            <p
              className="mt-1.5 text-[11px] font-semibold tracking-wider uppercase"
              style={{ color: hasDarkTopHeader ? 'rgba(255,255,255,0.88)' : secondary }}
            >
              TAHUN ANGGARAN {context.tahun}
            </p>
          )}
        </div>

        {/* Center Title Block */}
        <div className={isThumb ? 'my-auto space-y-1' : 'my-auto max-w-[92%] space-y-5'}>
          <div
            className={`inline-block font-bold uppercase ${
              isThumb
                ? 'rounded px-1.5 py-0.5 text-[5px]'
                : 'rounded-md border px-3.5 py-1 text-[11px] tracking-[0.16em]'
            }`}
            style={{
              backgroundColor: tint,
              borderColor: border,
              color: primary,
            }}
          >
            {destination === 'OPD' ? 'MODE OPD · LENGKAP RAB' : `MODE ${destination.toUpperCase()}`}
          </div>

          <h1
            className={`font-extrabold uppercase tracking-tight ${
              isThumb ? 'text-[8.5px] leading-[1.15]' : 'text-[30px] leading-[1.18]'
            }`}
            style={{ color: '#0F172A' }}
          >
            {styleTemplate.coverMainTitle}
          </h1>

          <p
            className={`font-semibold uppercase ${
              isThumb ? 'text-[5px] leading-snug' : 'text-[13px] leading-relaxed tracking-wide'
            }`}
            style={{ color: secondary }}
          >
            {styleTemplate.coverSubTitle}
          </p>

          <div
            className={`${isLeftAligned ? '' : 'mx-auto'} ${
              isThumb ? 'h-[1.5px] w-8' : 'h-[3px] w-24'
            }`}
            style={{ backgroundColor: primary }}
          />

          {/* Area / Wilayah Block */}
          <div className={isThumb ? 'pt-0.5' : 'pt-3 space-y-1.5'}>
            {context.coverLines.map((line, idx) => (
              <p
                key={`${line}-${idx}`}
                className={`font-bold uppercase ${
                  isThumb
                    ? idx === 0
                      ? 'text-[6px] leading-tight text-slate-900'
                      : 'text-[5px] leading-tight text-slate-600'
                    : idx === 0
                    ? 'text-[18px] leading-snug text-slate-900'
                    : 'text-[14px] leading-snug text-slate-700'
                }`}
              >
                {line}
              </p>
            ))}
          </div>
        </div>

        {/* Bottom Metadata */}
        <div
          className={`${isThumb ? 'pb-1' : 'pb-6'} ${
            isLeftAligned ? 'text-left' : 'text-center'
          }`}
        >
          {!isThumb && (
            <p
              className="text-[11px] font-semibold tracking-wider uppercase"
              style={{
                color:
                  styleTemplate.coverLayout === 'blue-wave' ||
                  styleTemplate.coverLayout === 'diagonal-ribbons' ||
                  styleTemplate.coverLayout === 'orange-top-block' ||
                  styleTemplate.coverLayout === 'indigo-split-frame' ||
                  styleTemplate.coverLayout === 'amber-horizon' ||
                  styleTemplate.coverLayout === 'slate-executive' ||
                  styleTemplate.coverLayout === 'forest-curve' ||
                  styleTemplate.coverLayout === 'cobalt-grid'
                    ? '#FFFFFF'
                    : '#334155',
              }}
            >
              DIAJUKAN KEPADA: {destinationCaption}
            </p>
          )}
          <p
            className={`font-bold uppercase ${
              isThumb ? 'text-[5.5px]' : 'mt-1 text-xs tracking-[0.18em]'
            }`}
            style={{
              color:
                styleTemplate.coverLayout === 'blue-wave' ||
                styleTemplate.coverLayout === 'diagonal-ribbons' ||
                styleTemplate.coverLayout === 'orange-top-block' ||
                styleTemplate.coverLayout === 'indigo-split-frame' ||
                styleTemplate.coverLayout === 'amber-horizon' ||
                styleTemplate.coverLayout === 'slate-executive' ||
                styleTemplate.coverLayout === 'forest-curve' ||
                styleTemplate.coverLayout === 'cobalt-grid'
                  ? '#FFFFFF'
                  : primary,
            }}
          >
            {isThumb
              ? `${context.tahun} · ${totalKpm} KPM`
              : `TAHUN ${context.tahun} · ${totalKpm} CALON PENERIMA MANFAAT`}
          </p>
        </div>
      </div>
    </div>
  );
}
