import type { Readable } from 'node:stream'
import type { ResolvedConfig } from '../config'
import type { MediaRepository } from '../db/repository'
import type { ImageBuilder, ImageProcessor, ConversionPlan } from '../image/types'
import type { CollectionConfig, OwnerConfig } from '../owners/types'
import type { MediaRecord } from '../types'
import { buildPathContext } from '../storage/path'

export interface RunConversionsInput {
  media: MediaRecord
  collection: CollectionConfig
  ownerConfig: OwnerConfig | null
  config: ResolvedConfig
  repo: MediaRepository
}

export async function runConversions(input: RunConversionsInput): Promise<void> {
  const { media, collection, ownerConfig, config, repo } = input
  if (!media.mimeType.startsWith('image/')) return

  const plans = collectPlansFor(collection, ownerConfig)
  if (plans.length === 0) return

  const inlinePlans = plans.filter((p) => !p.queued)
  const queuedPlans = plans.filter((p) => p.queued)

  if (inlinePlans.length > 0 && !config.image) {
    config.logger.warn(
      'mediable: inline conversions declared but no `image` processor configured — skipping inline conversions',
    )
  }

  if (config.image) {
    for (const plan of inlinePlans) {
      await executeOne({ media, plan, config, repo })
    }
  }

  for (const plan of queuedPlans) {
    const enqueueOpts = plan.priority !== undefined ? { priority: plan.priority } : undefined
    await config.queue.enqueue(
      'mediable:generate-conversion',
      { mediaId: media.id, conversionName: plan.name },
      enqueueOpts,
    )
  }

  if (inlinePlans.length > 0 && queuedPlans.length === 0) {
    const fresh = await repo.findById(media.id)
    if (fresh) {
      const allDone = plans.every((p) => fresh.generatedConversions[p.name])
      if (allDone && !fresh.optimizedAt) {
        await repo.update(media.id, { optimizedAt: new Date() })
        await config.events.emit('onConversionsFinished', { media: fresh })
      }
    }
  }
}

function collectPlansFor(
  collection: CollectionConfig,
  ownerConfig: OwnerConfig | null,
): ConversionPlan[] {
  const plans = new Map<string, ConversionPlan>()
  for (const p of collection.conversions) plans.set(p.name, p)
  if (ownerConfig) {
    for (const shared of ownerConfig.sharedConversions) {
      const targets = shared.performOn
      if (targets === null || targets.includes(collection.name)) {
        if (!plans.has(shared.plan.name)) plans.set(shared.plan.name, shared.plan)
      }
    }
  }
  return [...plans.values()]
}

interface ExecuteOneInput {
  media: MediaRecord
  plan: ConversionPlan
  config: ResolvedConfig
  repo: MediaRepository
}

export async function executeOne(input: ExecuteOneInput): Promise<void> {
  const { media, plan, config, repo } = input
  if (!config.image) return

  const disk = config.storage.disks[media.disk]
  if (!disk) throw new Error(`disk not found: ${media.disk}`)
  const outDisk = config.storage.disks[media.conversionsDisk] ?? disk

  const ctx = buildPathContext({
    mediaId: media.id,
    uuid: media.uuid,
    modelType: media.modelType,
    modelId: media.modelId,
    collectionName: media.collectionName,
    fileName: media.fileName,
  })

  const originalKey = config.pathGenerator.original(ctx)
  const originalBuf = await disk.getBuffer(originalKey)

  const builder = config.image.open(originalBuf)
  applyOps(builder, plan)
  const result = await builder.toBuffer()

  const outKey = config.pathGenerator.conversion(ctx, plan.name, plan.outputExt)
  await outDisk.put(outKey, result.data, {
    contentType: mimeForFormat(plan.outputFormat),
    contentLength: result.info.size,
  })

  const fresh = await repo.findById(media.id)
  if (!fresh) return
  const generated = { ...fresh.generatedConversions, [plan.name]: true }
  const allKnown = new Set(Object.keys(generated))
  const updates: Partial<MediaRecord> = { generatedConversions: generated }
  const targeted = collectExpectedConversionNames(fresh, config)
  if (targeted.every((n) => allKnown.has(n) && generated[n])) {
    updates.optimizedAt = new Date()
  }
  const updated = await repo.update(media.id, updates)
  if (updates.optimizedAt) {
    await config.events.emit('onConversionsFinished', { media: updated })
  }
}

function collectExpectedConversionNames(
  record: MediaRecord,
  config: ResolvedConfig,
): string[] {
  const owner = config.owners.byType.get(record.modelType) ?? config.owners.wildcard
  if (!owner) return []
  const collection = owner.collections.get(record.collectionName)
  if (!collection) return []
  const names = new Set<string>()
  for (const p of collection.conversions) names.add(p.name)
  for (const s of owner.sharedConversions) {
    if (s.performOn === null || s.performOn.includes(record.collectionName)) {
      names.add(s.plan.name)
    }
  }
  return [...names]
}

function applyOps(builder: ImageBuilder, plan: ConversionPlan): void {
  for (const op of plan.ops) {
    switch (op.type) {
      case 'width':
        builder.width(op.args[0] as number)
        break
      case 'height':
        builder.height(op.args[0] as number)
        break
      case 'fit':
        builder.fit(op.args[0] as any)
        break
      case 'format':
        builder.format(op.args[0] as any, op.args[1] as any)
        break
      case 'quality':
        builder.quality(op.args[0] as number)
        break
      case 'blur':
        builder.blur(op.args[0] as number | undefined)
        break
      case 'sharpen':
        builder.sharpen()
        break
      case 'grayscale':
        builder.grayscale()
        break
      case 'rotate':
        builder.rotate(op.args[0] as number)
        break
      case 'flip':
        builder.flip()
        break
      case 'flop':
        builder.flop()
        break
      case 'crop':
        builder.crop(
          op.args[0] as number,
          op.args[1] as number,
          op.args[2] as number,
          op.args[3] as number,
        )
        break
    }
  }
}

function mimeForFormat(fmt: ConversionPlan['outputFormat']): string {
  switch (fmt) {
    case 'jpeg':
      return 'image/jpeg'
    case 'png':
      return 'image/png'
    case 'webp':
      return 'image/webp'
    case 'avif':
      return 'image/avif'
    default:
      return 'application/octet-stream'
  }
}
