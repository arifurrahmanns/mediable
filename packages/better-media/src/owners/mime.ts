import type { MimeMatcher } from './types'

export function parseMatcher(input: string): MimeMatcher {
  if (input.startsWith('.')) {
    return { kind: 'ext', value: input.slice(1).toLowerCase() }
  }
  if (input.endsWith('/*')) {
    return { kind: 'wildcard', prefix: input.slice(0, -2).toLowerCase() }
  }
  if (input.includes('/')) {
    return { kind: 'exact', value: input.toLowerCase() }
  }
  return { kind: 'ext', value: input.toLowerCase() }
}

export function matches(
  matchers: MimeMatcher[],
  mimeType: string,
  fileName?: string,
): boolean {
  if (matchers.length === 0) return true
  const mt = mimeType.toLowerCase()
  const ext = fileName?.split('.').pop()?.toLowerCase() ?? ''
  for (const m of matchers) {
    switch (m.kind) {
      case 'exact':
        if (mt === m.value) return true
        break
      case 'wildcard':
        if (mt.startsWith(`${m.prefix}/`)) return true
        break
      case 'regex':
        if (m.value.test(mt)) return true
        break
      case 'ext':
        if (ext === m.value) return true
        break
    }
  }
  return false
}
