export const demoUrl = 'https://demo.braian.io'
export const repoUrl = 'https://github.com/braian-io/braian'
export const licenseUrl = 'https://github.com/braian-io/braian/blob/main/LICENSE'
export const docsUrl = 'https://github.com/braian-io/braian/tree/main/docs/guide'

export const nav = [
  { href: '#workspaces', label: 'Workspaces' },
  { href: '#model', label: 'Model' },
  { href: '#sources', label: 'Sources' },
  { href: '#graph', label: 'Graph' },
  { href: '#agent', label: 'Agent' },
  { href: '#delete', label: 'Delete' },
  { href: '#architecture', label: 'Architecture' },
  { href: '#performance', label: 'Performance' },
  { href: '#open-source', label: 'Open source' },
] as const

export const hero = {
  eyebrow: 'Open-source product data · Apache-2.0 · Self-hosted',
  title: 'Open-source PIM where',
  titleAccent: 'every click is instant.',
  lede: 'A system that understands you, and keeps making your work easier.',
  proof: [
    { value: '64 ms', label: 'save to searchable, p50' },
    { value: '20 ms', label: 'save to every open session, p50' },
  ],
  caption: 'Demo workspace',
} as const

export const workspaces = {
  eyebrow: 'For the people in the catalog',
  title: 'One workspace per job',
  lede: 'Tiled panels, instant navigation, and the whole catalog in reach.',
  points: [
    {
      title: 'Panels, not windows',
      body: 'Tree, table, detail, history and graph are views you tile, tab and split. Moving between them is instant. Drag a divider to resize, Ctrl+Alt+Z to maximize, Ctrl+Alt+W to close.',
    },
    {
      title: 'A workspace per job',
      body: 'Enrichment, review and the data model each get their own layout. Switch with a click or Ctrl+1…9. Every person keeps their own layout, and an unlocked workspace can save a shared one.',
    },
    {
      title: 'Search the whole catalog',
      body: 'Filters, sorting and grouping run on the server across every object, not only the rows you happened to load.',
    },
    {
      title: 'Live by default',
      body: 'When a colleague saves, the row updates in your open view. No refresh, no stale copy.',
    },
  ],
} as const

export const model = {
  eyebrow: 'Model',
  title: 'Your types, your rules',
  lede: 'Define the data model in the app. Nothing is locked to a product.',
  points: [
    {
      title: 'Types from scratch',
      body: 'Entity types and link types. Each type names its key attribute and the attributes it uses. There is no built-in article or product type.',
    },
    {
      title: 'Attributes carry the rules',
      body: 'Type, length, value lists, units and languages live on the shared attribute. A group only decides where the attribute applies. Values are never inherited or copied.',
      code: 'type · length · value list · unit',
    },
    {
      title: 'Relations are typed objects',
      body: 'A link type has two directions with their own labels and cardinality. Create links from Detail, by drag, or from the graph; a link row can carry its own values.',
    },
    {
      title: 'Definitions are versioned',
      body: 'Model edits are drafts. Review the step and save a new revision; a draft based on an older revision is rebased, never silently merged.',
    },
  ],
} as const

export const sources = {
  eyebrow: 'Views',
  title: 'Every relevant source, nothing else',
  lede: 'A view can follow a type, a linked object, or a structure node.',
  points: [
    {
      title: 'Select source',
      body: 'From the view menu or Ctrl+K › Data source. The list is filtered by the view’s bound type, not by the source it happens to use today.',
      code: 'Ctrl+K › Data source',
    },
    {
      title: 'Linked peers',
      body: 'Pull rows from another open table when a link type connects the two types: articles from a selected product, products from a selected article.',
    },
    {
      title: 'Structure nodes',
      body: 'Or take the objects placed in a selected group of an open structure tree. Sources that cannot yield the type are not listed.',
    },
    {
      title: 'No silent blank',
      body: 'An empty source says so and offers Show all. A choice that would close a follow chain is shown disabled as a cycle.',
    },
  ],
} as const

export const graph = {
  eyebrow: 'Graph',
  title: 'See the object, not just the row',
  lede: 'One hop at a time, with every link labelled.',
  points: [
    {
      title: 'Around the selection',
      body: 'The graph opens on the selected object and draws its groups, attribute values and directly linked peers, with labelled edges.',
    },
    {
      title: 'Expand on demand',
      body: 'Enter or the node menu expands a peer one more hop. A group node reveals its members; in the model graph, a type reveals the structures it may use.',
    },
    {
      title: 'Model graph',
      body: 'The data model has a read-only graph of entity types and link types, labelled with cardinality on each edge.',
    },
    {
      title: 'Built to stay readable',
      body: 'Force layout, Fit and Re-layout, pinned nodes, and labels that avoid stacking. The scene stops at 400 nodes with a visible hint.',
    },
  ],
} as const

export const agent = {
  eyebrow: 'Ctrl+K',
  title: 'An agent that does the work, you approve',
  lede: 'The agent proposes. A person saves.',
  points: [
    {
      title: 'Works where you are',
      body: 'It opens views, filters, selects rows and places panes in your workspace. You see each step as it happens. There is no separate chat window.',
    },
    {
      title: 'Acts as you, except delete',
      body: 'It runs with your permissions and calls the same operations as the screen. It cannot delete objects or links, accept its own proposals, or run a merge. A person does those.',
    },
    {
      title: 'Suggests, never saves',
      body: 'Agent edits arrive as suggested changes you review as a diff and save. Human cell edits are drafts too. A delete is the exception: once you confirm, it is written immediately.',
    },
    {
      title: 'A person behind every change',
      body: 'History records who saved each change and which agent suggested it. A rollback is a new suggestion, never a rewrite of the past.',
    },
  ],
} as const

export const agentSession = {
  prompt: 'Fill in the missing German names for tents',
  steps: [
    'Opening a list of articles',
    'Filtering on “Tält” where Name (de) is empty',
    'Writing German names for 4 objects',
  ],
  answer: '4 suggested changes are ready for review.',
  changes: [
    { id: 'SYN-000012', name: 'Kupoltält 13', after: 'Kuppelzelt 13' },
    { id: 'SYN-000013', name: 'Tunneltält 14', after: 'Tunnelzelt 14' },
    { id: 'SYN-000014', name: 'Familjetält 15', after: 'Familienzelt 15' },
  ],
  more: '1 more',
  field: 'Name (de)',
  owner: 'Suggested by the agent for Maria Lind',
} as const

export const deleteFlows = {
  eyebrow: 'Delete and restore',
  title: 'Delete is deliberate. Restore puts it back.',
  lede: 'Four ways in, one confirmation, and a Trash that also returns cascade-deleted links.',
  points: [
    {
      title: 'Four entry points',
      body: 'Delete from the row or cell menu, the Detail header, Ctrl+K, or the Delete key on selected rows. All four open the same dialog.',
    },
    {
      title: 'Counts first',
      body: 'The dialog asks the server for a dry run and shows how many objects and links will disappear. Cancel has focus; Escape writes nothing.',
      code: '?dry_run=1',
    },
    {
      title: 'Writes on confirm',
      body: 'A human delete is immediate after confirmation. It does not wait for Save. Multi-select deletes after one confirm and stops at the first error.',
    },
    {
      title: 'Trash restores the cascade',
      body: 'Restore brings back the object and the links that were removed in the same event. Links deleted separately stay deleted.',
    },
    {
      title: 'Agents cannot delete',
      body: 'A person makes every deletion. Agents and imports get a 403 from the delete operation, and no delete tool is offered to them.',
      code: '403 agent_cannot_delete',
    },
  ],
} as const

export const feedback = {
  eyebrow: 'Feedback',
  title: 'Report a bug from where it happened',
  lede: 'When the operator turns it on, a report carries the context with it.',
  points: [
    {
      title: 'Ctrl+Shift+B',
      body: 'Opens the feedback dialog from anywhere. It is available to admins when the operator has configured a webhook.',
    },
    {
      title: 'Context included',
      body: 'Route, workspace, view, selected object, filter and build travel with the message. Attach a screenshot and the recent client log if you want.',
    },
    {
      title: 'Files stay on your server',
      body: 'Screenshots and logs are written under BRAIAN_FEEDBACK_DIR; the webhook receives their paths, not their contents.',
    },
  ],
} as const

export const architecture = {
  eyebrow: 'For developers',
  title: 'One write path',
  lede: 'Everything else is a consumer.',
  stack: ['Rust', 'TanStack Start', 'Postgres', 'Typesense'],
  principles: [
    {
      title: 'One operation registry',
      body: 'The UI, Ctrl+K, the agent, the REST API and MCP call the same named operations with the same permission checks. The agent is the same person with a narrower surface: it cannot delete objects or links or save its own proposals.',
      code: 'patch_object · mass_edit · ui.filter',
    },
    {
      title: 'A change queue you subscribe to',
      body: 'Every committed change appends to the `changes` table in Postgres on an interactive lane and a bulk lane, so a single edit never waits behind a bulk load. The indexer and live stream read by seq. Subscribe via server-sent events or signed webhooks.',
      code: 'GET /v1/stream',
    },
    {
      title: 'Jobs and integrations are containers',
      body: 'Run them anywhere, in any language. They listen on the queue and write back through the API with a token tied to a person. Custom views embed by URL.',
      code: 'POST /v1/operations/{name}',
    },
    {
      title: 'Transformation is code',
      body: 'Imports and exports are programs you own and version, not mappings locked inside an import tool. The API validates every write either way.',
      code: 'type · length · value list · unit',
    },
    {
      title: 'Postgres is the truth',
      body: 'Objects are JSONB rows with an append-only change log. The search index and the stream derive from it, and both can be rebuilt.',
      code: 'braian reindex',
    },
    {
      title: 'Fast by default',
      body: 'A PATCH answers in 17.5 ms at p50. The same validation rules compile to WebAssembly, so the browser checks a field before it is sent.',
      code: 'crates/rules → wasm32',
    },
  ],
  job: {
    title: 'A job is two requests',
    body: 'Listen for changes, then write back through the same operation.',
    code: [
      '# listen',
      'curl -N "$BRAIAN/v1/stream" \\',
      '  -H "authorization: Bearer $TOKEN"',
      '',
      '# write back',
      'curl "$BRAIAN/v1/operations/patch_object" \\',
      '  -H "authorization: Bearer $TOKEN" \\',
      '  -H "content-type: application/json" \\',
      '  -d \'{"id":"…","values":{"namn":{"de":"Kuppelzelt 13"}}}\'',
    ],
  },
} as const

export const openSource = {
  title: 'Open source. Yours to run.',
  lede: 'Apache-2.0 licensed and self-hosted. Run the API and the indexer as separate processes, or all roles in one for development.',
  facts: ['Apache-2.0', 'Rust and TypeScript', 'Postgres · Typesense', 'One binary, several roles'],
  code: [
    'git clone https://github.com/braian-io/braian',
    'cd braian && cp .env.example .env',
    'just up && pnpm install && just dev',
  ],
} as const
