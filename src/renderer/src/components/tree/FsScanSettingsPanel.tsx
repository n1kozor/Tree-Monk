import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Settings2 } from 'lucide-react'
import { usePedigreeSettings } from '@/store/usePedigreeSettings'
import { MAX_FS_SCAN_DEPTH } from '@shared/familysearch'
import { normalizeFsScanDepth } from '@/lib/fsScanDepth'

export function FsScanDepthField(): JSX.Element {
  const { t } = useTranslation()
  const ped = usePedigreeSettings()

  return (
    <div className="space-y-1.5">
      <label htmlFor="fs-scan-depth" className="text-[11px] text-muted-foreground">
        {t('fsScan.depthTitle')}
      </label>
      <select
        id="fs-scan-depth"
        value={ped.fsScanDepth === null ? 'all' : String(ped.fsScanDepth)}
        onChange={(e) => ped.set({ fsScanDepth: normalizeFsScanDepth(e.target.value) })}
        className="h-9 w-full rounded-xl border border-input bg-transparent px-2.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary/30"
      >
        <option value="all">{t('fsScan.depthAll')}</option>
        {Array.from({ length: MAX_FS_SCAN_DEPTH }, (_, index) => index + 1).map((depth) => (
          <option key={depth} value={depth}>
            {t('fsScan.depthValue', { count: depth })}
          </option>
        ))}
      </select>
    </div>
  )
}

/** Small canvas-corner popover for the FamilySearch scan scope. */
export function FsScanSettingsPanel({ inline = false }: { inline?: boolean }): JSX.Element {
  const { t } = useTranslation()
  const ped = usePedigreeSettings()
  const [open, setOpen] = useState(false)

  return (
    <div className={inline ? 'relative' : 'absolute right-4 top-4 z-30'}>
      <button
        onClick={() => setOpen((v) => !v)}
        title={t('fsScan.depthTitle')}
        aria-label={t('fsScan.depthTitle')}
        aria-expanded={open}
        className={`glass-subtle flex h-9 items-center justify-center rounded-xl p-2 text-muted-foreground transition-colors hover:text-primary ${
          open ? 'bg-primary/15 text-primary ring-1 ring-primary/20' : ''
        }`}
      >
        <Settings2 className="h-4 w-4" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="glass-strong absolute right-0 top-11 z-50 w-64 rounded-2xl p-3 text-card-foreground">
            <div className="mb-3 flex items-start gap-2">
              <Settings2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <div>
                <p className="text-sm font-semibold">{t('fsScan.title')}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{t('fsScan.depthTitle')}</p>
              </div>
            </div>

            <FsScanDepthField />

            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Check className="h-3.5 w-3.5 text-emerald-600" />
              {ped.fsScanDepth === null ? t('fsScan.depthAll') : t('fsScan.depthValue', { count: ped.fsScanDepth })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
