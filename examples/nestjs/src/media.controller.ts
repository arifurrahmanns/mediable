import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import type { Response } from 'express'
import { media } from './media.js'

@Controller()
export class MediaController {
  @Post('users/:id/avatar')
  @UseInterceptors(FileInterceptor('file'))
  async uploadAvatar(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) return { error: 'file field required' }
    return media.addMedia({
      model: { type: 'User', id },
      file,
      collection: 'avatars',
    })
  }

  @Get('users/:id/avatar')
  async getAvatar(@Param('id') id: string) {
    const record = await media.getFirst({ type: 'User', id }, 'avatars')
    if (!record) return { error: 'no avatar' }
    return {
      record,
      // `preview` may still be processing in the queue — fallback is automatic.
      thumbUrl: await media.url(record, 'thumb'),
      previewUrl: await media.url(record, 'preview'),
    }
  }

  @Get('users/:id/avatar/signed')
  async signedUrl(
    @Param('id') id: string,
    @Query('expires') expires?: string,
    @Query('conversion') conversion?: string,
  ) {
    const record = await media.getFirst({ type: 'User', id }, 'avatars')
    if (!record) return { error: 'no avatar' }
    const ttl = Number(expires ?? 300)
    return { url: await media.temporaryUrl(record, ttl, conversion), expiresIn: ttl }
  }

  @Get('products/:id/gallery')
  async productGallery(@Param('id') id: string) {
    return media.list({ type: 'Product', id }, 'gallery')
  }

  @Get('media/:id/stream')
  async stream(
    @Param('id') id: string,
    @Query('conversion') conversion: string | undefined,
    @Res() res: Response,
  ) {
    const record = await media.get(id)
    if (!record) return res.status(404).end()
    const { body, contentType, contentLength } = await media.stream(record, conversion)
    res.setHeader('content-type', contentType)
    if (contentLength) res.setHeader('content-length', String(contentLength))
    body.pipe(res)
  }

  @Delete('media/:id')
  @HttpCode(204)
  async deleteMedia(@Param('id') id: string) {
    const record = await media.get(id)
    if (!record) return
    // YOUR authorization goes here.
    await media.delete(record.id)
  }

  @Post('media/:id/regenerate')
  async regenerate(@Param('id') id: string) {
    await media.regenerateConversions(id)
    return { ok: true }
  }

  @Get('signed/:token')
  async signedTerminator(@Param('token') token: string, @Res() res: Response) {
    const verified = await media.verifySignedToken(token)
    if (!verified) return res.status(403).end()
    const { body, contentType, contentLength } = await media.stream(verified.media)
    res.setHeader('content-type', contentType)
    if (contentLength) res.setHeader('content-length', String(contentLength))
    body.pipe(res)
  }
}
