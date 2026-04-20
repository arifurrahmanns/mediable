import 'reflect-metadata'
import { mkdirSync } from 'node:fs'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module.js'

mkdirSync('./storage/media', { recursive: true })

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn'],
  })
  const port = Number(process.env.PORT ?? 3000)
  await app.listen(port)
  console.log(`mediable nestjs example listening on http://localhost:${port}`)
}

await bootstrap()
