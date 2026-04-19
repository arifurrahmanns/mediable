import type { Readable } from 'node:stream'

export type ImageFormat = 'jpeg' | 'png' | 'webp' | 'avif'
export type FitMode = 'cover' | 'contain' | 'fill' | 'inside' | 'outside'

export interface FormatOptions {
  quality?: number
  progressive?: boolean
}

export interface ImageOp {
  type:
    | 'width'
    | 'height'
    | 'fit'
    | 'format'
    | 'quality'
    | 'blur'
    | 'sharpen'
    | 'grayscale'
    | 'rotate'
    | 'flip'
    | 'flop'
    | 'crop'
  args: unknown[]
}

export interface ImageBuilder {
  width(w: number): this
  height(h: number): this
  fit(mode: FitMode): this
  format(fmt: ImageFormat, opts?: FormatOptions): this
  quality(q: number): this
  blur(sigma?: number): this
  sharpen(): this
  grayscale(): this
  rotate(deg: number): this
  flip(): this
  flop(): this
  crop(x: number, y: number, w: number, h: number): this
  toBuffer(): Promise<{ data: Buffer; info: { width: number; height: number; format: string; size: number } }>
  toStream(): Readable
}

export interface ImageProcessor {
  open(input: Buffer | Readable): ImageBuilder
  probe(
    input: Buffer | Readable,
  ): Promise<{ width: number; height: number; format: string; hasAlpha: boolean }>
}

export interface ConversionPlan {
  name: string
  ops: ImageOp[]
  queued: boolean
  /** Job priority when queued. Lower = higher priority. 0 = no priority. */
  priority?: number
  outputExt: string
  outputFormat: ImageFormat | null
}

export class PlanCapturingBuilder implements ImageBuilder {
  readonly ops: ImageOp[] = []
  queued = false
  outputExt: string | null = null
  outputFormat: ImageFormat | null = null

  private push(type: ImageOp['type'], ...args: unknown[]): this {
    this.ops.push({ type, args })
    return this
  }

  width(w: number) {
    return this.push('width', w)
  }
  height(h: number) {
    return this.push('height', h)
  }
  fit(mode: FitMode) {
    return this.push('fit', mode)
  }
  format(fmt: ImageFormat, opts?: FormatOptions) {
    this.outputFormat = fmt
    this.outputExt = fmt === 'jpeg' ? 'jpg' : fmt
    return this.push('format', fmt, opts)
  }
  quality(q: number) {
    return this.push('quality', q)
  }
  blur(sigma?: number) {
    return this.push('blur', sigma)
  }
  sharpen() {
    return this.push('sharpen')
  }
  grayscale() {
    return this.push('grayscale')
  }
  rotate(deg: number) {
    return this.push('rotate', deg)
  }
  flip() {
    return this.push('flip')
  }
  flop() {
    return this.push('flop')
  }
  crop(x: number, y: number, w: number, h: number) {
    return this.push('crop', x, y, w, h)
  }
  setQueued(): this {
    this.queued = true
    return this
  }
  toBuffer(): never {
    throw new Error('PlanCapturingBuilder is definition-time only; call executor with ImageProcessor')
  }
  toStream(): never {
    throw new Error('PlanCapturingBuilder is definition-time only; call executor with ImageProcessor')
  }
}
