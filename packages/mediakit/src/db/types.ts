import type { MediaRecord, MediaSchema } from '../types'

export type CreateInput = Omit<MediaRecord, 'createdAt' | 'updatedAt'>

export interface ListQuery {
  where?: Partial<MediaRecord>
  orderBy?: { field: keyof MediaRecord; dir: 'asc' | 'desc' }[]
  limit?: number
  offset?: number
}

export interface DatabaseAdapter {
  readonly id: string
  create<T extends keyof MediaSchema = 'media'>(
    model: T,
    data: CreateInput,
  ): Promise<MediaSchema[T]>
  findOne<T extends keyof MediaSchema = 'media'>(
    model: T,
    where: Partial<MediaSchema[T]>,
  ): Promise<MediaSchema[T] | null>
  findMany<T extends keyof MediaSchema = 'media'>(
    model: T,
    query: ListQuery,
  ): Promise<MediaSchema[T][]>
  update<T extends keyof MediaSchema = 'media'>(
    model: T,
    where: Partial<MediaSchema[T]>,
    data: Partial<MediaSchema[T]>,
  ): Promise<MediaSchema[T]>
  delete<T extends keyof MediaSchema = 'media'>(
    model: T,
    where: Partial<MediaSchema[T]>,
  ): Promise<void>
  transaction?<R>(fn: (tx: DatabaseAdapter) => Promise<R>): Promise<R>
}
