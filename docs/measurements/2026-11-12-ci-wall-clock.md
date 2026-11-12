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

## Efter: första packningen (åtta shards, proportionella vikter)

Tre gröna fulla `pull_request`-körningar, alla `mode=full` (`load` success).
Vägg = `updated_at - run_started_at`. Körning 964 på `17232ec` failade i
`e2e (1)` på en `field-picker`-flake och räknas inte.

| Run | SHA | Started (UTC) | Wall | Slowest e2e job | Slowest Playwright |
| ---: | --- | --- | ---: | --- | --- |
| 965 | `c99c8aa166f6fc2749716540fdcfe90f94953cc1` | 2026-11-12 03:22:05 | 6m17s (377s) | e2e (7) 356s | e2e (7) 299s |
| 966 | `e882eebd6649515ade5f352bff8883d68625982b` | 2026-11-12 03:31:30 | 8m39s (519s) | e2e (7) 494s | e2e (7) 444s |
| 967 | `758bedcdce7fb5330b2bec147f73c38680385919` | 2026-11-12 03:41:08 | 8m07s (487s) | e2e (7) 468s | e2e (7) 419s |

Median **8m07s (487s)** mot mål **≤ 7m56s (476s)** och baslinje **9m20s
(560s)**. Det är 13 % snabbare, 11 s över målet. Medelvärdet är 7m41s (461s)
men kriteriet är medianen. Två av tre körningar låg över 7m56s.

Orsaken var shard 7: packaren trodde 267 s, men Playwright tog 299/444/419 s.
`column-move-race.spec.ts` var viktad till 6 s och tog 1,7–1,8 minuter;
`layout.spec.ts` var viktad till 15 s och tog 1,1–1,3 minuter. Den första
kalibreringen hade fördelat varje shards totaltid proportionellt mot gamla
vikter, så redan för lätta filer förblev för lätta och samlades i samma shard.

## Andra kalibreringen (per-fil-tider, fortfarande åtta shards)

`measuredSeconds` räknades om från faktiska fil-tider i körning 967 (alla
åtta shards) och, där båda mätte samma fil, max mot körning 966 shard 7.
Packaren är oförändrad (längst-först, åtta bins). Med `reseedSeconds` 4 s
blir prediktionen 251–259 s Playwright per shard (spridning 8 s) och cirka
5m30s vägg, under 7m56s. Efter-siffran för den här kalibreringen mäts på
samma sätt på nästa gröna fulla PR-körningar.

## Avgränsning

Ingen full Playwright-svit kördes lokalt och ingen databas startades för den
här mätningen; underlaget är GitHub Actions jobb- och stegtider från de tio
gröna körningarna. `sccache` utvärderades inte som A/B: en sådan ändring
kräver egna körningar för att bevisa nytta och rör inte PR-kritiska vägen när
`bins` har cache-hit. Demo, autodeploy och `/opt` är orörda.
