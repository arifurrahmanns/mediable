import type { SizeSpec } from './types'

const SIZE_RE = /^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB)$/i

const UNIT_MULTIPLIER: Record<string, number> = {
  B: 1,
  KB: 1024,
  MB: 1024 * 1024,
  GB: 1024 * 1024 * 1024,
}

export function parseSize(spec: SizeSpec): number {
  if (typeof spec === 'number') return spec
  const match = SIZE_RE.exec(spec)
  if (!match) {
    throw new Error(`invalid size spec: ${spec}`)
  }
  const value = Number.parseFloat(match[1]!)
  const unit = match[2]!.toUpperCase()
  const mult = UNIT_MULTIPLIER[unit]
  if (!mult) throw new Error(`unknown size unit: ${unit}`)
  return Math.floor(value * mult)
}
