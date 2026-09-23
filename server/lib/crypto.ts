import { createCipheriv, createDecipheriv, createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { getConfig } from '../config'

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function scrypt(password: string, salt: Buffer, keylen: number, N: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keylen, { N, r: 8, p: 1, maxmem: 256 * N * 8 }, (err, key) => {
      if (err) reject(err)
      else resolve(key)
    })
  })
}

// Formato: scrypt$<log2N>$<salt b64>$<hash b64>. Os parâmetros ficam no hash para
// permitir aumentar o custo depois sem invalidar senhas existentes.
export async function hashPassword(password: string): Promise<string> {
  const log2n = getConfig().scryptLog2N
  const salt = randomBytes(16)
  const key = await scrypt(password.normalize('NFKC'), salt, 32, 2 ** log2n)
  return `scrypt$${log2n}$${salt.toString('base64')}$${key.toString('base64')}`
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false
  const [algo, log2nRaw, saltB64, hashB64] = stored.split('$')
  if (algo !== 'scrypt' || !log2nRaw || !saltB64 || !hashB64) return false
  const expected = Buffer.from(hashB64, 'base64')
  const key = await scrypt(password.normalize('NFKC'), Buffer.from(saltB64, 'base64'), expected.length, 2 ** Number(log2nRaw))
  return key.length === expected.length && timingSafeEqual(key, expected)
}

// Hash usado quando a conta não existe, para que o tempo de resposta não revele contas.
let dummyHash: string | undefined
export async function burnPasswordCheck(password: string) {
  dummyHash ??= await hashPassword('guilda-dummy-password')
  await verifyPassword(password, dummyHash)
}

function encryptionKey(): Buffer {
  const raw = getConfig().secretsEncryptionKey
  const key = Buffer.from(raw, 'base64')
  if (key.length !== 32) {
    throw new Error('SECRETS_ENCRYPTION_KEY precisa ter 32 bytes em base64 para guardar segredos.')
  }
  return key
}

export function hasEncryptionKey(): boolean {
  try {
    encryptionKey()
    return true
  } catch {
    return false
  }
}

// AES-256-GCM: v1.<iv>.<tag>.<ciphertext>
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.')
}

export function decryptSecret(value: string): string {
  const [version, iv, tag, data] = value.split('.')
  if (version !== 'v1' || !iv || !tag || !data) throw new Error('Segredo cifrado em formato desconhecido.')
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8')
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}
