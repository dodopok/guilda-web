import { type ChildProcess, spawn } from 'node:child_process'
import { e2eEnv } from './env'

// O servidor web (com o banco já preparado) é iniciado pelo Playwright. Aqui sobem o
// trabalhador real e o Estêvão simulado.
const children: ChildProcess[] = []

export default async function globalSetup() {
  const env = { ...process.env, ...e2eEnv() }
  children.push(spawn('npx', ['tsx', 'worker/index.ts'], { env, stdio: 'ignore' }))
  children.push(spawn('npx', ['tsx', 'scripts/estevao-mock.ts'], { env, stdio: 'ignore' }))
  await new Promise((r) => setTimeout(r, 3000))
  return async () => {
    for (const c of children) c.kill('SIGTERM')
  }
}
