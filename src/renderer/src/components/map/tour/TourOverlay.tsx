import { AnimatePresence, motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Baby, ChevronLeft, ChevronRight, Flag, Globe, Heart, MapPin, Briefcase, X } from 'lucide-react'
import type { TourStep } from './tourNarrative'
import { PersonAvatar } from '@/components/common/PersonAvatar'
import { cn } from '@/lib/utils'

export interface TourHistItem {
  title: string
  year: number | null
}

export function TourOverlay({
  step,
  history,
  loadingHistory,
  onPrev,
  onNext,
  onClose,
  onSelect
}: {
  step: TourStep
  history: TourHistItem[]
  loadingHistory: boolean
  onPrev: () => void
  onNext: () => void
  onClose: () => void
  onSelect: (id: string) => void
}): JSX.Element {
  const { t } = useTranslation()
  const atStart = step.ordinal <= 1
  const atEnd = step.ordinal >= step.total
  const genLabel =
    step.genFromStart === 0
      ? t('tour.you')
      : t('tour.generationsBack', { count: step.genFromStart })

  return (
    <>
      {/* Top bar: exit + progress */}
      <div className="glass-strong pointer-events-auto absolute left-1/2 top-4 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full px-3 py-1.5">
        <button onClick={onClose} title={t('tour.exit')} className="text-muted-foreground transition-colors hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
        <span className="text-xs font-semibold tabular-nums text-foreground/80">
          {step.ordinal} / {step.total}
        </span>
        <div className="flex items-center gap-1">
          {Array.from({ length: Math.min(step.total, 14) }).map((_, i) => {
            const idx = step.total <= 14 ? i : Math.round((i / 13) * (step.total - 1))
            return (
              <span
                key={i}
                className={cn(
                  'h-1.5 rounded-full transition-all',
                  idx + 1 === step.ordinal ? 'w-4 bg-primary' : idx + 1 < step.ordinal ? 'w-1.5 bg-primary/50' : 'w-1.5 bg-muted-foreground/30'
                )}
              />
            )
          })}
        </div>
      </div>

      {/* Narrative card */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={step.personId}
            initial={{ opacity: 0, y: 36, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -24, scale: 0.97 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="glass-strong pointer-events-auto w-full max-w-xl overflow-hidden rounded-2xl"
          >
            {/* Header */}
            <div className="flex items-center gap-3 border-b border-border/40 bg-gradient-to-r from-primary/10 to-transparent p-4">
              <button
                onClick={() => onSelect(step.personId)}
                title={t('tour.openProfile')}
                className="h-14 w-14 shrink-0 overflow-hidden rounded-full ring-2 ring-primary/40 transition-transform hover:scale-105"
              >
                <PersonAvatar personId={step.personId} name={step.name} sex={step.sex} className="h-14 w-14 text-base" />
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                    {genLabel}
                  </span>
                  {step.place && (
                    <span className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                      <MapPin className="h-3 w-3 shrink-0" /> {step.place}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => onSelect(step.personId)}
                  className="block truncate text-left text-lg font-bold leading-tight hover:text-primary"
                >
                  {step.name}
                </button>
                {step.lifespan && <span className="text-xs tabular-nums text-muted-foreground">{step.lifespan}</span>}
              </div>
            </div>

            {/* Body */}
            <div className="space-y-3 p-4">
              <p className="text-sm leading-relaxed text-foreground/90">{step.prose}</p>

              {/* Family chips */}
              {(step.spouses.length > 0 || step.childrenCount > 0 || step.occupation) && (
                <div className="flex flex-wrap gap-1.5">
                  {step.spouses.map((sp, i) => (
                    <span key={i} className="flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-[11px] text-rose-600 dark:text-rose-400">
                      <Heart className="h-3 w-3" /> {sp.name}
                    </span>
                  ))}
                  {step.childrenCount > 0 && (
                    <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-600 dark:text-emerald-400">
                      <Baby className="h-3 w-3" /> {t('tour.childrenCount', { count: step.childrenCount })}
                    </span>
                  )}
                  {step.occupation && (
                    <span className="flex items-center gap-1 rounded-full bg-secondary/40 px-2 py-0.5 text-[11px] text-muted-foreground">
                      <Briefcase className="h-3 w-3" /> {step.occupation}
                    </span>
                  )}
                </div>
              )}

              {/* "Meanwhile in the world" — Wikidata era events */}
              {(loadingHistory || history.length > 0) && (
                <div className="rounded-xl border-l-2 border-amber-500/60 bg-amber-500/5 p-2.5">
                  <p className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                    <Globe className="h-3 w-3" /> {t('tour.meanwhile')}
                  </p>
                  {loadingHistory ? (
                    <p className="text-[11px] italic text-muted-foreground">{t('tour.loadingHistory')}</p>
                  ) : (
                    <ul className="space-y-0.5">
                      {history.slice(0, 4).map((h, i) => (
                        <li key={i} className="text-[11px] leading-snug text-foreground/75">
                          {h.year && <span className="font-semibold tabular-nums text-amber-600 dark:text-amber-400">{h.year}</span>} {h.title}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            {/* Controls */}
            <div className="flex items-center justify-between gap-2 border-t border-border/40 p-3">
              <button
                onClick={onPrev}
                disabled={atStart}
                className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" /> {t('tour.prev')}
              </button>
              {atEnd ? (
                <button
                  onClick={onClose}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  <Flag className="h-4 w-4" /> {t('tour.finish')}
                </button>
              ) : (
                <button
                  onClick={onNext}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  {t('tour.next')} <ChevronRight className="h-4 w-4" />
                </button>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </>
  )
}
