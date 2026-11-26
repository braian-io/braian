# Self-hosting

Braian is Apache-2.0 and runs on your own infrastructure. There is no hosted
dependency.

## Pieces

| Piece | Role |
| --- | --- |
| `braian` binary | Server roles: `api`, `indexer`, `all`, plus `seed`, `reindex`, `openapi` |
| Postgres | Source of truth, object rows and the append-only change log |
| Typesense | Search index, derived from `changes` |
| `apps/web` | The product UI (TanStack Start) |

Run `braian api` and `braian indexer` as separate processes in production and scale
them independently. `braian all` is the development role: it runs migrations, seeds,
the API, the indexer and the live stream together.

Postgres is the truth. The search index and the change stream derive from it, and
both can be rebuilt with `braian reindex`. Interactive and bulk traffic use separate
Postgres pools and separate lanes in the change log, so a bulk load does not stall a
person's edit.

## Local infrastructure

`compose.yaml` is for development: Postgres 18 and Typesense 30.2, published on
loopback by default. `just up` starts them; `just dev` runs migrations, synthetic
seed data, the API, the indexer and the web app.

`scripts/reset-demo-db.sh` is a manual, explicit reset for a development or demo
database. It backs up first, refuses unsafe database names and hosts, and is not part
of deploy or CI.

## Configuration

Copy `.env.example` to `.env` and replace the placeholders. The groups are:

- infrastructure: `POSTGRES_*`, `DATABASE_URL`, `TYPESENSE_URL`, `TYPESENSE_API_KEY`
- processes: `BRAIAN_API_ADDR`, `BRAIAN_SEARCH_ALIAS`, `BRAIAN_COOKIE_SECURE`
- pools and bulk: `BRAIAN_POOL_*`, `BRAIAN_BULK_*`, `BRAIAN_INDEXER_*`
- demo and tokens: `BRAIAN_DEV_TOKENS`, `BRAIAN_DEMO_*`, `BRAIAN_SEED_COUNT`
- agent: `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `BRAIAN_AGENT_MODEL`, `BRAIAN_AGENT_MOCK`
- feedback: `BRAIAN_FEEDBACK_*`

Set `BRAIAN_COOKIE_SECURE` only behind HTTPS. `.env` is gitignored; never commit
secrets. Details are in the [configuration reference](https://github.com/braian-io/braian/blob/main/docs/config.md)
and the [developer notes](https://github.com/braian-io/braian/blob/main/docs/dev.md).

## Upgrades

Migrations run on connect. Definitions are versioned append-only revisions, and
`braian reindex` rebuilds the search alias from Postgres if an index needs to be
recreated. See the [change log contract](https://github.com/braian-io/braian/blob/main/docs/events.md).

## Related

- [Getting started](/docs/getting-started/)
- [Feedback](/docs/feedback/)
