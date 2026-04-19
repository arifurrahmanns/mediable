import { createRequire } from 'node:module'
import type { DatabaseAdapter } from '../db/types'
import type { MediaRecord } from '../types'

declare const __filename: string | undefined
const requireShim = createRequire(
  typeof __filename !== 'undefined' ? __filename : import.meta.url,
)

export interface MongooseAdapterOptions {
  /** MongoDB connection URI. If provided, the adapter connects lazily on first use. */
  url?: string
  /** Mongoose model name. Default: 'Media'. */
  modelName?: string
}

interface MongooseAdapter extends DatabaseAdapter {
  ensureIndexes(): Promise<void>
  close(): Promise<void>
}

export function mongooseAdapter(opts: MongooseAdapterOptions = {}): MongooseAdapter {
  const mongoose = loadMongoose()
  const Schema = mongoose.Schema
  const modelName = opts.modelName ?? 'Media'

  const MediaSchema = new Schema(
    {
      _id: { type: String, required: true },
      uuid: { type: String, required: true, unique: true, index: true },
      modelType: { type: String, required: true },
      modelId: { type: String, required: true },
      collectionName: { type: String, default: 'default' },
      name: String,
      fileName: String,
      mimeType: String,
      disk: String,
      conversionsDisk: String,
      size: { type: Number, default: 0 },
      manipulations: { type: Schema.Types.Mixed, default: {} },
      customProperties: { type: Schema.Types.Mixed, default: {} },
      generatedConversions: { type: Schema.Types.Mixed, default: {} },
      responsiveImages: { type: Schema.Types.Mixed, default: {} },
      orderColumn: { type: Number, default: 0 },
      status: {
        type: String,
        enum: ['pending', 'ready', 'failed'],
        default: 'ready',
      },
      optimizedAt: { type: Date, default: null },
    },
    { timestamps: true, versionKey: false, _id: false },
  )

  MediaSchema.index({ modelType: 1, modelId: 1 })
  MediaSchema.index({ modelType: 1, modelId: 1, collectionName: 1 })
  MediaSchema.index({ status: 1, createdAt: 1 })

  const MediaModel =
    mongoose.models?.[modelName] ?? mongoose.model(modelName, MediaSchema)

  let connected = false
  const ensureConnected = async () => {
    if (connected) return
    if (opts.url && mongoose.connection.readyState === 0) {
      await mongoose.connect(opts.url)
    }
    connected = true
  }

  return {
    id: 'mongoose',

    async create(_m, data) {
      await ensureConnected()
      const doc = await MediaModel.create(toDoc(data))
      return docToRecord(doc.toObject())
    },

    async findOne(_m, where) {
      await ensureConnected()
      const doc = await MediaModel.findOne(toFilter(where)).lean()
      return doc ? docToRecord(doc) : null
    },

    async findMany(_m, q) {
      await ensureConnected()
      let query: any = MediaModel.find(toFilter(q.where))
      if (q.orderBy) {
        const sort: Record<string, 1 | -1> = {}
        for (const o of q.orderBy) {
          const key = o.field === 'id' ? '_id' : (o.field as string)
          sort[key] = o.dir === 'asc' ? 1 : -1
        }
        query = query.sort(sort)
      }
      if (q.limit) query = query.limit(q.limit)
      if (q.offset) query = query.skip(q.offset)
      const docs = await query.lean()
      return docs.map(docToRecord)
    },

    async update(_m, where, data) {
      await ensureConnected()
      const filter = toFilter(where)
      await MediaModel.updateOne(filter, toDoc(data))
      const doc = await MediaModel.findOne(filter).lean()
      if (!doc) throw new Error('media not found after update')
      return docToRecord(doc)
    },

    async delete(_m, where) {
      await ensureConnected()
      await MediaModel.deleteOne(toFilter(where))
    },

    async ensureIndexes() {
      await ensureConnected()
      await MediaModel.createIndexes()
    },

    async close() {
      if (opts.url && mongoose.connection.readyState !== 0) {
        await mongoose.disconnect()
      }
    },
  }
}

function loadMongoose(): any {
  const m = tryRequireMongoose()
  if (!m) {
    throw new Error(
      "MongoDB provider requires the 'mongoose' package. Install with: pnpm add mongoose",
    )
  }
  return m
}

function tryRequireMongoose(): any | null {
  try {
    const mod = requireShim('mongoose')
    return mod.default ?? mod
  } catch {
    return null
  }
}

function docToRecord(doc: any): MediaRecord {
  return {
    id: doc._id,
    uuid: doc.uuid,
    modelType: doc.modelType,
    modelId: String(doc.modelId),
    collectionName: doc.collectionName,
    name: doc.name,
    fileName: doc.fileName,
    mimeType: doc.mimeType,
    disk: doc.disk,
    conversionsDisk: doc.conversionsDisk,
    size: doc.size,
    manipulations: doc.manipulations ?? {},
    customProperties: doc.customProperties ?? {},
    generatedConversions: doc.generatedConversions ?? {},
    responsiveImages: doc.responsiveImages ?? {},
    orderColumn: doc.orderColumn,
    status: doc.status,
    optimizedAt: doc.optimizedAt ?? null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}

function toFilter(where: any): any {
  if (!where) return {}
  const { id, ...rest } = where
  return id !== undefined ? { _id: id, ...rest } : rest
}

function toDoc(data: any): any {
  const { id, ...rest } = data
  const patch: any = { ...rest }
  if (rest.modelId !== undefined) patch.modelId = String(rest.modelId)
  return id !== undefined ? { _id: id, ...patch } : patch
}
