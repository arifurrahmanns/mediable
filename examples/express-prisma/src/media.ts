import { betterMedia, LocalStorage } from 'better-media'
import { sharpProcessor } from 'better-media/sharp'
import { PrismaClient } from '@prisma/client'
import { prismaAdapter } from './prisma-media-adapter.js'

const prisma = new PrismaClient()

export const media = betterMedia({
  secret: process.env.MEDIA_SECRET ?? 'dev-secret-at-least-16-chars-long',

  database: prismaAdapter(prisma),

  storage: {
    default: 'local',
    disks: {
      local: LocalStorage({
        root: './storage/media',
        publicUrlBase: '/media',
      }),
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
