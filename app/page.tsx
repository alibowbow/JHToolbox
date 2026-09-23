'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, Cpu, Search, ShieldCheck, Workflow } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ToolCard } from '@/components/tool-card';
import { useLocale } from '@/components/providers/locale-provider';
import { formatToolCount, getCategoryCopy } from '@/lib/i18n';
import { openToolSearch } from '@/lib/search-events';
import { categoryIcons, categoryStyles } from '@/lib/tool-presentation';
import { getRecentTools } from '@/lib/recent-tools';
import { categories, getBrowsableTools, getToolById, getToolsByBrowseGroup, getToolsByCategory } from '@/lib/tool-registry';
import { ToolDefinition } from '@/types/tool';

function isToolDefinition(tool: ToolDefinition | undefined): tool is ToolDefinition {
  return Boolean(tool);
}

const reveal = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
};

export default function HomePage() {
  const { locale, messages } = useLocale();
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const browseTools = useMemo(() => getBrowsableTools(), []);
  const popularTools = useMemo(() => getToolsByBrowseGroup('popular').slice(0, 6), []);
  const editorEnabledCount = useMemo(() => getToolsByBrowseGroup('editor-enabled').length, []);

  useEffect(() => {
    setRecentIds(getRecentTools());
  }, []);

  const recentTools = useMemo(() => recentIds.map((id) => getToolById(id)).filter(isToolDefinition), [recentIds]);
  const collectionTools = recentTools.length > 0 ? recentTools : popularTools;
  const collectionTitle = recentTools.length > 0 ? messages.home.recentTitle : messages.home.popularTitle;
  const collectionDescription =
    recentTools.length > 0 ? messages.home.recentDescription : messages.home.popularDescription;

  const trustPoints = messages.home.badge.split('|').map((part) => part.trim());
  const metrics = [
    { label: messages.home.metricToolCount, value: String(browseTools.length) },
    { label: messages.home.metricEditorReady, value: String(editorEnabledCount) },
    { label: messages.home.metricExecution, value: messages.home.metricExecutionValue },
  ];
  const features = [
    { icon: ShieldCheck, title: messages.home.featureOneTitle, body: messages.home.featureOneBody, tone: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
    { icon: Cpu, title: messages.home.featureTwoTitle, body: messages.home.featureTwoBody, tone: 'bg-sky-500/10 text-sky-700 dark:text-sky-300' },
    { icon: Workflow, title: messages.home.featureThreeTitle, body: messages.home.featureThreeBody, tone: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300', href: '/pipeline' },
  ];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-14 lg:gap-16">
      <motion.section
        {...reveal}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="relative overflow-hidden rounded-3xl border border-border bg-base-elevated px-6 py-10 sm:px-12 sm:py-14"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(55%_70%_at_0%_0%,rgb(var(--color-prime)/0.12),transparent_70%),radial-gradient(40%_60%_at_100%_100%,rgb(var(--color-accent)/0.08),transparent_70%)]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-60 [background-image:radial-gradient(rgb(var(--color-border)/0.14)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:linear-gradient(to_bottom,black,transparent_75%)]"
        />

        <div className="relative max-w-3xl">
          <ul className="flex flex-wrap items-center gap-2">
            {trustPoints.map((point, index) => (
              <li
                key={point}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-base-elevated/80 px-3 py-1 text-xs font-medium text-ink-muted"
              >
                {index === 0 ? <ShieldCheck size={13} className="text-ok" aria-hidden="true" /> : null}
                {point}
              </li>
            ))}
          </ul>

          <h1 className="mt-6 text-[2.5rem] font-bold leading-[1.1] tracking-[-0.035em] text-ink sm:text-[3.5rem]">
            {messages.home.titleLead}
            <br />
            <span className="text-prime">{messages.home.titleAccent}</span>
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-ink-muted sm:text-lg">{messages.home.description}</p>

          <div className="mt-8 flex max-w-2xl flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={openToolSearch}
              className="group flex h-12 w-full min-w-0 shrink-0 items-center gap-3 rounded-xl sm:w-auto sm:flex-1 border border-border-strong bg-base-elevated px-4 text-left text-[15px] text-ink-faint shadow-[0_1px_2px_rgba(16,24,40,0.05)] transition-colors hover:border-prime/60 hover:text-ink-muted"
            >
              <Search size={18} className="shrink-0 text-ink-faint transition-colors group-hover:text-prime" aria-hidden="true" />
              <span className="truncate">{messages.home.heroSearch}</span>
              <kbd className="ml-auto hidden shrink-0 rounded-md border border-border bg-base-subtle px-1.5 py-0.5 font-mono text-[11px] font-medium text-ink-faint sm:block">
                {messages.topbar.shortcut}
              </kbd>
            </button>
            <Link href="/tools" className="btn-primary h-12 shrink-0 px-5 text-[15px]">
              {messages.home.primaryCta}
              <ArrowRight size={17} aria-hidden="true" />
            </Link>
          </div>

          <dl className="mt-10 flex flex-wrap gap-x-10 gap-y-5">
            {metrics.map((metric) => (
              <div key={metric.label} className="min-w-0">
                <dt className="text-xs font-medium text-ink-faint">{metric.label}</dt>
                <dd className="mt-1 text-xl font-bold tracking-tight text-ink tabular-nums">{metric.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </motion.section>

      <section aria-labelledby="home-categories" className="space-y-5">
        <div className="flex items-end justify-between gap-3">
          <h2 id="home-categories" className="section-title">
            {messages.home.categoriesTitle}
          </h2>
          <Link href="/tools" className="inline-flex items-center gap-1 text-sm font-medium text-prime hover:underline">
            {messages.home.viewAll}
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {categories.map((category, index) => {
            const Icon = categoryIcons[category.id];
            const copy = getCategoryCopy(locale, category.id);
            const style = categoryStyles[category.id];
            const count = getToolsByCategory(category.id, { includeHidden: false }).length;

            return (
              <motion.div key={category.id} {...reveal} transition={{ duration: 0.3, delay: 0.04 * index }}>
                <Link href={`/tools/${category.id}`} className="group block h-full rounded-2xl">
                  <div className="card flex h-full flex-col p-5 group-hover:-translate-y-0.5 group-hover:border-border-bright group-hover:shadow-card-hover">
                    <div className="flex items-center justify-between gap-3">
                      <span className={`category-tile h-10 w-10 ${style.iconBg} ${style.icon}`}>
                        <Icon size={19} />
                      </span>
                      <span className="text-xs font-medium tabular-nums text-ink-faint">{formatToolCount(locale, count)}</span>
                    </div>
                    <p className="mt-4 text-base font-semibold text-ink">{copy.nav}</p>
                    <p className="mt-1 text-sm leading-relaxed text-ink-muted">{copy.shortDescription}</p>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>
      </section>

      <section id="recent-tools" aria-labelledby="home-collection" className="space-y-5">
        <div>
          <h2 id="home-collection" className="section-title">
            {collectionTitle}
          </h2>
          <p className="mt-1 text-sm text-ink-muted">{collectionDescription}</p>
        </div>

        {collectionTools.length === 0 ? (
          <div className="card p-5 text-sm text-ink-muted">{messages.home.popularDescription}</div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {collectionTools.map((tool) => (
              <ToolCard key={tool.id} tool={tool} showCategory />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="home-why" className="space-y-5">
        <h2 id="home-why" className="section-title">
          {messages.home.whyTitle}
        </h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {features.map(({ icon: Icon, title, body, tone, href }) => {
            const content = (
              <>
                <span className={`category-tile h-10 w-10 ${tone}`}>
                  <Icon size={19} />
                </span>
                <p className="mt-4 text-base font-semibold text-ink">{title}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{body}</p>
              </>
            );
            return href ? (
              <Link key={title} href={href} className="group block rounded-2xl">
                <div className="card h-full p-5 group-hover:-translate-y-0.5 group-hover:border-border-bright group-hover:shadow-card-hover">
                  {content}
                </div>
              </Link>
            ) : (
              <div key={title} className="card p-5">
                {content}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
