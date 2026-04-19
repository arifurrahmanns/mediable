import { createRequire } from 'node:module'
import {
  Queue as BullQueue,
  Worker as BullWorker,
  type ConnectionOptions,
  type WorkerOptions,
} from 'bullmq'
import type { EnqueueOptions, Queue } from '../queue/types'

declare const __filename: string | undefined
const requireShim = createRequire(
  typeof __filename !== 'undefined' ? __filename : import.meta.url,
)

export interface BullmqDefaultJobOptions {
  attempts?: number
  backoff?: { type: 'exponential' | 'fixed'; delay: number }
  removeOnComplete?: boolean | number
  removeOnFail?: boolean | number
  /** Default priority applied to every job. Lower = higher priority. 0 = no priority. */
  priority?: number
}

export interface BullmqQueueOptions {
  /**
   * Redis connection. Accepts any of:
   *   - ioredis options: `{ host, port, password, db, tls, family, ... }`
   *   - URL string:     `'redis://:password@host:6379/0'`
   *   - URL string (TLS): `'rediss://:password@host:6380/0'`
   *   - An existing IORedis `Redis` instance (reused by both producer and worker)
   *   - An IORedis `Cluster` instance
   */
  connection: ConnectionOptions | string

  /** Queue name in Redis. Default: `'mediable'`. */
  queueName?: string

  /** Worker concurrency (how many jobs run in parallel in this process). Default: 1. */
  concurrency?: number

  /**
   * Don't start a worker in this process. Use in web servers; run a dedicated
   * worker process that calls `mediable(...)` with the same config (but omit
   * `producerOnly`) to actually drain the queue.
   */
  producerOnly?: boolean

  /** Default job options merged into every enqueue. */
  defaultJobOptions?: BullmqDefaultJobOptions

  /**
   * Advanced worker tuning — passed straight to BullMQ `Worker`.
   * `connection` and `concurrency` here are overridden by the top-level fields.
   */
  workerOptions?: Partial<WorkerOptions>
}

export interface BullmqQueue extends Queue {
  readonly producer: BullQueue
  readonly worker: BullWorker | null
}

export function bullmqQueue(opts: BullmqQueueOptions): BullmqQueue {
  const queueName = opts.queueName ?? 'mediable'
  const connection = resolveConnection(opts.connection)

  const producer = new BullQueue(queueName, {
    connection,
    defaultJobOptions: {
      attempts: opts.defaultJobOptions?.attempts ?? 3,
      backoff: opts.defaultJobOptions?.backoff ?? { type: 'exponential', delay: 1000 },
      removeOnComplete: opts.defaultJobOptions?.removeOnComplete ?? true,
      removeOnFail: opts.defaultJobOptions?.removeOnFail ?? 100,
      ...(opts.defaultJobOptions?.priority !== undefined
        ? { priority: opts.defaultJobOptions.priority }
        : {}),
    },
  })

  const handlers = new Map<string, (payload: any) => Promise<void>>()
  let worker: BullWorker | null = null

  const ensureWorker = () => {
    if (opts.producerOnly) return
    if (worker) return
    worker = new BullWorker(
      queueName,
      async (job) => {
        const handler = handlers.get(job.name)
        if (!handler) return
        await handler(job.data)
      },
      {
        ...opts.workerOptions,
        connection,
        concurrency: opts.concurrency ?? 1,
      },
    )
  }

  const api: BullmqQueue = {
    get producer() {
      return producer
    },
    get worker() {
      return worker
    },

    async enqueue(job, payload, options?: EnqueueOptions) {
      const jobOpts: Record<string, unknown> = {}
      if (options?.delay !== undefined) jobOpts.delay = options.delay
      if (options?.attempts !== undefined) jobOpts.attempts = options.attempts
      if (options?.priority !== undefined && options.priority > 0) {
        jobOpts.priority = options.priority
      }
      await producer.add(job, payload, jobOpts)
    },

    process(job, handler) {
      handlers.set(job, handler as (payload: any) => Promise<void>)
      ensureWorker()
    },

    async close() {
      await Promise.all([producer.close(), worker ? worker.close() : Promise.resolve()])
    },
  }

  return api
}

function resolveConnection(input: ConnectionOptions | string): ConnectionOptions {
  if (typeof input !== 'string') return input
  const ioredis: any = requireShim('ioredis')
  const Redis = ioredis.default ?? ioredis.Redis ?? ioredis
  return new Redis(input)
}
