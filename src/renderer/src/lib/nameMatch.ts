// Linguistic name matching now lives in src/shared so the main process (duplicate
// detection) and the renderer (search) share one implementation. Re-exported here
// so existing `@/lib/nameMatch` imports keep working unchanged.
export * from '@shared/nameMatch'
