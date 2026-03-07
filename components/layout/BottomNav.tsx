'use client';

import Link from 'next/link';
import { FileText, Home, Image, Layers3, ScanSearch } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { useLocale } from '@/components/providers/locale-provider';
import { getCategoryCopy } from '@/lib/i18n';

const items = [
  { href: '/', key: 'home', icon: Home },
  { href: '/tools', key: 'allTools', icon: Layers3 },
  { href: '/tools/pdf', key: 'pdf', icon: FileText },
  { href: '/tools/image', key: 'image', icon: Image },
  { href: '/tools/ocr', key: 'ocr', icon: ScanSearch },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  const { locale, messages } = useLocale();

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-base-subtle/90 backdrop-blur md:hidden">
      <nav className="mx-auto grid max-w-2xl grid-cols-5 gap-1 px-3 py-2">
        {items.map(({ href, key, icon: Icon }) => {
          const active = pathname === href || (href !== '/' && pathname.startsWith(href));
          const label =
            key === 'home' || key === 'allTools' ? messages.nav[key] : getCategoryCopy(locale, key).nav;

          return (
            <Link key={href} href={href}>
              <motion.div
                whileTap={{ scale: 0.95 }}
                className={`flex flex-col items-center gap-1 rounded-xl px-2 py-2 text-[11px] ${
                  active ? 'bg-base-elevated text-ink' : 'text-ink-muted'
                }`}
              >
                <Icon size={16} />
                <span className="truncate">{label}</span>
              </motion.div>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
