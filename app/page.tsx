'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ToolCard } from '@/components/tool-card';
import { useLocale } from '@/components/providers/locale-provider';
import { formatToolCount, getCategoryCopy } from '@/lib/i18n';
import { categoryIcons, categoryStyles } from '@/lib/tool-presentation';
import { getRecentTools } from '@/lib/recent-tools';
import { categories, getBrowsableTools, getToolById, getToolsByBrowseGroup, getToolsByCategory } from '@/lib/tool-registry';
import { ToolDefinition } from '@/types/tool';

function isToolDefinition(tool: ToolDefinition | undefined): tool is ToolDefinition {
  return Boolean(tool);
}

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 320, damping: 30 } },
};

export default function HomePage() {
  const { locale, messages } = useLocale();
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const browseTools = useMemo(() => getBrowsableTools(), []);
  const popularTools = useMemo(() => getToolsByBrowseGroup('popular').slice(0, 6), []);

  useEffect(() => {
    setRecentIds(getRecentTools());
  }, []);

  const recentTools = useMemo(() => recentIds.map((id) => getToolById(id)).filter(isToolDefinition), [recentIds]);
  const collectionTools = recentTools.length > 0 ? recentTools : popularTools;
  const collectionTitle = recentTools.length > 0 ? messages.home.recentTitle : messages.home.popularTitle;
  const collectionDescription =
    recentTools.length > 0 ? messages.home.recentDescription : messages.home.popularDescription;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-10">
      <motion.section
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="surface-glow relative overflow-hidden rounded-xl3 border border-border p-7 shadow-card sm:p-10"
      >
        <div className="absolute inset-0 bg-grid-faint opacity-60" />
        <div className="relative z-10 max-w-3xl">
          <div className="badge mb-4 border border-prime/20 bg-prime/10 text-prime">
            <span className="h-1.5 w-1.5 rounded-full bg-prime" />
            {messages.home.badge}
          </div>
          <h1 className="font-display text-4xl font-semibold leading-tight tracking-tight text-ink sm:text-5xl">
            {messages.home.titleLead}
            <br />
            <span className="text-prime">{messages.home.titleAccent}</span>
          </h1>
          <p
            className="mt-4 max-w-2xl text-sm leading-relaxed sm:text-base"
            style={{ color: 'rgb(var(--color-ink) / 0.9)' }}
          >
            {messages.home.description}
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/tools" className="btn-primary">
              {messages.home.primaryCta}
              <ArrowRight size={16} />
            </Link>
            <a href="#recent-tools" className="btn-ghost">
              {messages.home.secondaryCta}
              <ChevronDown size={16} />
            </a>
          </div>
        </div>
      </motion.section>

      <section id="recent-tools" className="space-y-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl font-semibold tracking-tight text-ink">{collectionTitle}</h2>
            <p className="mt-1 text-sm text-ink-muted">{collectionDescription}</p>
          </div>
          {collectionTools.length > 0 ? (
            <span className="badge border border-border bg-base-subtle text-ink-muted">
              {formatToolCount(locale, collectionTools.length)}
            </span>
          ) : null}
        </div>

        {collectionTools.length === 0 ? (
          <div className="card p-5 text-sm text-ink-muted">{messages.home.popularDescription}</div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {collectionTools.map((tool) => (
              <ToolCard key={tool.id} tool={tool} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl font-semibold tracking-tight text-ink">{messages.home.categoriesTitle}</h2>
            <p className="mt-1 text-sm text-ink-muted">{messages.appTagline}</p>
          </div>
          <span className="badge border border-border bg-base-subtle text-ink-muted">{formatToolCount(locale, browseTools.length)}</span>
        </div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
        >
          {categories.map((category) => {
            const Icon = categoryIcons[category.id];
            const copy = getCategoryCopy(locale, category.id);
            const style = categoryStyles[category.id];

            return (
              <motion.div key={category.id} variants={itemVariants}>
                <Link href={`/tools/${category.id}`}>
                  <div className={`card group h-full border ${style.border} bg-gradient-to-br ${style.gradient} p-5 transition-all`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-xl border border-border ${style.iconBg} ${style.icon}`}>
                        <Icon size={20} />
                      </div>
                      <span className="badge border border-border bg-base-subtle text-ink-muted">
                        {formatToolCount(locale, getToolsByCategory(category.id, { includeHidden: false }).length)}
                      </span>
                    </div>
                    <p className="mt-4 text-base font-semibold text-ink">{copy.nav}</p>
                    <p className="mt-1 text-sm leading-relaxed text-ink-muted">{copy.shortDescription}</p>
                    <div className="mt-4 flex items-center gap-1 text-xs font-medium text-ink-faint transition-colors group-hover:text-prime">
                      {messages.home.openCategory}
                      <ArrowRight size={12} className="transition-transform group-hover:translate-x-0.5" />
                    </div>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </motion.div>
      </section>

      <motion.section
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="grid grid-cols-1 gap-3 md:grid-cols-2"
      >
        {[
          { title: messages.home.featureOneTitle, body: messages.home.featureOneBody },
          { title: messages.home.featureTwoTitle, body: messages.home.featureTwoBody },
        ].map((item) => (
          <div key={item.title} className="card p-5">
            <p className="text-sm font-semibold text-ink">{item.title}</p>
            <p className="mt-2 text-xs leading-relaxed text-ink-muted">{item.body}</p>
          </div>
        ))}
      </motion.section>
    </div>
  );
}
