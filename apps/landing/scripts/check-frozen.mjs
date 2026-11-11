// Frozen marketing artifacts. Trackaton analytics, the sitemap and robots.txt are
// owned outside this app's copy work; the PR that changes them must update these
// hashes deliberately and say so in its review notes.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const expected = {
  trackatonQueue: 'c83d197889dd74532c6d710097fe6e1f94236a3c17741e3420347c0eb5b698b2',
  trackatonTag: 'eed966c25b92ef646ee1111c178db5430322ba2136349c2ec206eddcf036f199',
  sitemap: 'eaa0cadff578c8bdc2bc797c5346904ee02a80a6b7d08eb8faaa4db3d9051fda',
  robots: 'a783ab1141f6f2223ea4705d158044253e58d9535289e18ba9469bd906e42bea',
}

const sha = (value) => createHash('sha256').update(value).digest('hex')

const html = readFileSync(resolve(root, 'index.html'), 'utf8')
const queue = html.match(/<script>\s*window\.trackaton[\s\S]*?<\/script>/)
const tag = html.match(/<script\s+src="https:\/\/trackaton\.com\/track\.js"[\s\S]*?<\/script>/)

if (!queue || !tag) {
  throw new Error('index.html no longer contains the Trackaton queue script and track.js tag')
}

const actual = {
  trackatonQueue: sha(queue[0]),
  trackatonTag: sha(tag[0]),
  sitemap: sha(readFileSync(resolve(root, 'public/sitemap.xml'), 'utf8')),
  robots: sha(readFileSync(resolve(root, 'public/robots.txt'), 'utf8')),
}

let failed = false
for (const [name, digest] of Object.entries(expected)) {
  if (actual[name] !== digest) {
    failed = true
    console.error(`changed: ${name}\n  expected ${digest}\n  actual   ${actual[name]}`)
  }
}

if (failed) {
  console.error('Frozen landing artifacts changed. Do not edit them in a copy-only change.')
  process.exit(1)
}

console.log('Frozen landing artifacts unchanged (Trackaton snippet, sitemap.xml, robots.txt).')
