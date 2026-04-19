export interface EnqueueOptions {
  /** Delay before the job runs, in milliseconds. */
  delay?: number
  /** Retry attempts on failure. */
  attempts?: number
  /**
   * Priority. Lower number = higher priority (BullMQ convention).
   * `0` or omitted = no priority, normal FIFO order.
   * Typical usage: `1` for urgent, `10` for background.
   */
  priority?: number
}

export interface Queue {
  enqueue<T>(job: string, payload: T, opts?: EnqueueOptions): Promise<void>
  process<T>(job: string, handler: (payload: T) => Promise<void>): void
  close(): Promise<void>
}
