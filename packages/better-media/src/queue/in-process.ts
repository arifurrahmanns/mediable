import type { EnqueueOptions, Queue } from './types'

interface Task {
  run: () => Promise<void>
  priority: number
}

export interface InProcessQueueOptions {
  onError?: (job: string, err: unknown) => void
}

export function createInProcessQueue(opts: InProcessQueueOptions = {}): Queue {
  const handlers = new Map<string, (payload: any) => Promise<void>>()
  const tasks: Task[] = []
  let running = false
  let closed = false

  const drain = async () => {
    if (running) return
    running = true
    while (tasks.length > 0) {
      // Lower priority number = higher priority. 0 = no priority (runs after anything with priority).
      tasks.sort(compareTasks)
      const t = tasks.shift()!
      try {
        await t.run()
      } catch (err) {
        opts.onError?.('<task>', err)
      }
    }
    running = false
  }

  return {
    async enqueue(job, payload, options?: EnqueueOptions) {
      if (closed) throw new Error('queue is closed')
      const handler = handlers.get(job)
      if (!handler) {
        opts.onError?.(job, new Error(`no handler registered for job: ${job}`))
        return
      }
      const attempts = options?.attempts ?? 1
      const delay = options?.delay ?? 0
      const priority = options?.priority ?? 0
      const task: Task = {
        priority,
        run: async () => {
          if (delay > 0) await new Promise((r) => setTimeout(r, delay))
          let lastErr: unknown
          for (let i = 0; i < attempts; i++) {
            try {
              await handler(payload)
              return
            } catch (err) {
              lastErr = err
            }
          }
          opts.onError?.(job, lastErr)
        },
      }
      tasks.push(task)
      queueMicrotask(drain)
    },
    process(job, handler) {
      handlers.set(job, handler as (payload: any) => Promise<void>)
    },
    async close() {
      closed = true
      while (running || tasks.length > 0) {
        await new Promise((r) => setTimeout(r, 5))
      }
    },
  }
}

function compareTasks(a: Task, b: Task): number {
  const pa = a.priority
  const pb = b.priority
  // 0 = no priority → runs after anything with priority
  if (pa === 0 && pb === 0) return 0
  if (pa === 0) return 1
  if (pb === 0) return -1
  return pa - pb
}
