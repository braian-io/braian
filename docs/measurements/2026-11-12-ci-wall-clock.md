# CI-väggklocka före och efter viktning

Mätt 2026-11-12 på `main` `f8d0cb6aabe2b8b187f79ef6366427be357b268b` (row 61b,
#311). Hårdvara: GitHub Actions `ubuntu-latest` (gratis 2-kärnig runner).
Tjänsterna kör i Docker Compose på varje runner. Inga hemligheter eller
repo-inställningar ändrades.

## Baslinje: tio senaste gröna `push`-körningarna på `main`

Alla kör `mode=full`. Väggklocka är `updated_at - run_started_at` från
GitHub API; tiderna är avrundade till sekunder.

| Körning | SHA | Start (UTC) | Vägg |
| ---: | --- | --- | ---: |
| 955 | `685245f` | 2026-11-12 01:44:30 | 8m12s |
| 948 | `c8fb0af` | 2026-11-12 00:48:06 | 10m00s |
| 944 | `45ea113` | 2026-11-12 00:06:58 | 11m30s |
| 941 | `7eaee05` | 2026-11-11 23:30:15 | 8m40s |
| 938 | `5f2402e` | 2026-11-11 23:01:49 | 8m26s |
| 935 | `e70184f` | 2026-11-11 21:54:53 | 12m10s |
| 933 | `59ba66f` | 2026-11-11 21:39:50 | 11m08s |
| 927 | `a726591` | 2026-11-11 19:00:49 | 6m11s |
| 925 | `ab7951d` | 2026-11-11 18:42:14 | 10m07s |
| 923 | `1cc863b` | 2026-11-11 18:29:50 | 6m55s |

Median **9m20s (560s)**, medel **9m20s (560s)**, min 6m11s, max 12m10s.

## Var tiden gick (körning 955, 8m12s, bins cache-hit)

| Jobb/steg | Tid |
| --- | ---: |
| `bins` | 6s |
| `stack` | 4s |
| `web` | 1m06s |
| `licenses` | 58s |
| `phase-1` | 27s |
| `rust` | 3m57s |
| `load` | 2m02s |

`rust`, `phase-1`, `load`, `web` och `licenses` låg utanför den kritiska
vägen. Kritiska vägen var `bins` + långsammaste e2e-shard + `stack`. Playwright-
steget i de sex shardsen tog 422, 399, 374, 374, 263 och 235 s; setup var
cirka 45 s per shard. Vikterna var gamla: `row128f`/`row128g` stod kvar på
480 s, vilket är mer än hela den shard de körde i (422/399 s), `row129f` på
420 s, och sju specar saknade helt en vikt.

## Ändringen

- `scripts/e2e.mjs`: `measuredSeconds` kalibrerades om från
  `Playwright shard`-stegen i de tio gröna körningarna. Varje shards uppmätta
  tid fördelades på dess filer i proportion till de gamla vikterna, och
  medianen över körningarna användes. Vikterna är nu ungefär varje fils andel
  av Playwright-steget i sekunder; `reseedSeconds` (4 s) läggs på separat.
  Fallback för en spec utan vikt är 4 s per test i stället för 12 s.
- `.github/workflows/ci.yml`: e2e går från sex till åtta shards. Alla 93
  registrerade specar körs fortfarande exakt en gång; `scripts/e2e.mjs`
  fördelar dem längst-först.
- Inga tester togs bort, inga path-filter ändrades och inga nya secrets eller
  inställningar användes.

## Prediktion (ännu inte mätt)

Packarens egna vikter för de åtta shardsen är 267, 267, 268, 267, 267, 267,
267 och 267 s. Med samma setup som i baslinjen (cirka 45 s per shard) blir
`Playwright shard`-jobbet omkring 5m12s och hela körningen omkring 5m30s–6m,
mot 7m53s/8m12s för den långsammaste sharden i körning 955.

Detta är en modellprediktion, inte en mätning. Den riktiga efter-siffran tas
från den här grenens gröna `pull_request`-körningar (minst två) och första
gröna `push` till `main`, mätt på samma sätt som baslinjen. Målet är median
**≤ 7m56s (476s)**.

## Avgränsning

Ingen full Playwright-svit kördes lokalt och ingen databas startades för den
här mätningen; underlaget är GitHub Actions jobb- och stegtider från de tio
gröna körningarna. `sccache` utvärderades inte som A/B: en sådan ändring
kräver egna körningar för att bevisa nytta och rör inte PR-kritiska vägen när
`bins` har cache-hit. Demo, autodeploy och `/opt` är orörda.
