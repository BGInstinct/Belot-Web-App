import { Children, isValidElement, useEffect, useMemo, useState, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { ArrowUp, BookOpen } from 'lucide-react';
import { PixelPanel, PixelScreen, PixelToggle } from '@/components/ui';
import { SuitIcon } from '@/components/cards/SuitIcon';
import rulesEn from './belot_rules.en.md?raw';
import rulesBg from './belot_rules.bg.md?raw';

const SOURCES: Record<string, string> = { en: rulesEn, bg: rulesBg };
const READABLE_KEY = 'belot-rules-readable';

function textOf(node: ReactNode): string {
  return Children.toArray(node)
    .map((c) => (typeof c === 'string' || typeof c === 'number' ? String(c) : isValidElement<{ children?: ReactNode }>(c) ? textOf(c.props.children) : ''))
    .join('');
}

function slugify(s: string): string {
  return (
    'r-' +
    s
      .toLowerCase()
      .replace(/[*`_]/g, '')
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
  );
}

interface TocItem {
  id: string;
  text: string;
  level: 2 | 3;
}

function buildToc(md: string): TocItem[] {
  const items: TocItem[] = [];
  for (const line of md.split('\n')) {
    const m = /^(##|###) (.+)$/.exec(line.trim());
    if (m) {
      const text = m[2].replace(/[*`_]/g, '').trim();
      items.push({ id: slugify(text), text, level: m[1].length as 2 | 3 });
    }
  }
  return items;
}

const components: Components = {
  h2: ({ children }) => <h2 id={slugify(textOf(children))}>{children}</h2>,
  h3: ({ children }) => <h3 id={slugify(textOf(children))}>{children}</h3>,
  table: ({ children }) => (
    <div className="table-wrap">
      <table>{children}</table>
    </div>
  ),
  a: ({ href, children }) => (
    <a href={href} target={href?.startsWith('http') ? '_blank' : undefined} rel="noreferrer">
      {children}
    </a>
  ),
};

export default function RulesPage() {
  const { t, i18n } = useTranslation('rules');
  const lang = i18n.resolvedLanguage ?? i18n.language;
  const md = SOURCES[lang] ?? rulesEn;
  const toc = useMemo(() => buildToc(md), [md]);
  const [readable, setReadable] = useState(() => localStorage.getItem(READABLE_KEY) === '1');
  const [showTop, setShowTop] = useState(false);

  useEffect(() => {
    localStorage.setItem(READABLE_KEY, readable ? '1' : '0');
  }, [readable]);

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 600);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const jump = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const tocList = (
    <ol className="m-0 flex list-none flex-col gap-1 p-0">
      {toc.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            onClick={() => jump(item.id)}
            className={`w-full cursor-pointer px-2 py-2 text-left leading-relaxed transition-colors hover:bg-slate hover:text-paper ${
              item.level === 2 ? 'text-[10px] text-bone' : 'pl-5 text-[9px] text-mist'
            }`}
          >
            {item.level === 3 && <span className="mr-2 text-steel">›</span>}
            {item.text}
          </button>
        </li>
      ))}
    </ol>
  );

  return (
    <PixelScreen title={t('title')} back="/">
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-2 py-4 sm:px-4 sm:py-6 lg:flex-row lg:items-start lg:gap-6">
        {/* Contents — sticky sidebar on desktop, collapsible on mobile */}
        <aside className="lg:sticky lg:top-20 lg:w-72 lg:shrink-0">
          <PixelPanel
            title={
              <span className="flex items-center gap-2">
                <BookOpen size={14} strokeWidth={3} /> {t('contents')}
              </span>
            }
            flush
          >
            <details className="group lg:hidden">
              <summary className="cursor-pointer list-none px-4 py-3 text-[10px] text-gold">
                <span className="mr-2 inline-block transition-transform group-open:rotate-90">▶</span>
                {t('showSections', { count: toc.length })}
              </summary>
              <div className="px-2 pb-3">{tocList}</div>
            </details>
            <div className="hidden max-h-[60vh] overflow-y-auto p-2 lg:block">{tocList}</div>
            <div className="border-t-[3px] border-ink p-4">
              <PixelToggle
                checked={readable}
                onChange={setReadable}
                label={t('readableFont')}
                description={t('readableFontHint')}
                scale={2}
              />
            </div>
          </PixelPanel>
        </aside>

        <motion.article
          key={lang}
          className="min-w-0 flex-1"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
        >
          <PixelPanel className="relative">
            <div className="pointer-events-none absolute right-4 top-4 hidden gap-2 opacity-80 sm:flex">
              {(['S', 'H', 'D', 'C'] as const).map((s) => (
                <SuitIcon key={s} suit={s} scale={2} skinId="default" />
              ))}
            </div>
            <div className="pixel-prose px-1 py-2 sm:px-4" data-readable={readable ? 'true' : 'false'} lang={lang}>
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
                {md}
              </ReactMarkdown>
            </div>
          </PixelPanel>
        </motion.article>
      </div>

      {showTop && (
        <motion.button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label={t('backToTop')}
          className="pixel-border fixed bottom-4 right-4 z-40 flex h-11 w-11 cursor-pointer items-center justify-center bg-gold text-ink hover:bg-amber active:translate-y-[2px]"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <ArrowUp size={20} strokeWidth={3} />
        </motion.button>
      )}
    </PixelScreen>
  );
}
