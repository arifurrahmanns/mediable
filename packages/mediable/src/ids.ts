import { customAlphabet } from 'nanoid'

const ALPHA = '0123456789abcdefghijklmnopqrstuvwxyz'

const mediaIdGen = customAlphabet(ALPHA, 24)
const uuidGen = customAlphabet(ALPHA, 32)

export function newMediaId(): string {
  const now = Date.now().toString(36).padStart(8, '0')
  return `${now}${mediaIdGen().slice(0, 16)}`
}

export function newUuid(): string {
  return uuidGen()
}
