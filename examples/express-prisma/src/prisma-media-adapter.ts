import type { DatabaseAdapter, Json, MediaRecord } from 'better-media'
import type { PrismaClient } from '@prisma/client'

const JSON_FIELDS = [
  'manipulations',
  'customProperties',
  'generatedConversions',
  'responsiveImages',
] as const

type JsonField = (typeof JSON_FIELDS)[number]

export function prismaAdapter(prisma: PrismaClient): DatabaseAdapter {
  const toRecord = (row: any): MediaRecord => ({
    id: row.id,
    uuid: row.uuid,
    modelType: row.modelType,
    modelId: String(row.modelId),
    collectionName: row.collectionName,
    name: row.name,
    fileName: row.fileName,
    mimeType: row.mimeType,
    disk: row.disk,
    conversionsDisk: row.conversionsDisk,
    size: row.size,
    manipulations: parseJson(row.manipulations),
    customProperties: parseJson(row.customProperties),
    generatedConversions: parseJson(row.generatedConversions) as Record<string, boolean>,
    responsiveImages: parseJson(row.responsiveImages),
    orderColumn: row.orderColumn,
    status: row.status,
    optimizedAt: row.optimizedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  })

  const toDbData = (data: any): any => {
    const out: Record<string, unknown> = { ...data }
    if (out.modelId !== undefined) out.modelId = String(out.modelId)
    for (const k of JSON_FIELDS) {
      if (out[k] !== undefined && typeof out[k] !== 'string') {
        out[k] = JSON.stringify(out[k])
      }
    }
    return out
  }

  const toDbWhere = (where: any): any => {
    const out: Record<string, unknown> = { ...where }
    if (out.modelId !== undefined) out.modelId = String(out.modelId)
    return out
  }

  return {
    id: 'prisma',

    async create(_m, data) {
      const row = await prisma.media.create({ data: toDbData(data) })
      return toRecord(row)
    },

    async findOne(_m, where) {
      const row = await prisma.media.findFirst({ where: toDbWhere(where) })
      return row ? toRecord(row) : null
    },

    async findMany(_m, { where, orderBy, limit, offset }) {
      const rows = await prisma.media.findMany({
        where: toDbWhere(where ?? {}),
        orderBy: orderBy?.map((o) => ({ [o.field]: o.dir })),
        take: limit,
        skip: offset,
      })
      return rows.map(toRecord)
    },

    async update(_m, where, data) {
      const first = await prisma.media.findFirst({ where: toDbWhere(where) })
      if (!first) throw new Error('media not found for update')
      const row = await prisma.media.update({
        where: { id: first.id },
        data: toDbData(data),
      })
      return toRecord(row)
    },

    async delete(_m, where) {
      await prisma.media.deleteMany({ where: toDbWhere(where) })
    },

    transaction: (fn) =>
      prisma.$transaction((tx) => fn(prismaAdapter(tx as PrismaClient))),
  }
}

function parseJson(raw: unknown): Json {
  if (typeof raw !== 'string') return (raw as Json) ?? ({} as Json)
  try {
    return JSON.parse(raw) as Json
  } catch {
    return {} as Json
  }
}

export type { JsonField }
