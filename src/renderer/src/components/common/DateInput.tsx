import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import { formatDisplayDate, maskDateTyping } from '@/lib/dates'
import { smartNormalizeDate } from '@/lib/smartDate'
import { useSettings } from '@/store/useSettings'

interface DateInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: string
  /** Receives the value with ISO separators already inserted while typing. */
  onValueChange: (v: string) => void
  /** Called on blur — wire `normalizeDate` here to canonicalise the final value. */
  onCommit?: () => void
}

/**
 * A text input for genealogical dates that fills in the `-` separators as you
 * type a plain digit string (`20220112` → `2022-01-12`), while leaving qualified
 * or day-first input untouched for `normalizeDate` to handle on blur.
 *
 * While typing, a language-aware suggestion appears in a dropdown (via the
 * FamilySearch Date authority in FS mode, the local normalizer otherwise) —
 * click it to apply the canonical form immediately.
 */
export const DateInput = React.forwardRef<HTMLInputElement, DateInputProps>(
  ({ value, onValueChange, onCommit, onBlur, onFocus, ...rest }, ref) => {
    const [suggestion, setSuggestion] = React.useState<string | null>(null)
    const [open, setOpen] = React.useState(false)
    // While focused we edit a local DRAFT (seeded from the display-formatted
    // value on focus). This way the field reads in the user's chosen format
    // BOTH focused and blurred — no more "ISO while editing, eu/us after" jump.
    // Storage stays ISO: onCommit re-normalizes the draft on blur.
    const [draft, setDraft] = React.useState<string | null>(null)
    const dateFormat = useSettings((s) => s.dateFormat)
    const { i18n, t } = useTranslation()
    const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
    const seq = React.useRef(0)
    const shown = draft !== null ? draft : formatDisplayDate(value, dateFormat, i18n.language)

    const lookup = (raw: string): void => {
      if (timer.current) clearTimeout(timer.current)
      const mine = ++seq.current
      if (raw.trim().length < 4) {
        setSuggestion(null)
        return
      }
      timer.current = setTimeout(() => {
        void smartNormalizeDate(raw).then((norm) => {
          if (seq.current !== mine) return
          setSuggestion(norm && norm !== raw.trim() ? norm : null)
        })
      }, 450)
    }

    return (
      <div className="relative">
        <Input
          ref={ref}
          inputMode="numeric"
          title={t('person.dateQualifierHint')}
          value={shown}
          onChange={(e) => {
            const v = maskDateTyping(e.target.value)
            setDraft(v)
            onValueChange(v)
            lookup(v)
            setOpen(true)
          }}
          onFocus={(e) => {
            // Seed the editable draft with the value in DISPLAY format.
            setDraft(formatDisplayDate(value, dateFormat, i18n.language))
            setOpen(true)
            onFocus?.(e)
          }}
          onBlur={(e) => {
            setDraft(null)
            // Let a click on the suggestion land before closing.
            setTimeout(() => setOpen(false), 150)
            onCommit?.()
            onBlur?.(e)
          }}
          {...rest}
        />
        {open && suggestion && (
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault()
              onValueChange(suggestion)
              setSuggestion(null)
              setDraft(null) // revert to the formatted display of the applied value
              setOpen(false)
              // Commit right away so the canonical value persists.
              setTimeout(() => onCommit?.(), 0)
            }}
            className="absolute left-0 top-full z-50 mt-1 w-full truncate rounded-md border border-border bg-popover px-3 py-1.5 text-left text-sm shadow-md hover:bg-accent"
          >
            {/* Preview in the SAME display format the committed value will show
                (storage stays the ISO `suggestion` via onValueChange above) —
                otherwise the dropdown shows raw ISO while the field shows eu/us. */}
            {formatDisplayDate(suggestion, dateFormat, i18n.language)}
          </button>
        )}
      </div>
    )
  }
)
DateInput.displayName = 'DateInput'
