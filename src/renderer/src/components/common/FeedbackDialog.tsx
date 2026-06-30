import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Bug, Lightbulb, MessageCircle, Send } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { sendFeedback } from '@/lib/feedback'
import type { FeedbackInput } from '@shared/types'

type Category = FeedbackInput['category']

const CATEGORIES: { value: Category; icon: typeof Bug; labelKey: string }[] = [
  { value: 'bug', icon: Bug, labelKey: 'feedback.bug' },
  { value: 'idea', icon: Lightbulb, labelKey: 'feedback.idea' },
  { value: 'other', icon: MessageCircle, labelKey: 'feedback.other' }
]

/** A single, no-account feedback form: the user types a message and it is
 *  relayed to the developer (with the app version/OS/language auto-attached, but
 *  never any genealogy data). */
export function FeedbackDialog({
  open,
  onOpenChange
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}): JSX.Element {
  const { t, i18n } = useTranslation()
  const [category, setCategory] = useState<Category>('bug')
  const [message, setMessage] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [version, setVersion] = useState('')

  // Reset the form each time the dialog opens; fetch the version for the footnote.
  useEffect(() => {
    if (!open) return
    setCategory('bug')
    setMessage('')
    setEmail('')
    setBusy(false)
    void window.api.updates.version().then(setVersion).catch(() => undefined)
  }, [open])

  const submit = async (): Promise<void> => {
    const text = message.trim()
    if (!text || busy) return
    setBusy(true)
    const res = await sendFeedback({
      category,
      message: text,
      email: email.trim() || undefined,
      locale: i18n.language
    })
    setBusy(false)
    if (res.ok) {
      toast.success(t('feedback.sent'))
      onOpenChange(false)
      return
    }
    if (res.error === 'not_configured') toast.error(t('feedback.notConfigured'))
    else if (res.error === 'network') toast.error(t('feedback.errorNetwork'))
    else toast.error(t('feedback.error'))
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-primary" />
            {t('feedback.title')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3.5 text-sm">
          <p className="text-muted-foreground">{t('feedback.intro')}</p>

          {/* Category */}
          <div className="grid grid-cols-3 gap-2">
            {CATEGORIES.map(({ value, icon: Icon, labelKey }) => (
              <button
                key={value}
                onClick={() => setCategory(value)}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-xs font-medium transition-colors',
                  category === value
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border/40 text-muted-foreground hover:bg-accent'
                )}
              >
                <Icon className="h-4 w-4" />
                {t(labelKey)}
              </button>
            ))}
          </div>

          {/* Message */}
          <div className="space-y-1">
            <Label>{t('feedback.messageLabel')}</Label>
            <Textarea
              autoFocus
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t('feedback.messagePlaceholder')}
              className="min-h-[120px] resize-none"
            />
          </div>

          {/* Optional reply e-mail */}
          <div className="space-y-1">
            <Label>{t('feedback.emailLabel')}</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('feedback.emailPlaceholder')}
            />
          </div>

          <p className="text-[11px] leading-snug text-muted-foreground">
            {t('feedback.privacyNote', { version: version || '—' })}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button size="sm" className="gap-1.5" onClick={submit} disabled={busy || !message.trim()}>
            <Send className="h-4 w-4" />
            {busy ? t('feedback.sending') : t('feedback.send')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
