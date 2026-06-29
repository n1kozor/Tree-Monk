import { describe, it, expect } from 'vitest'
import { frameOverflow, frameStyle, frameToJson, parseFrame, DEFAULT_FRAME } from '@/lib/photoFrame'

describe('frameOverflow', () => {
  it('a portrait has vertical room and none horizontally at zoom 1', () => {
    const ov = frameOverflow({ ...DEFAULT_FRAME, a: 0.5 })
    expect(ov.y).toBeCloseTo(1) // image is twice as tall as the box
    expect(ov.x).toBeCloseTo(0)
  })

  it('the pan range GROWS with zoom (the bug: zoomed portraits must still pan up)', () => {
    const z1 = frameOverflow({ ...DEFAULT_FRAME, a: 0.5, scale: 1 })
    const z2 = frameOverflow({ ...DEFAULT_FRAME, a: 0.5, scale: 2 })
    expect(z2.y).toBeGreaterThan(z1.y)
    expect(z2.y).toBeCloseTo(3) // 1/0.5 * 2 - 1
  })
})

const pct = (v: unknown): number => Number(String(v).replace('%', ''))

describe('frameStyle', () => {
  it('sizes the image to cover the box times the zoom (no pre-crop)', () => {
    const s = frameStyle({ x: 0.5, y: 0.5, scale: 2, a: 0.5 }) // portrait, 2× zoom
    expect(pct(s.width)).toBeCloseTo(200) // 1 * 2 * 100
    expect(pct(s.height)).toBeCloseTo(400) // (1/0.5) * 2 * 100
    expect(s.position).toBe('absolute')
  })

  it('panning to the top aligns the image top with the box (head visible), even zoomed', () => {
    const top = frameStyle({ x: 0.5, y: 0, scale: 2, a: 0.5 })
    expect(pct(top.top)).toBeCloseTo(0) // y=0 → top edge of photo at box top
    const mid = frameStyle({ x: 0.5, y: 0.5, scale: 2, a: 0.5 })
    expect(pct(mid.top)).toBeLessThan(0) // centred → shifted up, top is cropped
  })
})

describe('parse/serialize', () => {
  it('round-trips a real framing including aspect', () => {
    const json = frameToJson({ x: 0.3, y: 0.1, scale: 2, a: 0.75 })
    expect(json).not.toBeNull()
    const f = parseFrame(json)
    expect(f.x).toBeCloseTo(0.3)
    expect(f.y).toBeCloseTo(0.1)
    expect(f.scale).toBeCloseTo(2)
    expect(f.a).toBeCloseTo(0.75)
  })

  it('a centred, un-zoomed frame serializes to null', () => {
    expect(frameToJson(DEFAULT_FRAME)).toBeNull()
  })
})
