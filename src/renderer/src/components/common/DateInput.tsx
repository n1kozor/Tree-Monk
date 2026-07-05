import * as React from 'react'
import { Input } from '@/components/ui/input'
import { maskDateTyping } from '@/lib/dates'
import { smartNormalizeDate } from '@/lib/smartDate'

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
    const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
    const seq = React.useRef(0)

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
          value={value}
          onChange={(e) => {
            const v = maskDateTyping(e.target.value)
            onValueChange(v)
            lookup(v)
            setOpen(true)
          }}
          onFocus={(e) => {
            setOpen(true)
            onFocus?.(e)
          }}
          onBlur={(e) => {
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
              setOpen(false)
              // Commit right away so the canonical value persists.
              setTimeout(() => onCommit?.(), 0)
            }}
            className="absolute left-0 top-full z-50 mt-1 w-full truncate rounded-md border border-border bg-popover px-3 py-1.5 text-left text-sm shadow-md hover:bg-accent"
          >
            {suggestion}
          </button>
        )}
      </div>
    )
  }
)
DateInput.displayName = 'DateInput'
