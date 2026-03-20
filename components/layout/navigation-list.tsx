'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Archive, FileText, Globe, Home, Image, Layers3, Monitor, Music, ScanSearch, Video } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { getCategoryCopy } from '@/lib/i18n';
import { useLocale } from '@/components/providers/locale-provider';

const navItems = [
  { href: '/', key: 'home', icon: Home, iconClass: 'text-prime', dotClass: 'bg-prime' },
  { href: '/tools', key: 'allTools', icon: Layers3, iconClass: 'text-accent', dotClass: 'bg-accent' },
  { href: '/tools/pdf', key: 'pdf', icon: FileText, iconClass: 'text-rose-300', dotClass: 'bg-rose-400' },
  { href: '/tools/image', key: 'image', icon: Image, iconClass: 'text-sky-300', dotClass: 'bg-sky-400' },
  { href: '/tools/ocr', key: 'ocr', icon: ScanSearch, iconClass: 'text-violet-300', dotClass: 'bg-violet-400' },
  { href: '/tools/video', key: 'video', icon: Video, iconClass: 'text-orange-300', dotClass: 'bg-orange-400' },
  { href: '/tools/audio', key: 'audio', icon: Music, iconClass: 'text-emerald-300', dotClass: 'bg-emerald-400' },
  { href: '/tools/screen', key: 'screen', icon: Monitor, iconClass: 'text-fuchsia-300', dotClass: 'bg-fuchsia-400' },
  { href: '/tools/file', key: 'file', icon: Archive, iconClass: 'text-amber-300', dotClass: 'bg-amber-400' },
  { href: '/tools/web', key: 'web', icon: Globe, iconClass: 'text-cyan-300', dotClass: 'bg-cyan-400' },
] as const;

export function NavigationList({
  onNavigate,
  activeIndicatorId = 'sidebar-active',
}: {
  onNavigate?: () => void;
  activeIndicatorId?: string;
}) {
  const pathname = usePathname() ?? '';
  const { locale, messages } = useLocale();

  return (
    <nav className="space-y-1.5">
      {navItems.map(({ href, key, icon: Icon, iconClass, dotClass }) => {
        const active = pathname === href || (href !== '/' && pathname.startsWith(href));
        const label =
          key === 'home' || key === 'allTools' ? messages.nav[key] : getCategoryCopy(locale, key).nav;

        return (
          <Link key={href} href={href} onClick={onNavigate}>
            <motion.div
              whileHover={{ x: 2 }}
              whileTap={{ scale: 0.98 }}
              className={`relative flex items-center gap-3 rounded-2xl px-3.5 py-3 text-sm font-medium transition-colors ${
                active ? 'text-ink' : 'text-ink-muted hover:bg-base-elevated/70 hover:text-ink'
              }`}
            >
              {active ? (
                <motion.div
                  layoutId={activeIndicatorId}
                  className="absolute inset-0 rounded-2xl border border-border/60 bg-base-elevated"
                  style={{ zIndex: -1 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 40 }}
                />
              ) : null}
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border/60 bg-base-subtle/75">
                <Icon size={16} className={active ? iconClass : 'text-ink-muted'} />
              </div>
              <div className="min-w-0 flex-1">
                <span className="block truncate">{label}</span>
                <span className="mt-0.5 block text-[11px] uppercase tracking-[0.18em] text-ink-faint">
                  {active ? 'Current' : 'Open'}
                </span>
              </div>
              {active ? <span className={`ml-auto h-1.5 w-1.5 rounded-full ${dotClass}`} /> : null}
            </motion.div>
          </Link>
        );
      })}
    </nav>
  );
}
