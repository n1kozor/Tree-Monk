import * as React from 'react'
import { Input } from '@/components/ui/input'
import { maskDateTyping } from '@/lib/dates'

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
 */
export const DateInput = React.forwardRef<HTMLInputElement, DateInputProps>(
  ({ value, onValueChange, onCommit, onBlur, ...rest }, ref) => (
    <Input
      ref={ref}
      inputMode="numeric"
      value={value}
      onChange={(e) => onValueChange(maskDateTyping(e.target.value))}
      onBlur={(e) => {
        onCommit?.()
        onBlur?.(e)
      }}
      {...rest}
    />
  )
)
DateInput.displayName = 'DateInput'
