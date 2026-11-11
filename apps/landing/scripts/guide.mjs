import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

export const GUIDE_PAGES = [
  {
    source: 'index.md',
    slug: '',
    path: '/docs/',
    title: 'Braian user guide',
    nav: 'Overview',
    description: 'A user guide to the Braian web app: getting started, workspaces, object types, data sources, and shortcuts.',
  },
  {
    source: 'getting-started.md',
    slug: 'getting-started',
    path: '/docs/getting-started',
    title: 'Getting started',
    nav: 'Getting started',
    description: 'Sign in to Braian, meet the first screen, and open your first object.',
  },
  {
    source: 'workspaces-and-panels.md',
    slug: 'workspaces-and-panels',
    path: '/docs/workspaces-and-panels',
    title: 'Workspaces & panels',
    nav: 'Workspaces & panels',
    description: 'Switch workspaces, arrange panes and view tabs, and save the layout in Braian.',
  },
  {
    source: 'object-types-and-relations.md',
    slug: 'object-types-and-relations',
    path: '/docs/object-types-and-relations',
    title: 'Object types & relations',
    nav: 'Object types & relations',
    description: 'Build structures, object types, attributes, and link types in Braian.',
  },
  {
    source: 'data-sources.md',
    slug: 'data-sources',
    path: '/docs/data-sources',
    title: 'Data sources',
    nav: 'Data sources',
    description: 'Use all-of-type and peer table sources, switch catalogs, import files, and save selections in Braian.',
  },
  {
    source: 'command-palette-and-shortcuts.md',
    slug: 'command-palette-and-shortcuts',
    path: '/docs/command-palette-and-shortcuts',
    title: 'Command palette & shortcuts',
    nav: 'Command palette & shortcuts',
    description: 'Open the Braian command palette and use the keyboard shortcuts.',
  },
]

export const GUIDE_DIR = 'docs/guide'

const guideSourceDir = (root) => resolve(root, '..', '..', GUIDE_DIR)

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const slugify = (value) =>
  value
    .toLowerCase()
    .replace(/`/g, '')
    .replace(/&amp;/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

function inline(text) {
  let html = escapeHtml(text)
  html = html.replace(/`([^`]+)`/g, (_match, code) => `<code>${code}</code>`)
  html = html.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_match, label, href) => {
    const target = href.replace(/&amp;/g, '&')
    return `<a href="${escapeHtml(target)}">${label}</a>`
  })
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  return html
}

function splitRow(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())
}

function isTableSeparator(line) {
  return /^\s*\|?[\s:|-]+\|?\s*$/.test(line) && line.includes('-')
}

function isBlockStart(line) {
  return (
    /^#{1,6}\s+/.test(line) ||
    /^```/.test(line) ||
    /^>\s?/.test(line) ||
    /^[-*]\s+/.test(line) ||
    /^\d+\.\s+/.test(line) ||
    /^---+$/.test(line.trim())
  )
}

function collectList(lines, start, pattern) {
  const items = []
  let index = start
  while (index < lines.length) {
    const match = lines[index].match(pattern)
    if (match) {
      items.push(match[1].trim())
      index += 1
      continue
    }
    const line = lines[index]
    if (items.length > 0 && line.trim() !== '' && /^\s{2,}/.test(line) && !isBlockStart(line.trim())) {
      items[items.length - 1] += ` ${line.trim()}`
      index += 1
      continue
    }
    break
  }
  return { items, index }
}

export function renderMarkdown(markdown) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const html = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]

    if (line.trim() === '') {
      index += 1
      continue
    }

    if (/^```/.test(line)) {
      const language = line.slice(3).trim()
      index += 1
      const code = []
      while (index < lines.length && !/^```/.test(lines[index])) {
        code.push(lines[index])
        index += 1
      }
      index += 1
      const className = language ? ` class="language-${escapeHtml(language)}"` : ''
      html.push(`<pre><code${className}>${escapeHtml(code.join('\n'))}</code></pre>`)
      continue
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/)
    if (heading) {
      const level = heading[1].length
      const text = heading[2].trim()
      html.push(`<h${level} id="${slugify(text)}">${inline(text)}</h${level}>`)
      index += 1
      continue
    }

    if (/^---+$/.test(line.trim())) {
      html.push('<hr />')
      index += 1
      continue
    }

    if (/^>\s?/.test(line)) {
      const quote = []
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quote.push(lines[index].replace(/^>\s?/, ''))
        index += 1
      }
      html.push(`<blockquote><p>${inline(quote.join(' '))}</p></blockquote>`)
      continue
    }

    if (line.includes('|') && index + 1 < lines.length && isTableSeparator(lines[index + 1])) {
      const headers = splitRow(line)
      index += 2
      const rows = []
      while (index < lines.length && lines[index].includes('|') && lines[index].trim() !== '') {
        rows.push(splitRow(lines[index]))
        index += 1
      }
      const head = headers.map((cell) => `<th>${inline(cell)}</th>`).join('')
      const body = rows
        .map((row) => `<tr>${row.map((cell) => `<td>${inline(cell)}</td>`).join('')}</tr>`)
        .join('')
      html.push(
        `<div class="guide-table"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`,
      )
      continue
    }

    if (/^[-*]\s+/.test(line)) {
      const { items, index: next } = collectList(lines, index, /^[-*]\s+(.*)$/)
      html.push(`<ul>${items.map((item) => `<li>${inline(item)}</li>`).join('')}</ul>`)
      index = next
      continue
    }

    if (/^\d+\.\s+/.test(line)) {
      const { items, index: next } = collectList(lines, index, /^\d+\.\s+(.*)$/)
      html.push(`<ol>${items.map((item) => `<li>${inline(item)}</li>`).join('')}</ol>`)
      index = next
      continue
    }

    const paragraph = [line.trim()]
    index += 1
    while (
      index < lines.length &&
      lines[index].trim() !== '' &&
      !isBlockStart(lines[index]) &&
      !(lines[index].includes('|') && index + 1 < lines.length && isTableSeparator(lines[index + 1]))
    ) {
      paragraph.push(lines[index].trim())
      index += 1
    }
    html.push(`<p>${inline(paragraph.join(' '))}</p>`)
  }

  return html.join('\n')
}

function setMeta(html, attribute, name, value) {
  const pattern = new RegExp(`(<meta\\s+${attribute}="${name}"\\s+content=")[^"]*(")`)
  return html.replace(pattern, (_match, before, after) => `${before}${escapeHtml(value)}${after}`)
}

function pageHtml(template, page) {
  const navigation = GUIDE_PAGES.map((item) => {
    const current = item.source === page.source ? ' aria-current="page"' : ''
    return `<a href="${item.path}"${current}>${escapeHtml(item.nav)}</a>`
  }).join('')

  const stable = page.slug ? `/docs/${page.slug}` : '/docs/'
  const canonical = `https://braian.io${stable}`

  let html = template
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(page.title)} — Braian docs</title>`)
  html = setMeta(html, 'name', 'description', page.description)
  html = html.replace(
    /<link rel="canonical" href="[^"]*" \/>/,
    `<link rel="canonical" href="${canonical}" />`,
  )
  html = setMeta(html, 'property', 'og:url', canonical)
  html = setMeta(html, 'property', 'og:title', `${page.title} — Braian docs`)
  html = setMeta(html, 'property', 'og:description', page.description)
  html = setMeta(html, 'name', 'twitter:title', `${page.title} — Braian docs`)
  html = setMeta(html, 'name', 'twitter:description', page.description)
  html = html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>\s*/, '')
  html = html.replace(/<script type="module"[^>]*src="\/assets\/[^"]*"[^>]*><\/script>\s*/, '')
  html = html.replace(
    '<div id="root"></div>',
    `<div class="wrap guide-wrap">
  <header class="topbar">
    <a class="brand" href="/">Braian</a>
    <nav class="section-nav" aria-label="Sections">
      <a class="nav-link" href="/">Home</a>
      <a class="nav-link" href="/docs/">Docs</a>
      <a class="nav-link" href="https://github.com/braian-io/braian">GitHub</a>
    </nav>
    <div class="spacer"></div>
    <a class="btn btn-primary" href="https://demo.braian.io">Try the demo</a>
  </header>
  <div class="guide-layout">
    <aside class="guide-sidebar">
      <p class="guide-sidebar-title">Guide</p>
      <nav class="guide-nav" aria-label="Guide pages">${navigation}</nav>
    </aside>
    <main id="content" class="guide-main">
      <article class="guide-article">{{GUIDE_BODY}}</article>
    </main>
  </div>
  <footer class="footer">
    <div class="footer-brand">
      <div class="brand">Braian</div>
      <p>Open-source product data. Self-hosted. Apache-2.0.</p>
    </div>
    <nav class="footer-links" aria-label="Footer">
      <a href="https://demo.braian.io">Demo</a>
      <a href="https://github.com/braian-io/braian">GitHub</a>
      <a href="/docs/">Documentation</a>
      <a href="https://github.com/braian-io/braian/blob/main/LICENSE">Apache-2.0</a>
    </nav>
  </footer>
</div>`,
  )

  return { html, marker: '{{GUIDE_BODY}}' }
}

function writePage(root, page, html) {
  const targets = [resolve(root, 'dist/docs', page.slug ? `${page.slug}/index.html` : 'index.html')]
  if (page.slug) targets.push(resolve(root, 'dist/docs', `${page.slug}.html`))
  for (const target of targets) {
    mkdirSync(resolve(target, '..'), { recursive: true })
    writeFileSync(target, html)
  }
  return targets
}

export function checkGuideSources(root) {
  const dir = guideSourceDir(root)
  if (!existsSync(dir)) throw new Error(`guide sources are missing at ${GUIDE_DIR}`)
  const found = readdirSync(dir)
    .filter((name) => name.endsWith('.md'))
    .sort()
  const expected = GUIDE_PAGES.map((page) => page.source).sort()
  if (found.join(',') !== expected.join(',')) {
    throw new Error(
      `guide sources do not match the required pages. Found ${found.join(', ') || 'none'}; expected ${expected.join(', ')}`,
    )
  }
  for (const page of GUIDE_PAGES) {
    const source = readFileSync(resolve(dir, page.source), 'utf8')
    const firstHeading = source.match(/^#\s+(.*)$/m)?.[1]?.trim()
    if (!firstHeading) throw new Error(`${page.source} must start with a level-one heading`)
    if (firstHeading !== page.title) {
      throw new Error(`${page.source} heading "${firstHeading}" does not match "${page.title}"`)
    }
  }
}

function guideOutput(root, page) {
  return resolve(root, 'dist/docs', page.slug ? `${page.slug}/index.html` : 'index.html')
}

export function buildGuide(root, template) {
  checkGuideSources(root)

  for (const page of GUIDE_PAGES) {
    const markdown = readFileSync(resolve(guideSourceDir(root), page.source), 'utf8')
    const body = renderMarkdown(markdown)
    const { html, marker } = pageHtml(template, page)
    const pageMarkup = html.replace(marker, body)
    writePage(root, page, pageMarkup)
  }

  for (const page of GUIDE_PAGES) {
    const output = guideOutput(root, page)
    if (!existsSync(output)) throw new Error(`missing built guide page ${output}`)
    const built = readFileSync(output, 'utf8')
    const heading = `<h1 id="${slugify(page.title)}">`
    if (!built.includes(heading)) {
      throw new Error(`built guide page ${output} is missing its heading "${page.title}"`)
    }
    if (!built.includes(page.path) && page.slug) {
      throw new Error(`built guide page ${output} does not reference its own path ${page.path}`)
    }
  }

  const builtPages = new Set(GUIDE_PAGES.map((page) => (page.slug ? `/docs/${page.slug}` : '/docs')))
  for (const page of GUIDE_PAGES) {
    const built = readFileSync(guideOutput(root, page), 'utf8')
    for (const match of built.matchAll(/href="(\/docs[^"#?]*)/g)) {
      const target = match[1].replace(/\/+$/, '') || '/docs'
      if (!builtPages.has(target)) {
        throw new Error(`guide link ${match[1]} on ${page.source} does not resolve to a built page`)
      }
    }
  }

  const index = readFileSync(guideOutput(root, GUIDE_PAGES[0]), 'utf8')
  for (const page of GUIDE_PAGES.slice(1)) {
    if (!index.includes(`href="${page.path}"`)) {
      throw new Error(`the guide index does not link to ${page.path}`)
    }
  }

  return { pages: GUIDE_PAGES.map((page) => guideOutput(root, page)) }
}
