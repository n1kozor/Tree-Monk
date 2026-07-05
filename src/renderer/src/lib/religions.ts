/** Common religion / denomination suggestions for the religion field, localized
 *  to the UI language. Shown in a <datalist> — the field stays free-text, these
 *  are just quick-pick options. */
const LISTS: Record<string, string[]> = {
  hu: [
    'Római katolikus',
    'Görögkatolikus',
    'Református',
    'Evangélikus',
    'Izraelita',
    'Ortodox',
    'Unitárius',
    'Baptista',
    'Metodista',
    'Adventista',
    'Pünkösdi',
    'Felekezeten kívüli'
  ],
  de: [
    'Römisch-katholisch',
    'Griechisch-katholisch',
    'Evangelisch',
    'Evangelisch-lutherisch',
    'Reformiert',
    'Jüdisch',
    'Orthodox',
    'Unitarisch',
    'Baptisten',
    'Methodisten',
    'Adventisten',
    'Pfingstler',
    'Konfessionslos'
  ],
  en: [
    'Roman Catholic',
    'Greek Catholic',
    'Protestant',
    'Lutheran',
    'Reformed / Calvinist',
    'Jewish',
    'Orthodox',
    'Unitarian',
    'Baptist',
    'Methodist',
    'Adventist',
    'Pentecostal',
    'None'
  ]
}

export function religionOptions(lang: string): string[] {
  return LISTS[(lang || 'en').slice(0, 2)] ?? LISTS.en
}
