/**
 * A curated set of major historical events — Hungary-centric, then Europe and the
 * wider world — that a person likely lived through. Used for the map's "world
 * events" section and the profile timeline. Offline & reliable (Wikidata's live
 * queries time out and large events like the World Wars carry no single
 * coordinate, so a hand-picked list is both faster and more relevant here).
 *
 * `to` is the end year for spans (wars, eras); omit it for point events.
 */
export type EventScope = 'hungary' | 'europe' | 'world'

export interface WorldEvent {
  from: number
  to?: number
  scope: EventScope
  hu: string
  en: string
  de: string
}

const EVENTS: WorldEvent[] = [
  { from: 1492, scope: 'world', hu: 'Kolumbusz eléri Amerikát', en: 'Columbus reaches the Americas', de: 'Kolumbus erreicht Amerika' },
  { from: 1517, scope: 'europe', hu: 'A reformáció kezdete', en: 'The Reformation begins', de: 'Beginn der Reformation' },
  { from: 1526, scope: 'hungary', hu: 'Mohácsi csata', en: 'Battle of Mohács', de: 'Schlacht bei Mohács' },
  { from: 1541, to: 1699, scope: 'hungary', hu: 'Török hódoltság', en: 'Ottoman rule in Hungary', de: 'Osmanische Herrschaft in Ungarn' },
  { from: 1618, to: 1648, scope: 'europe', hu: 'Harmincéves háború', en: "Thirty Years' War", de: 'Dreißigjähriger Krieg' },
  { from: 1683, scope: 'hungary', hu: 'Bécs ostroma', en: 'Siege of Vienna', de: 'Zweite Wiener Türkenbelagerung' },
  { from: 1686, scope: 'hungary', hu: 'Buda visszafoglalása', en: 'Recapture of Buda', de: 'Rückeroberung von Buda' },
  { from: 1703, to: 1711, scope: 'hungary', hu: 'Rákóczi-szabadságharc', en: "Rákóczi's War of Independence", de: 'Rákóczi-Aufstand' },
  { from: 1709, to: 1713, scope: 'europe', hu: 'Nagy pestisjárvány', en: 'Great Plague outbreak', de: 'Große Pestepidemie' },
  { from: 1740, to: 1748, scope: 'europe', hu: 'Osztrák örökösödési háború', en: 'War of the Austrian Succession', de: 'Österreichischer Erbfolgekrieg' },
  { from: 1756, to: 1763, scope: 'europe', hu: 'Hétéves háború', en: "Seven Years' War", de: 'Siebenjähriger Krieg' },
  { from: 1776, scope: 'world', hu: 'Amerikai függetlenségi nyilatkozat', en: 'US Declaration of Independence', de: 'Amerikanische Unabhängigkeitserklärung' },
  { from: 1789, to: 1799, scope: 'europe', hu: 'Francia forradalom', en: 'French Revolution', de: 'Französische Revolution' },
  { from: 1803, to: 1815, scope: 'europe', hu: 'Napóleoni háborúk', en: 'Napoleonic Wars', de: 'Napoleonische Kriege' },
  { from: 1831, scope: 'hungary', hu: 'Nagy kolerajárvány', en: 'Major cholera epidemic', de: 'Große Choleraepidemie' },
  { from: 1848, to: 1849, scope: 'hungary', hu: 'Magyar forradalom és szabadságharc', en: 'Hungarian Revolution of 1848', de: 'Ungarische Revolution 1848' },
  { from: 1853, to: 1856, scope: 'europe', hu: 'Krími háború', en: 'Crimean War', de: 'Krimkrieg' },
  { from: 1861, to: 1865, scope: 'world', hu: 'Amerikai polgárháború', en: 'American Civil War', de: 'Amerikanischer Bürgerkrieg' },
  { from: 1866, scope: 'europe', hu: 'Porosz–osztrák háború', en: 'Austro-Prussian War', de: 'Deutsch-Österreichischer Krieg' },
  { from: 1867, scope: 'hungary', hu: 'A kiegyezés (Osztrák–Magyar Monarchia)', en: 'Austro-Hungarian Compromise', de: 'Österreichisch-Ungarischer Ausgleich' },
  { from: 1870, to: 1871, scope: 'europe', hu: 'Porosz–francia háború', en: 'Franco-Prussian War', de: 'Deutsch-Französischer Krieg' },
  { from: 1873, scope: 'hungary', hu: 'Budapest egyesítése', en: 'Unification of Budapest', de: 'Vereinigung von Budapest' },
  { from: 1873, scope: 'hungary', hu: 'Kolerajárvány', en: 'Cholera epidemic', de: 'Choleraepidemie' },
  { from: 1914, to: 1918, scope: 'world', hu: 'Első világháború', en: 'World War I', de: 'Erster Weltkrieg' },
  { from: 1918, to: 1920, scope: 'world', hu: 'Spanyolnátha-járvány', en: 'Spanish flu pandemic', de: 'Spanische Grippe' },
  { from: 1918, scope: 'hungary', hu: 'Őszirózsás forradalom', en: 'Aster Revolution', de: 'Asternrevolution' },
  { from: 1919, scope: 'hungary', hu: 'Tanácsköztársaság', en: 'Hungarian Soviet Republic', de: 'Ungarische Räterepublik' },
  { from: 1920, scope: 'hungary', hu: 'Trianoni békeszerződés', en: 'Treaty of Trianon', de: 'Vertrag von Trianon' },
  { from: 1929, to: 1933, scope: 'world', hu: 'Nagy gazdasági világválság', en: 'Great Depression', de: 'Weltwirtschaftskrise' },
  { from: 1939, to: 1945, scope: 'world', hu: 'Második világháború', en: 'World War II', de: 'Zweiter Weltkrieg' },
  { from: 1944, scope: 'hungary', hu: 'Holokauszt Magyarországon', en: 'The Holocaust in Hungary', de: 'Holocaust in Ungarn' },
  { from: 1948, to: 1989, scope: 'hungary', hu: 'Kommunista diktatúra', en: 'Communist dictatorship', de: 'Kommunistische Diktatur' },
  { from: 1956, scope: 'hungary', hu: 'Az 1956-os forradalom', en: 'Hungarian Revolution of 1956', de: 'Ungarischer Volksaufstand 1956' },
  { from: 1989, scope: 'hungary', hu: 'Rendszerváltás', en: 'Fall of Communism', de: 'Wende (Ende des Kommunismus)' },
  { from: 1991, scope: 'world', hu: 'A Szovjetunió felbomlása', en: 'Dissolution of the Soviet Union', de: 'Auflösung der Sowjetunion' },
  { from: 2004, scope: 'hungary', hu: 'Magyarország uniós csatlakozása', en: 'Hungary joins the EU', de: 'Ungarn tritt der EU bei' }
]

/** Major events overlapping [fromYear, toYear], oldest first. */
export function worldEventsInRange(fromYear: number, toYear: number): WorldEvent[] {
  return EVENTS.filter((e) => e.from <= toYear && (e.to ?? e.from) >= fromYear).sort((a, b) => a.from - b.from)
}

/** Localised title — Hungarian, German, or English. */
export function worldEventTitle(e: WorldEvent, lang: string): string {
  if (lang.startsWith('hu')) return e.hu
  if (lang.startsWith('de')) return e.de
  return e.en
}

/** "1914–1918" or "1526". */
export function worldEventYears(e: WorldEvent): string {
  return e.to && e.to !== e.from ? `${e.from}–${e.to}` : `${e.from}`
}
