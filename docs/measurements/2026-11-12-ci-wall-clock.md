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
5m30s vägg, under 7m56s. Prediktionen träffade inte: faktisk Playwright-
spridning i efter-körningarna var 194–319 s och väggklockan 6m20s–7m10s.

## Efter: andra packningen (per-fil-vikter, den som mergades)

Två gröna fulla `pull_request`-körningar plus den efterföljande
`push`-körningen på `main`, alla `mode=full` (`load` success). Vägg =
`updated_at - run_started_at` (UTC från GitHub API). 972 har samma träd som
squash `bcc7e2b`. Första packningen ovan (965/966/967, median 8m07s) mergades
inte.

| Run | SHA | Event | Start (UTC) | Vägg | Långsammaste e2e |
| ---: | --- | --- | --- | ---: | --- |
| 970 | `5a74d8b` | pull_request | 2026-11-12 03:56:56 | 7m10s (430s) | e2e (5) 385s, Playwright 319s (spann 194–319s) |
| 972 | `3400e88` | pull_request | 2026-11-12 04:05:59 | 6m20s (380s) | e2e (7) 356s; långsammaste Playwright e2e (0) 304s (spann 237–304s) |
| 973 | `bcc7e2b` | push `main` | 2026-11-12 04:14:44 | 6m23s (383s) | Playwright 202–308s |

Median av de två PR-körningarna 970/972: **6m45s (405s)**. Båda, och push 973,
ligger under målet 7m56s.

## Jämförelser: push mot push och PR mot PR

Baslinjen **9m20s (560s)** kommer från de tio senaste gröna **push**-körningarna
på `main` (923–955, tabellen ovan). Den rättvisa jämförelsen med samma typ av
körning är därför push 973 (6m23s / 383s) mot 9m20s: **−31,6 %**
((560 − 383) / 560).

Efter-mätningen 970/972 är PR-körningar, som ofta är något snabbare än push
till `main`. En PR-mot-PR-baslinje tas från de tio senaste gröna
`pull_request`-körningarna i intervallet 947–968 som inte är docs/landing-only
(de korta körningarna 946/945/939/937, ca 1–2 min, utesluts) och inte 77:s
egna efter-körningar 965–967 (första packningen, redan efter ändringen). De tio
körningarna är:

| Körning | SHA | Gren / rad | Vägg |
| ---: | --- | --- | ---: |
| 968 | `99e8697` | junior/51a-reset-maximized | 7m31s (451s) |
| 962 | `e838be4` | junior/51a-reset-to-default | 7m48s (468s) |
| 960 | `66ebf9c` | junior/51a-reset-to-default | 7m36s (456s) |
| 959 | `e9ff2a8` | junior/61b-selection-fixes | 8m03s (483s) |
| 958 | `4027c8e` | junior/51a-reset-to-default | 10m37s (637s) |
| 956 | `045d8ea` | junior/61-selection-draft | 8m40s (520s) |
| 954 | `77b1d4c` | junior/61-selection-draft | 7m55s (475s) |
| 953 | `ecdfdb2` | junior/137b-fields-focus | 7m53s (473s) |
| 951 | `2c2ddee` | junior/137b-fields-focus | 9m49s (589s) |
| 947 | `0c88d40` | junior/196-link-field-replace | 8m56s (536s) |

Sorterade väggar: 451, 456, 468, 473, 475, 483, 520, 536, 589, 637. Median
**(475 + 483) / 2 = 479s = 7m59s**. Medianen av 970/972 (6m45s / 405s) är
**15,4 %** under den PR-baslinjen ((479 − 405) / 479). Några av de tio kan ha
kört `mode=web` (till exempel 959, där `load` hoppades över); `load` ligger
utanför den kritiska vägen, så väggklockorna är ändå jämförbara. Det är alltså
inte en uppskattning utan en beräkning från GitHub API, men det är en annan
urvalsregel än push-baslinjen, och den officiella 15 %-grinden för #312 mättes
mot push-baslinjen.

## Avgränsning

Ingen full Playwright-svit kördes lokalt och ingen databas startades för den
här mätningen; underlaget är GitHub Actions jobb- och stegtider från de tio
gröna körningarna. `sccache` utvärderades inte som A/B: en sådan ändring
kräver egna körningar för att bevisa nytta och rör inte PR-kritiska vägen när
`bins` har cache-hit. Demo, autodeploy och `/opt` är orörda.
