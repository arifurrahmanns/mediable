import { createRequire } from 'node:module'
import { Readable } from 'node:stream'
import type {
  FitMode,
  FormatOptions,
  ImageBuilder,
  ImageFormat,
  ImageProcessor,
} from '../image/types'

declare const __filename: string | undefined
const requireShim = createRequire(
  typeof __filename !== 'undefined' ? __filename : import.meta.url,
)

export interface SharpProcessorOptions {
  failOn?: 'none' | 'truncated' | 'error' | 'warning'
  limitInputPixels?: number | boolean
}

export function sharpProcessor(opts: SharpProcessorOptions = {}): ImageProcessor {
  let sharpLib: any
  const getSharp = (): any => {
    if (!sharpLib) sharpLib = requireShim('sharp')
    return sharpLib
  }

  const createBuilder = (input: Buffer | Readable): ImageBuilder => {
    const sharp = getSharp()
    let pipeline = sharp(input instanceof Readable ? undefined : input, {
      failOn: opts.failOn ?? 'none',
      limitInputPixels: opts.limitInputPixels ?? 268402689,
    })
    if (input instanceof Readable) {
      input.pipe(pipeline)
    }

    const resize: { width?: number; height?: number; fit?: FitMode } = {}
    let currentFormat: ImageFormat | null = null
    let formatOpts: FormatOptions | undefined
    let currentQuality: number | undefined

    const flushResize = () => {
      if (resize.width !== undefined || resize.height !== undefined) {
        pipeline = pipeline.resize({
          width: resize.width,
          height: resize.height,
          fit: resize.fit ?? 'cover',
        })
        resize.width = undefined
        resize.height = undefined
        resize.fit = undefined
      }
    }

    const applyFormat = () => {
      if (!currentFormat) return
      const formatToUse = currentFormat
      const o: Record<string, unknown> = { ...formatOpts }
      if (currentQuality !== undefined) o.quality = currentQuality
      pipeline = pipeline.toFormat(formatToUse, o)
    }

    const builder: ImageBuilder = {
      width(w) {
        resize.width = w
        return builder
      },
      height(h) {
        resize.height = h
        return builder
      },
      fit(mode) {
        resize.fit = mode
        return builder
      },
      format(fmt, o) {
        currentFormat = fmt
        formatOpts = o
        return builder
      },
      quality(q) {
        currentQuality = q
        return builder
      },
      blur(sigma) {
        flushResize()
        pipeline = pipeline.blur(sigma ?? undefined)
        return builder
      },
      sharpen() {
        flushResize()
        pipeline = pipeline.sharpen()
        return builder
      },
      grayscale() {
        flushResize()
        pipeline = pipeline.grayscale()
        return builder
      },
      rotate(deg) {
        flushResize()
        pipeline = pipeline.rotate(deg)
        return builder
      },
      flip() {
        flushResize()
        pipeline = pipeline.flip()
        return builder
      },
      flop() {
        flushResize()
        pipeline = pipeline.flop()
        return builder
      },
      crop(x, y, w, h) {
        flushResize()
        pipeline = pipeline.extract({ left: x, top: y, width: w, height: h })
        return builder
      },
      async toBuffer() {
        flushResize()
        applyFormat()
        const { data, info } = await pipeline.toBuffer({ resolveWithObject: true })
        return { data, info: { width: info.width, height: info.height, format: info.format, size: info.size } }
      },
      toStream() {
        flushResize()
        applyFormat()
        return pipeline
      },
    }
    return builder
  }

  return {
    open(input) {
      return createBuilder(input)
    },
    async probe(input) {
      const sharp = getSharp()
      const pipeline = sharp(input instanceof Readable ? undefined : input)
      if (input instanceof Readable) input.pipe(pipeline)
      const meta = await pipeline.metadata()
      return {
        width: meta.width ?? 0,
        height: meta.height ?? 0,
        format: meta.format ?? 'unknown',
        hasAlpha: Boolean(meta.hasAlpha),
      }
    },
  }
}
