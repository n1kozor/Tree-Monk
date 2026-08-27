/** Month names and common abbreviations understood by the date helpers. */
const deaccent = (value: string): string =>
  value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

const MONTHS: Record<string, number> = {}
const defineMonth = (month: number, ...names: string[]): void => {
  for (const name of names) MONTHS[deaccent(name)] = month
}

defineMonth(1, 'january', 'jan', 'januar', 'jänner', 'január', 'janvier', 'janv')
defineMonth(2, 'february', 'feb', 'febr', 'februar', 'február', 'février', 'févr', 'fevr', 'fev')
defineMonth(3, 'march', 'mar', 'marc', 'marcius', 'március', 'märz', 'maerz', 'mrz', 'mars')
defineMonth(4, 'april', 'apr', 'aprilis', 'április', 'ápr', 'avr', 'avril')
defineMonth(5, 'may', 'maj', 'majus', 'május', 'máj', 'mai')
defineMonth(6, 'june', 'jun', 'junius', 'június', 'juni', 'jún', 'juin')
defineMonth(7, 'july', 'jul', 'julius', 'július', 'juli', 'júl', 'juillet', 'juil')
defineMonth(8, 'august', 'aug', 'augusztus', 'août', 'aout', 'aou')
defineMonth(9, 'september', 'sep', 'sept', 'szeptember', 'szept', 'szep', 'septembre')
defineMonth(10, 'october', 'oct', 'okt', 'oktober', 'október', 'octobre')
defineMonth(11, 'november', 'nov', 'novembre')
defineMonth(12, 'december', 'dec', 'dez', 'dezember', 'décembre', 'decembre', 'déc')

export const monthNumbers: Readonly<Record<string, number>> = MONTHS
export const fuzzyMonthNames: readonly [string, number][] = Object.entries(MONTHS).filter(
  ([name]) => name.length >= 6
)

export function monthNumber(value: string): number | null {
  return monthNumbers[deaccent(value)] ?? null
}
