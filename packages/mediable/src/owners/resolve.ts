import type { OwnerCallback, OwnerConfig } from './types'
import { runOwnerCallback } from './builder'

export interface ResolvedOwners {
  byType: Map<string, OwnerConfig>
  wildcard: OwnerConfig | null
}

export function resolveOwners(
  raw: Record<string, OwnerCallback> | undefined,
): ResolvedOwners {
  const byType = new Map<string, OwnerConfig>()
  let wildcard: OwnerConfig | null = null
  if (!raw) return { byType, wildcard }

  for (const [name, cb] of Object.entries(raw)) {
    const cfg = runOwnerCallback(name, cb)
    if (name === '*') {
      wildcard = cfg
    } else {
      byType.set(name, cfg)
    }
  }

  if (wildcard) {
    for (const [, owner] of byType) {
      applyWildcard(owner, wildcard)
    }
  }

  return { byType, wildcard }
}

function applyWildcard(owner: OwnerConfig, wildcard: OwnerConfig): void {
  for (const shared of wildcard.sharedConversions) {
    if (!owner.sharedConversions.some((s) => s.plan.name === shared.plan.name)) {
      owner.sharedConversions.push(shared)
    }
  }
}

export function getOwnerConfig(
  resolved: ResolvedOwners,
  modelType: string,
): OwnerConfig | null {
  const direct = resolved.byType.get(modelType)
  if (direct) return direct
  return resolved.wildcard
}
