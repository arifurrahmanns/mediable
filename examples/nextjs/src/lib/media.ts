import { mediable, LocalStorage } from 'mediable'
import { sharpProcessor } from 'mediable/sharp'
import { s3Storage } from 'mediable/s3'

const hasS3 = !!process.env.S3_BUCKET

export const media = mediable({
  secret: process.env.MEDIA_SECRET ?? 'dev-secret-at-least-16-chars-long',

  // Postgres by default. Swap for any of:
  //   { provider: 'sqlite',  connection: { filename: './storage/media.db' }, autoMigrate: true }
  //   { provider: 'mysql',   connection: { url: process.env.DATABASE_URL! }, autoMigrate: true }
  //   { provider: 'mongodb', connection: { url: process.env.MONGO_URL! } }
  database: {
    provider: 'postgres',
    connection: {
      url:
        process.env.DATABASE_URL ??
        'postgresql://postgres:postgres@localhost:5432/mediable',
    },
    autoMigrate: true,
  },

  storage: {
    default: hasS3 ? 's3' : 'local',
    disks: {
      local: LocalStorage({
        root: './storage/media',
        publicUrlBase: '/media',
      }),
      ...(hasS3
        ? {
            s3: s3Storage({
              bucket: process.env.S3_BUCKET!,
              region: process.env.S3_REGION ?? 'auto',
              endpoint: process.env.S3_ENDPOINT,
              forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
              credentials: {
                accessKeyId: process.env.S3_ACCESS_KEY!,
                secretAccessKey: process.env.S3_SECRET_KEY!,
              },
              publicUrlBase: process.env.S3_PUBLIC_URL_BASE,
            }),
          }
        : {}),
    },
  },

  image: sharpProcessor(),

  owners: {
    User: ({ collection }) => {
      collection('avatars')
        .singleFile()
        .accepts('image/*')
        .maxSize('5MB')
        .convert('thumb', (i) => i.width(96).height(96).fit('cover').format('webp'))
        .convert('preview', (i) => i.width(1920).format('webp'), {
          queued: true,
          priority: 10,
        })

      collection('documents').accepts('application/pdf').maxFiles(20)
    },

    Product: ({ collection, convert }) => {
      collection('gallery').accepts('image/*').maxFiles(8)
      convert('card', (i) => i.width(640).fit('inside').format('webp')).performOn('gallery')
    },

    '*': ({ convert }) => {
      convert('thumb', (i) => i.width(128).height(128).fit('cover').format('webp'))
    },
  },

  events: {
    onMediaAdded: async ({ media }) =>
      console.log(`[media] added ${media.uuid} (${media.collectionName})`),
    onConversionsFinished: async ({ media }) =>
      console.log(`[media] conversions done ${media.uuid}`),
  },
})
