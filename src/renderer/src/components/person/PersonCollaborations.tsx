import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MessagesSquare } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import type { Collaboration } from '@shared/types'

/** Read-only list of a person's FamilySearch "Collaboration" (Együttműködés)
 *  discussions. Self-fetching; reloads after a FamilySearch sync. Renders nothing
 *  when the person has no discussions, so it never clutters ordinary profiles. */
export function PersonCollaborations({ personId }: { personId: string }): JSX.Element | null {
  const { t, i18n } = useTranslation()
  const personSyncNonce = useAppStore((s) => s.personSyncNonce)
  const [items, setItems] = useState<Collaboration[]>([])

  useEffect(() => {
    let alive = true
    window.api.collaborations
      ?.listForPerson(personId)
      .then((r) => alive && setItems(r))
      .catch(() => alive && setItems([]))
    return () => {
      alive = false
    }
  }, [personId, personSyncNonce])

  if (!items.length) return null

  return (
    <section className="glass rounded-2xl p-4">
      <h4 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <MessagesSquare className="h-3.5 w-3.5" /> {t('collaboration.title')} ({items.length})
      </h4>
      <div className="space-y-3">
        {items.map((c) => (
          <div key={c.id} className="rounded-xl border border-border/40 bg-secondary/40 p-3">
            {(c.title || c.createdAt) && (
              <div className="mb-1 flex items-baseline justify-between gap-2">
                {c.title && <span className="text-sm font-semibold">{c.title}</span>}
                {c.createdAt && (
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {new Date(c.createdAt).toLocaleDateString(i18n.language)}
                  </span>
                )}
              </div>
            )}
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/80">{c.body}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
