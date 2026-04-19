import type { MediaRecord } from './types'

export interface MediaEventMap {
  onMediaAdded: { media: MediaRecord }
  onMediaSaving: { media: MediaRecord }
  onMediaDeleting: { media: MediaRecord }
  onMediaDeleted: { media: MediaRecord }
  onConversionsFinished: { media: MediaRecord }
}

export type MediaEventName = keyof MediaEventMap

export type MediaEventHandlers = {
  [K in MediaEventName]?: (payload: MediaEventMap[K]) => void | Promise<void>
}

export interface EventBus {
  emit<K extends MediaEventName>(name: K, payload: MediaEventMap[K]): Promise<void>
}

export function createEventBus(handlers: MediaEventHandlers = {}): EventBus {
  return {
    async emit(name, payload) {
      const handler = handlers[name]
      if (!handler) return
      try {
        await handler(payload as any)
      } catch {
        // events must never throw into the request path
      }
    },
  }
}
