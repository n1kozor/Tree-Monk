declare module '@openhistoricalmap/maplibre-gl-dates' {
  import type { Map } from 'maplibre-gl'
  /** Filters all OHM layers so only features valid at `date` are shown. */
  export function filterByDate(map: Map, date: string | Date): void
  export function dateRangeFromDate(date: string | Date): { startDate: Date; endDate: Date }
}
