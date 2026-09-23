import Link from 'next/link';

export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className="flex shrink-0 items-center justify-center rounded-[9px] bg-gradient-to-br from-indigo-500 via-indigo-600 to-violet-600 text-[11px] font-bold tracking-tight text-white shadow-[0_1px_2px_rgba(16,24,40,0.2),inset_0_1px_0_rgba(255,255,255,0.25)]"
    >
      JH
    </span>
  );
}

export function BrandLink({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link href="/" onClick={onNavigate} aria-label="JH Toolbox" className="flex items-center gap-2.5 rounded-lg">
      <BrandMark />
      <span className="text-[15px] font-bold tracking-tight text-ink">Toolbox</span>
    </Link>
  );
}
