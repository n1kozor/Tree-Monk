import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/** A small modal that prompts for a single text value (e.g. a board name). */
export function NameDialog({
  open,
  onOpenChange,
  title,
  initial = '',
  placeholder,
  submitLabel,
  onSubmit
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  title: string
  initial?: string
  placeholder?: string
  submitLabel: string
  onSubmit: (value: string) => void
}): JSX.Element {
  const { t } = useTranslation()
  const [value, setValue] = useState(initial)
  useEffect(() => {
    if (open) setValue(initial)
  }, [open, initial])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const v = value.trim()
            if (v) {
              onSubmit(v)
              onOpenChange(false)
            }
          }}
        >
          <Input
            autoFocus
            value={value}
            placeholder={placeholder}
            onChange={(e) => setValue(e.target.value)}
            className="mb-4"
          />
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" size="sm" disabled={!value.trim()}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
