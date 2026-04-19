import type { MediaRecord, OwnerRef } from '../types'
import type { DatabaseAdapter } from './types'

export class MediaRepository {
  constructor(private readonly db: DatabaseAdapter) {}

  create(data: Parameters<DatabaseAdapter['create']>[1]): Promise<MediaRecord> {
    return this.db.create('media', data)
  }

  findByUuid(uuid: string): Promise<MediaRecord | null> {
    return this.db.findOne('media', { uuid })
  }

  findById(id: string): Promise<MediaRecord | null> {
    return this.db.findOne('media', { id })
  }

  async findByOwner(owner: OwnerRef, collection?: string): Promise<MediaRecord[]> {
    const where: Partial<MediaRecord> = {
      modelType: owner.type,
      modelId: String(owner.id),
    }
    if (collection) where.collectionName = collection
    return this.db.findMany('media', {
      where,
      orderBy: [{ field: 'orderColumn', dir: 'asc' }, { field: 'createdAt', dir: 'asc' }],
    })
  }

  async findFirst(owner: OwnerRef, collection?: string): Promise<MediaRecord | null> {
    const list = await this.findByOwner(owner, collection)
    return list[0] ?? null
  }

  async nextOrderColumn(owner: OwnerRef, collection: string): Promise<number> {
    const list = await this.db.findMany('media', {
      where: {
        modelType: owner.type,
        modelId: String(owner.id),
        collectionName: collection,
      },
      orderBy: [{ field: 'orderColumn', dir: 'desc' }],
      limit: 1,
    })
    if (list.length === 0) return 0
    return (list[0]!.orderColumn ?? 0) + 1
  }

  update(id: string, patch: Partial<MediaRecord>): Promise<MediaRecord> {
    return this.db.update('media', { id }, patch)
  }

  async delete(id: string): Promise<void> {
    await this.db.delete('media', { id })
  }

  async findOrphans(olderThan: Date): Promise<MediaRecord[]> {
    const rows = await this.db.findMany('media', {
      where: { status: 'pending' },
      orderBy: [{ field: 'createdAt', dir: 'asc' }],
    })
    return rows.filter((r) => r.createdAt < olderThan)
  }
}
