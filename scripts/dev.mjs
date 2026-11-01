// Starts the API (migrations, seed, indexer) and the web app.
// Backend rebuilds on Rust changes when cargo-watch is installed (see docs/dev.md).
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const isWin = process.platform === 'win32'
const children = []

function loadEnvFile() {
  const envFile = path.join(root, '.env')
  if (!existsSync(envFile)) return
  for (const raw of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (line.length === 0 || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq < 1) continue
    const name = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    const quoted =
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    if (quoted) value = value.slice(1, -1)
    if (process.env[name] === undefined) process.env[name] = value
  }
}

function spawnDev(name, command, args, { stopAllOnExit = false, shell = false } = {}) {
  const child = spawn(command, args, {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
    shell,
  })

  children.push({ name, child })
  child.on('error', (err) => {
    console.error(`[${name}] failed to start: ${err.message}`)
    if (stopAllOnExit) stop(1)
  })
  child.on('exit', (code, signal) => {
    if (signal) return
    if (code && code !== 0) {
      console.error(`[${name}] exited with code ${code}`)
      if (stopAllOnExit) stop(code)
      else console.error(`[${name}] other dev processes keep running (Ctrl+C to stop all)`)
    }
  })
}

function hasCargoWatch() {
  const r = spawnSync('cargo', ['watch', '--version'], {
    cwd: root,
    shell: false,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  return r.status === 0
}

function backendCargoArgs(useWatch) {
  const runArgs = ['run', '-p', 'braian-server', '--', 'all']
  if (!useWatch) return runArgs
  // `-x` runs `cargo …`. Trailing `-- run …` would execute `run.exe`, not cargo (see cargo-watch docs).
  return [
    'watch',
    '--use-shell=cmd',
    '-d',
    '1',
    '-w',
    'crates',
    '-w',
    'Cargo.toml',
    '-w',
    'Cargo.lock',
    '-x',
    'run -p braian-server -- all',
  ]
}

function stop(code = 0) {
  for (const { child } of children) {
    if (!child.killed) child.kill('SIGTERM')
  }
  setTimeout(() => process.exit(code), 200)
}

process.on('SIGINT', () => stop(0))
process.on('SIGTERM', () => stop(0))

loadEnvFile()

const useCargoWatch =
  process.env.BRAIAN_DEV_NO_WATCH !== '1' && hasCargoWatch()
if (process.env.BRAIAN_DEV_NO_WATCH !== '1' && !useCargoWatch) {
  console.warn(
    'cargo-watch not found; backend will not rebuild on save. Install with: cargo install cargo-watch',
  )
  console.warn('Or set BRAIAN_DEV_NO_WATCH=1 to hide this message.')
}

console.log('Braian API on http://127.0.0.1:8090 and web on http://127.0.0.1:3000')
console.log('Demo login: BRAIAN_DEMO_EMAIL and BRAIAN_DEMO_PASSWORD in .env (see .env.example)')
if (useCargoWatch) {
  console.log('Backend: cargo watch (save a .rs file to rebuild; BRAIAN_DEV_NO_WATCH=1 to disable)')
}

// Pass argv directly to cargo.exe — wrapping in cmd.exe breaks `-x` quoting on Windows.
spawnDev('backend', 'cargo', backendCargoArgs(useCargoWatch), { stopAllOnExit: false })

spawnDev(
  'web',
  'pnpm',
  ['--dir', 'apps/web', 'exec', 'vite', 'dev', '--host', '127.0.0.1', '--port', '3000'],
  { stopAllOnExit: true, shell: isWin },
)
