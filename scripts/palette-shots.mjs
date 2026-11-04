// Local palette screenshot pass. Postgres and Typesense come from
// `docker compose run --rm` and are removed when this process exits.
// Refuses any host that is not loopback. Never points at demo or production.

import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

const root = fileURLToPath(new URL('..', import.meta.url))
const webUrl = process.env.BRAIAN_WEB_URL || 'http://127.0.0.1:3011'
const apiPort = process.env.BRAIAN_SHOTS_API_PORT || '8096'
const shotDir = process.env.PALETTE_SHOTS_DIR || '/opt/cursor/artifacts/screenshots'

function assertLoopback(url) {
  const host = new URL(url).hostname
  if (host !== '127.0.0.1' && host !== 'localhost') {
    console.error(`refusing non-local web url ${url}`)
    process.exit(1)
  }
  if (/demo\.braian\.io|prod/i.test(url)) {
    console.error(`refusing demo or prod url ${url}`)
    process.exit(1)
  }
}

assertLoopback(webUrl)
const webPort = new URL(webUrl).port || '80'

const binary = process.env.BRAIAN_BIN || `${root}/target/debug/braian`
if (!existsSync(binary)) {
  console.error(`braian binary missing at ${binary}. Build with: cargo build -p braian-server`)
  process.exit(1)
}

const pgName = 'braian-palette-pg'
const tsName = 'braian-palette-ts'
const db = 'braian_palette_shots'
const children = []

function docker(args, opts = {}) {
  const result = spawnSync('sudo', ['docker', ...args], { cwd: root, encoding: 'utf8', ...opts })
  return result
}

function composeRun(name, service) {
  docker(['rm', '-f', name])
  const result = docker([
    'compose',
    'run',
    '--rm',
    '-d',
    '--name',
    name,
    '--service-ports',
    service,
  ])
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout)
    throw new Error(`docker compose run ${service} failed`)
  }
  console.log(result.stdout.trim())
}

async function waitFor(url) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // still starting
    }
    await delay(1000)
  }
  throw new Error(`timed out waiting for ${url}`)
}

function spawnLogged(command, args, env) {
  const child = spawn(command, args, { cwd: root, env, stdio: 'inherit' })
  children.push(child)
  return child
}

function stopChildren() {
  for (const child of children) {
    if (child.exitCode === null && !child.killed) child.kill('SIGTERM')
  }
}

function removeContainers() {
  docker(['rm', '-f', pgName, tsName])
}

process.on('SIGINT', () => {
  stopChildren()
  removeContainers()
  process.exit(1)
})

composeRun(pgName, 'postgres')
composeRun(tsName, 'typesense')

let ready = false
for (let attempt = 0; attempt < 60; attempt += 1) {
  const result = docker(['exec', pgName, 'pg_isready', '-U', 'braian', '-d', 'postgres'])
  if (result.status === 0) {
    ready = true
    break
  }
  await delay(1000)
}
if (!ready) {
  removeContainers()
  throw new Error('postgres did not become ready')
}

docker(['exec', pgName, 'psql', '-U', 'braian', '-d', 'postgres', '-c', `DROP DATABASE IF EXISTS ${db} WITH (FORCE)`])
const created = docker(['exec', pgName, 'psql', '-U', 'braian', '-d', 'postgres', '-c', `CREATE DATABASE ${db}`])
if (created.status !== 0) {
  console.error(created.stderr)
  removeContainers()
  throw new Error('could not create the screenshot database')
}

await waitFor('http://127.0.0.1:8108/health')

const apiEnv = {
  ...process.env,
  DATABASE_URL: `postgres://braian:byt-mig@127.0.0.1:5433/${db}`,
  TYPESENSE_URL: 'http://127.0.0.1:8108',
  TYPESENSE_API_KEY: process.env.TYPESENSE_API_KEY || 'byt-mig-typesense',
  BRAIAN_SEARCH_ALIAS: 'braian_palette_shots',
  BRAIAN_API_ADDR: `127.0.0.1:${apiPort}`,
  BRAIAN_SEED_COUNT: '80',
  BRAIAN_AGENT_MOCK: '1',
  BRAIAN_E2E: '1',
  BRAIAN_DEMO_EMAIL: 'admin@braian.local',
  BRAIAN_DEMO_PASSWORD: 'braian-demo',
  BRAIAN_DEMO_TOKEN: 'braian-demo-token',
}
delete apiEnv.KAFKA_BROKERS

const api = spawnLogged(binary, ['all'], apiEnv)
const web = spawnLogged(
  'pnpm',
  ['--dir', 'apps/web', 'exec', 'vite', 'dev', '--host', '127.0.0.1', '--port', webPort, '--strictPort'],
  { ...process.env, BRAIAN_API_PROXY: `http://127.0.0.1:${apiPort}` },
)

let code = 1
try {
  await waitFor(`http://127.0.0.1:${apiPort}/healthz`)
  await waitFor(webUrl)
  await new Promise((resolve, reject) => {
    const child = spawn(
      'pnpm',
      ['--dir', 'apps/web', 'exec', 'playwright', 'test', 'e2e/palette-shots.spec.ts'],
      {
        cwd: root,
        stdio: 'inherit',
        env: {
          ...process.env,
          BRAIAN_WEB_URL: webUrl,
          BRAIAN_DEMO_EMAIL: 'admin@braian.local',
          BRAIAN_DEMO_PASSWORD: 'braian-demo',
          PALETTE_SHOTS_DIR: shotDir,
        },
      },
    )
    children.push(child)
    child.on('error', reject)
    child.on('exit', (status) => resolve(status ?? 1))
  }).then((status) => {
    code = status
  })
} finally {
  if (api.exitCode === null) api.kill('SIGTERM')
  if (web.exitCode === null) web.kill('SIGTERM')
  await delay(400)
  removeContainers()
}

process.exit(code)
