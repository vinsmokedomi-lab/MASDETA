import { UserPresenceStatus } from '../types/kpm';

export function getPresenceMeta(status?: UserPresenceStatus) {
  switch (status) {
    case 'online':
      return {
        label: 'Sedang Aktif',
        dotClass: 'bg-emerald-500',
        textClass: 'text-emerald-700',
        bgClass: 'bg-emerald-50',
      };
    case 'idle':
      return {
        label: 'Idle',
        dotClass: 'bg-amber-500',
        textClass: 'text-amber-700',
        bgClass: 'bg-amber-50',
      };
    case 'offline':
    default:
      return {
        label: 'Tidak Aktif',
        dotClass: 'bg-slate-400',
        textClass: 'text-slate-500',
        bgClass: 'bg-slate-100',
      };
  }
}

interface PresenceDotProps {
  status?: UserPresenceStatus;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function PresenceDot({ status = 'offline', size = 'md', className = '' }: PresenceDotProps) {
  const meta = getPresenceMeta(status);
  const sizeClass =
    size === 'sm' ? 'h-2.5 w-2.5' : size === 'lg' ? 'h-3.5 w-3.5' : 'h-3 w-3';

  return (
    <span
      title={meta.label}
      aria-label={meta.label}
      className={`inline-block shrink-0 rounded-full ring-2 ring-white ${sizeClass} ${meta.dotClass} ${className}`}
    />
  );
}
