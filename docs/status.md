# Status 2026-11-09

## Rad 103-uppföljning — Select source listar varje källa som kan ge vyns typ

Grenen `junior/103-derivable-sources` utgår från `origin/main` `ab7951d` (#297, inklusive #298) och är **inte mergad, deployad eller accepterad**. Den sista 103-omgången rättar menyn Select source: den använder nu **målvyns bundna typ** (inte den nuvarande källans typ), listar alla öppna tabeller och träd som kan härleda typen, och utelämnar källor som saknar väg till typen.

De sju acceptanskriterierna från `brief.md` (Braian Test grindar bara på dessa):

1. **Target type, not current source type.** Opening Select source (view ⋯ menu or Ctrl+K › Data source) on a typed object table lists sources that can yield **that view's bound type**. The filter must use the target view's type, not `currentSource.typeId`. So an Articles panel still sourced from Products lists Article-yielding sources (All Articles, Articles from Products, Articles from a structure tree, …), never only Product sources.
2. **Linked-type peers are listed.** If another open object table in the same workspace is a linked type of the target (demo: Products ↔ Articles, and the other demo link types that actually connect), Select source shows that peer, e.g. `Articles from Products` on an Articles view, and `Products from Articles` on a Products view. When several link types exist between the two types, the user picks one (existing PR2 behaviour).
3. **Structure trees that can yield the type are listed.** A visible structure tree whose selected node can produce objects of the target type is offered, e.g. `Articles from Food` / `Products from Food` when the Food tree has a selected group that the type may use. A tree or node that cannot yield the type is not listed.
4. **Underivable sources are absent.** Types, views and trees with no derivation path to the target type do not appear. A Products view must not list `All Articles`, `All Suppliers` (unless a real link/tree path yields Products from them — then the row is `Products from …`, not `All Suppliers`), `Articles from Products`, or `Suppliers from Products`. The same rule applies with types swapped for an Articles view.
5. **Choosing a listed source yields rows (or the documented empty state).** On a demo-like seed, selecting each listed source for Articles and for Products fills the table with matching rows, or shows the existing empty copy (`Select a row in {view}`, `No linked {type} for {object}`, `Show all {type}`) — never a silent blank and never a source that cannot produce the type. Header still shows the source (`Linked to: …` / All …).
6. **The choice persists across reload.** After picking a source and pressing F5 / reloading, the same source and the same rows (or the same empty state) are still there. Restore owned fixtures / view sources after tests.
7. **Cycles stay greyed with the PR 280 label.** A source that would close a follow-chain is listed but disabled, with subtitle `Would create a cycle ({type} follows {source})` and no row/SYN id. Reload-selection from #280 and explicit menu target from #276 stay intact.

Vad som ändrades:

- `apps/web/src/palette-select-source.ts`: ny `targetTypeIdForView()` läser `typeOfView` på målvyn; en länktypsbunden tabell pekar på sin `linkFrom`-entitet eftersom länktyper inte är poster. Ny `selectSourceMenuRows()` äger typfiltret och tar målvyn, inte `currentSource.typeId`. `selectSourceSubmenuRows()` behåller sin typfiltrering oförändrad.
- `apps/web/src/palette.tsx`: båda menyvägarna (dock-menyns Select source och Ctrl+K › Data source) anropar `selectSourceMenuRows({ …, targetView: sourceTarget })`. `currentSource` används bara för `Current`-markering. Peer-insamlingen tar nu med varje öppen `object_table` som har en länkväg till måltypen, även innan den har en markerad rad; valet visar då den dokumenterade tomma copyn `Select a row in {view}` och följer första raden när den väljs. Träd med vald nod ingår när typen tillåter trädet.
- Oförändrat: #276:s explicita meny­mål (`sourceTargetViewId`) och #280:s reload-val samt cykeltexten `Would create a cycle (…)`. Inga #276/#280-specar är försvagade. Den avsiktliga menyändringen är att peer-tabeller utan markerad rad nu listas, och att en Articles-vy som redan följer Products visar Article-källor i stället för Product-källor.
- Enheter: `palette-select-source.test.ts` 21 tester (6 nya): måltyp från vyn i stället för aktuell källa, Articles-källor på en Articles-vy som följer Products, Product-källor med underiverbara källor utelämnade, träd som inte kan ge typen utesluts, generiska vyer behåller alla typer, cykel med PR 280-texten. Hela vitest-sviten: **160 filer / 949 tester** gröna.
- E2E: ny `apps/web/e2e/select-source-derivable.spec.ts` (registrerad i `scripts/e2e.mjs`, `measuredSeconds: 150`) med demo-lik seed (Products, Articles, Suppliers, Food-träd). Tre tester: (1) Articles-menyn har exakt `All Articles`, `Articles from Articles` (disabled cykel), `Articles from Products`, `Articles from Suppliers`, `Articles from Food`; alla aktiva källor ger rader eller dokumenterad tom state; F5 behåller `Articles from Products` och samma rader. (2) Products-menyn har exakt `All Products`, `Products from Articles`, `Products from Suppliers`, `Products from Food` och ingen `All Articles`/`All Suppliers`/`Articles from Products`/`Suppliers from Products`; vald peer och rader överlever F5. (3) en Articles-vy som redan följer Products visar `Products from Articles` gråad med `Would create a cycle (Products follows Articles)` och inget rad-/SYN-id.
- Bevis i isolerad compose `row103b` (Postgres 18 på `127.0.0.1:25460`, Typesense 30.2 på `127.0.0.1:28160`, syntetiska värden ur scratch-`.env`, inga Track A-portar): serverbinär byggd i `mcr.microsoft.com/devcontainers/rust:1-bookworm` med named volume `row103b-cargo-home` (exit 0, 3 m 12 s; ingen Rust-diff, binären användes bara av e2e). `pnpm --dir apps/web typecheck` exit 0; `scripts/check-english.py` exit 0; hela vitest-sviten 160/949; nya specen 3/3 (1,2 m); regressionerna `select-source-target` 2/2, `select-source-reload` 2/2, `peer-source` 1/1, `peer-source-empty` 1/1, `peer-source-chain` 1/1, `view-source-type` 1/1 och `source-all-explicit` 1/1.
- Skärmbilder ligger i specens `test-results` och i scratch `shots/` (`20`–`23`). `apps/web/src/data-model.tsx` är orörd (`sha256 2d3459c60dd7473f2af3c0ff15cf1fd3295b5bc1da9da0e1046905de35babcaa`). Inga `product_suppliers`-etiketter, demolabels, Rust-kod, demo (`/opt/braian`), Caddy eller Notion rördes; ingen PR öppnades och inget deployades.
- Ärlig avgränsning: strukturens nodval återställs inte från URL:en vid F5 (bara radvalet gör det, som #280), så en trädkälla kan efter reload visa `Select a row in {tree}`. Kriteriet tillåter samma källa och samma rader **eller** samma tomma state; reload-testet använder därför en radbaserad peer (`Articles from Products`) för identiska rader. Klick på sista raden medan Detail är öppen och `product_suppliers`-etiketter är fortfarande utanför denna omgång.


Bas: `origin/main` tip `795eb06` (#277). Senaste migrering i repot: `V44__proposal_recoveries.sql` (#268).

## Rad 129f — lås på state, raderingsdialogens nollor, ingen kvarglömd Confirm-rad och tydligare fokusring

Grenen `junior/129f-allowed-trees-state-lock` utgår från `origin/main` `fd1cbcf` (#295) och är **inte mergad, deployad eller accepterad**. Den rättar 129e-retesten: klick på rutans kanter/etikett kunde fortfarande slinka igenom den rumsliga ±6 px/800 ms-bursten, raderingsdialogen sa noll flera gånger och nämnde inte att Allowed trees-länken försvinner, aktivitetsfoten behöll en tidsstämplad `Confirm`-rad efter en radering, och fokusringen på kryssrutan var svag mot mörk bakgrund.

- `apps/web/src/model-draft-ui.tsx`: den rumsliga/tidsbaserade bursten (`pendingPoint`, `clickBurst`, `inBurst`, `lockStartedAt`) är borttagen. Låset är nu enbart `lockedStructuresType()`/stage-state: medan ett `set_structures`-steg för samma typ är på väg eller dess review är öppen sväljs varje `pointerdown`/`mousedown`/`mouseup`/`click`/`dblclick`/`change`/`input` samt Space/Enter som träffar den typens `[data-testid='allowed-trees']` (ruta, hörn, etikett eller tangentbord). Review- och laddningsdialogen stänger inte längre på klick utanför; de avgörs med Cancel, Save, X eller Esc, så en andra klick i samma gest kan inte avbryta den första ändringen. Fokus ligger kvar på kryssrutan (`onOpenAutoFocus` avstängt), så en andra Space/Enter träffar den sväljda rutan i stället för en dialogknapp.
- `apps/web/src/consequence.tsx`: när `values`, `objects`, `links` och `selections` alla är noll visas en enda rad, `No values will be deleted`, i stället för `0 values on 0 objects will be deleted` följt av `Affected objects: 0`/`Sample: —`. Ett `delete_structure`-förslag letar upp de typer vars `structures` fortfarande innehåller trädet och visar `The Allowed trees link on Product is removed too.` (eller de typer som används). URL:en rörs inte när dialogen öppnas; E2E jämför hela `path+query` före och efter. En destruktiv accept pushar inte längre `Confirm` till aktivitetsfoten.
- `apps/web/src/i18n.ts`: nya engelska strängar `noValuesDeleted` och `allowedTreesLinkRemoved`.
- `apps/web/src/styles.css`: kryssrutans `:focus-visible` ritar nu en dubbel ring, `outline: 2px solid var(--text); outline-offset: 3px` plus `box-shadow: 0 0 0 3px var(--accent)`, i stället för den tidigare 2 px-ringen med 2 px offset.
- Enheter: `consequence.test.tsx` 7 (nollraden en gång, länktexten, ingen `Confirm`-push), `model-draft-ui.test.tsx` 25 (state-låset sväljer klick på en låst ruta), `allowed-trees-css.test.ts` 6 (dubbelringen). Hela vitest-sviten: **160 filer / 935 tester** gröna.
- E2E: ny `apps/web/e2e/row129f-allowed-trees-state-lock.spec.ts` (registrerad i `scripts/e2e.mjs` med `measuredSeconds: 420`). Tre tester: (1) riktiga musklick på rutans mitt (två och tre), motstående hörn, etikett följt av ruta och ruta följt av etikett samt Space×2 och Space+Enter ger exakt ett `set_structures`-steg och en dialog; Cancel backar helt; (2) strukturraderingen visar `No values will be deleted` en gång, `The Allowed trees link on Product is removed too.`, behåller `path+query` och lämnar ingen `Confirm`-rad i `activity-log` efter Delete; (3) fokus efter Esc ger `outline-width: 2px`, `outline-offset: 3px` och en 3 px accent-`box-shadow`, med skärmbild.
- Bevis i `docker run --rm` på uppgiftsägt nätverk `row129f_default` (compose-projekt `row129f`) mot syntetisk Postgres 18 och Typesense 30.2, utan host-nätverk, Docker-socket eller demo-databas, med `row129f-e2e-pw:local` och `BRAIAN_BIN=target/debug/braian` (inga Rust-ändringar): `pnpm --dir apps/web exec tsc --noEmit` exit 0; `scripts/check-english.py` exit 0; nya specen 3/3 (42,1 s); regressionerna `row129-allowed-trees.spec.ts` 2/2, `row129c-allowed-trees-review.spec.ts` 5/5, `row129d-allowed-trees-polish.spec.ts` 6/6, `row129e-allowed-trees-input.spec.ts` 5/5, `structure.spec.ts` 2/2, `proposal-lifecycle.spec.ts` 4/4 och `drag.spec.ts` 5/5.
- Avsiktlig beteendeändring: ett klick på overlayn stänger inte längre en pågående allowed-tree-review; den avgörs med Cancel/Save/X/Esc. `row129-allowed-trees.spec.ts` och `row129d-allowed-trees-polish.spec.ts` är uppdaterade i den riktningen (overlay-klicket verifierar att dialogen står kvar och att raden bakom inte aktiveras, därefter Cancel). `apps/web/src/data-model.tsx` och fullscreen-graftoolbaren är orörda; inga demolabels eller `product_suppliers`-etiketter ändrades.
## Säkerhet — dev-portarna bara loopback

Grenen `junior/security-compose-bind-loopback` utgår från `origin/main` `580f972` (#296) och är **inte mergad, deployad eller accepterad**. `compose.yaml` publicerade Postgres och Typesense på `0.0.0.0`, så en lokal `just up` nåddes utifrån trots ufw. Portarna blir nu `"${POSTGRES_BIND:-127.0.0.1}:${POSTGRES_HOST_PORT:-5433}:5432"` och `"${TYPESENSE_BIND:-127.0.0.1}:${TYPESENSE_HOST_PORT:-8108}:8108"`, så standardbindningen är loopback. `.env.example` och `docs/dev.md` säger att `HOST_PORT` bara är ett portnummer, att `127.0.0.1:` i det gör bindningsspecen ogiltig, och att `BIND=0.0.0.0` går men inte är standard.

- `docker compose config` (dummy-värden, läs-kontroll) visar `host_ip: 127.0.0.1` för båda tjänsterna med standardvärdena och med CI:s `POSTGRES_HOST_PORT=5433` (bara port); med `POSTGRES_BIND=0.0.0.0`/`TYPESENSE_BIND=0.0.0.0` blir `host_ip: 0.0.0.0`. En `127.0.0.1:`-prefix i `HOST_PORT` ger `invalid IP address: 127.0.0.1:127.0.0.1`.
- CI:s `.env`-steg (`.github/workflows/ci.yml`) sätter `POSTGRES_HOST_PORT=5433` och når tjänsterna på `localhost:5433` / `localhost:8108`; med standard-`BIND` blir det `127.0.0.1:5433:5432` respektive `127.0.0.1:8108:8108`, och `localhost` slås upp till `127.0.0.1` på runnern. Arbetsflödet är oförändrat eftersom inget skifte bevisats.
- Inga Rust-, web-, CI- eller demodatavärden ändrades. `apps/web/src/data-model.tsx` är orörd, och `product_suppliers`-etiketterna är orörda. Demovärden (`/opt/braian`) och Caddy har inte rörts.

## Rad 129e — riktig dubbelklick på kryssrutan, Esc-race, markering och raderingsdialog

Grenen `junior/129e-allowed-trees-input` utgår från `origin/main` `0adeebe` (#293) och är **inte mergad, deployad eller accepterad**. Den rättar Test-avvisningen på `0adeebe`: ett riktigt dubbel-/trippelklick på själva kryssrutan (inte bara Playwrights `dblclick` eller ett syntetiskt click) gav ingen dialog och draft 0, medan etiketten fungerade; Esc/Cancel/X under en pågående `POST /v1/model/draft/steps` kunde komma tillbaka som «1 unsaved changes»; Object types-raden Product var inte markerad efter Save + F5; raderingsdialogen visade «Data model», aktiverad Confirm och påhittade «Affected objects: 0 / Sample: —» medan förslaget laddade, och upprepade sedan titeln under «Model diff»; ett okänt sparat `braian.modelSelection` kunde visas som rå typnyckel; och fokusringen på kryssrutan efter Esc var svag på mörk bakgrund.

- `apps/web/src/model-draft-ui.tsx`: låset minns var den första pekaren landade. När review-skalet portalerats över kryssrutan sväljs resten av samma dubbel-/trippelklick (pointerdown/mousedown/mouseup/click/dblclick inom 800 ms och ±6 px) innan Radix tolkar det som ett klick utanför dialogen. Space/Enter inom samma burst sväljs också, så en andra Space inte aktiverar en autofokuserad dialogknapp. Första ändringen avbryts aldrig. `ReviewLoadingDialog` har nu samma `onEscapeKeyDown`/`onCloseAutoFocus`-skydd som den laddade dialogen. Cancel medan POST:en är i luften registrerar en wildcard-återställning (typ + strukturer) i `pendingReverts`; sena draft-snapshots stripas tills en färsk hämtning utan steget bekräftar att det är borta.
- `apps/web/src/model-stage.ts`: den pågående strukturomgången exponerar sitt mål (`structuresStageTarget`) så UI:t kan återställa även innan servern hunnit namnge stegets index.
- `apps/web/src/model-selection.ts`: sparade typ-/gruppval valideras mot de senast laddade definitionerna (och en liten `braian.modelKeys`-snapshot vid omladdning). En okänd eller borttagen typ/grupp rensas och kan aldrig bli en rå rubrik. `apps/web/src/model-draft-ui.tsx` registrerar både sparade och osparade draftdefinitioner; `apps/web/src/data-model.tsx` är orörd (`2d3459c…`).
- `apps/web/src/model-tables.tsx`: Object types-tabellen återställer valet till sin radstate, så Product-raden får samma markeringsklass som efter ett manuellt klick.
- `apps/web/src/consequence.tsx` + `proposal-bus.ts`: raderingsdialogen får operationens namn direkt (`Delete structure`) medan förslaget laddar, visar danger-Confirm som disabled och inga påhittade antal/urval. När data laddats är en enda modellrad redan titeln, så den duplicerade «Model diff»-rubriken/listan ritas inte. Övriga flerradiga förslag behåller Model diff.
- `apps/web/src/styles.css`: kryssrutans `:focus-visible` använder `outline: 2px solid var(--text); outline-offset: 2px` så ringen syns mot både mörk och ljus bakgrund.
- Enheter: `model-selection.test.ts` 8 (okänd typ, borttagen typ, borttagen grupp, snapshot vid omladdning), `model-draft-ui.test.tsx` 24 (Esc med fördröjd POST), `consequence.test.tsx` 4 (laddningstitel, disabled Confirm, inga fejkantal, ingen dubbel Model diff), `allowed-trees-css.test.ts` 5 (fokusring). Hela vitest-sviten: **159 filer / 928 tester** gröna.
- E2E: ny `apps/web/e2e/row129e-allowed-trees-input.spec.ts` (registrerad i `scripts/e2e.mjs` med `measuredSeconds: 300`). Fem tester: (1) två/tre riktiga mushändelser på rutans mitt, 80 ms mellanrum, `clickCount: 2` samt Space två gånger ger exakt en dialog, ett `set_structures`-steg, markerad ruta och full återställning via Cancel; (2) Esc, Cancel och X under en 2,5 s fördröjd POST lämnar ingen dialog, inget unsaved-antal, draft 0 och omarkerad ruta även efter att svaret kommit; (3) Save + F5 ger `[data-row-id="product"]` markerad klass; (4) fördröjd förslagsladdning visar `Delete structure`, disabled Confirm och inga fejkantal, och efter laddning ingen dubbel Model diff; förslaget kastas; (5) en påhittad `braian.modelSelection` rensas vid omladdning och visas aldrig som rubrik. Varje test städar egna strukturer, draft och öppna förslag.
- Bevis i `docker run --rm` på uppgiftsägt nätverk `row129e_default` (compose-projekt `row129e`) mot syntetisk Postgres 18 och Typesense 30.2, utan host-nätverk, Docker-socket eller demo-databas, med befintlig `row129e-e2e-pw:local` och `BRAIAN_BIN=target/debug/braian` (inga Rust-ändringar): `pnpm --dir apps/web exec tsc --noEmit` exit 0; `scripts/check-english.py` exit 0; nya specen 5/5 (1,3 m); regressionerna `row129-allowed-trees.spec.ts` 2/2, `row129c-allowed-trees-review.spec.ts` 5/5, `row129d-allowed-trees-polish.spec.ts` 6/6, `structure.spec.ts` 2/2, `proposal-lifecycle.spec.ts` 4/4, `model-table-row-selection.spec.ts` 1/1 och `attribute-table-bool-columns.spec.ts` 4/4.
- Avsiktlig beteendeändring: `row129c`-specen förväntar inte längre en separat `model-diff`-rad för en enskild strukturradering, eftersom titeln redan är exakt samma mening. `apps/web/src/data-model.tsx` och fullscreen-graftoolbaren är orörda; inga demolabels ändrades.

## Rad 129c — hela draften i review, omedelbart Cancel och strukturens etikett

Grenen `junior/129c-review-followup` utgår från `origin/main` `8794615` (#287) och är **inte mergad, deployad eller accepterad**. Den rättar Test-avvisningen på `8794615`: reviewdialogen visade bara allowed-tree-raden även när en tidigare osparad steg (till exempel Article plural → ArticlesX) sparades i samma Save; Cancel/overlay/X visade kvarvarande kryssruta och gammalt antal tills nätverket svarat; Cancel kunde ta bort tidigare `set_structures`-steg för samma typ; strukturraderingen visade den råa nyckeln (`Delete structure qa129r_0516`); och `Show by default`/`Country of or…` var trunkerade i attributtabellen.

- Ny `apps/web/src/model-step-text.ts`: en rad per `ModelChange` med visningsnamn från `body.definitions` (typ singular/plural, attribut, struktur, grupp, värdelista, enhet). Råa nycklar/id:n används inte när en etikett finns; fallback är engelsk generisk copy. `set_structures` och `update_type` som byter träd markeras som allowed-tree-steg.
- `apps/web/src/model-draft-ui.tsx`: reviewdialogen renderar nu **alla** draftens steg i `review-steps`/`review-step`, med allowed-tree-raden markerad (`data-highlight="true"`). Beskrivningen leder fortfarande med `Allowed trees for …`; inget steg kan sparas utan att ha listats.
- `apps/web/src/model-stage.ts`: `stageModel('model.set_structures', …)` registrerar exakt det index servern lade steget på (`takeStagedStructures`). Reviewens Cancel tar bara bort de indexen, aldrig «sista set_structures för typen». `allowedTreeStepIndexes` validerar att steget på indexet fortfarande har samma typ och strukturlista; saknad `type_key` tar inte bort något extra.
- `apps/web/src/model-draft-ui.tsx`: Cancel, Esc, overlay och stängningskrysset går genom samma `close()`. Den cachade draften patchas först (`count`, `steps` och `definitions.types[].structures` från kvarvarande steg eller committade definitioner), så kryssrutan och «N unsaved changes» ändras innan `POST /v1/model/draft/steps {remove}` svarat. Om servern avvisar återställs cachen och felet visas i draft-baren.
- `apps/web/src/consequence.tsx`: ett modellförslag bygger sina rader och sin titel från förslagets `patch`-steg och de committade definitionerna. En strukturradering visar alltså `Delete structure Food`, aldrig nyckeln, och antal/blockerat läge ligger kvar i samma enda bekräftelsedialog. `apps/web/src/structure-tree.tsx`: de oanvända delete-grenarna i den gamla `StructureDialog` är borttagna; move-dialogen och gruppraderingens proposal-flöde är oförändrade.
- `apps/web/src/styles.css`: reviewlistan har en accentrand på allowed-tree-raden. Attributtabellen ger `label` minst 180 px, `key`/`kind` 96 px, `unit` 88 px, `from` 140 px samt fasta bredder för `Required` (84), `Show by default` (124), `Languages`/`Searchable` (92). Reorder-cellen hålls på 58 px så den inte kollapsar. Rubriker och celler behåller sina `title`-tooltips.
- Enheter: ny `model-step-text.test.ts` (5), `model-draft-ui.test.tsx` 22 (inkl. flera typer, tidigare `set_structures` för samma typ, saknad `type_key` och optimistisk Cancel med återställning), `consequence.test.tsx` 3 (struktur etikett, exakt en dialog), `allowed-trees-css.test.ts` 4. Hela vitest-sviten: 157 filer / 889 tester gröna.
- E2E: ny `apps/web/e2e/row129c-allowed-trees-review.spec.ts` (registrerad i `scripts/e2e.mjs`). Fem tester: (1) tidigare osparad Article-plural + Product-träd listas båda, ingen direkt PUT och ingen Save före godkännandet, båda sparade efter Save + F5; (2) Cancel ger omedelbart avmarkerad kryssruta och inget «unsaved»-antal medan remove-POST:en är fördröjd 2 s; (3) tidigare `set_structures` för samma typ finns kvar efter Cancel och ingen `DELETE /v1/model/draft`; (4) strukturraderingen visar etiketten, exakt en dialog och ingen nyckel; (5) `Show by default` och `Country of origin` får plats (`scrollWidth <= clientWidth`).
- Bevis i `docker run --rm` på uppgiftsägt nätverk `row129c_default` (compose-projekt `row129c`) mot syntetisk Postgres 18 och Typesense 30.2, utan host-nätverk, Docker-socket eller demo-databas: serverbygge i `rust:1.93-bookworm` med named volume `row129c-cargo-home` (exit 0, 3 m 27 s); `pnpm install` med named volume `row129c-pnpm-store`; `pnpm --dir apps/web exec tsc --noEmit` exit 0; `scripts/check-english.py` exit 0; `row129c-allowed-trees-review.spec.ts` 5/5 (1,1 m); `row129-allowed-trees.spec.ts` 2/2; `structure.spec.ts` 2/2; `model-tree.spec.ts` 1/1; `attribute-table-bool-columns.spec.ts` 4/4; `drag.spec.ts` 5/5.
- `apps/web/src/data-model.tsx` är orörd (`sha256 2d3459c60dd7473f2af3c0ff15cf1fd3295b5bc1da9da0e1046905de35babcaa`). Rust-koden är orörd och ingen ny endpoint infördes. Fullscreen-grafens verktygsrad är orörd.
- Ärlig avgränsning: attributtabellen kan få horisontell scroll i smala paneler eftersom kolumnerna nu har minimibredder; etiketterna är fullt läsbara och rubrikerna har kvar sina tooltips. Cancel återställer bara de steg just den dialogen skapade; andra osparade steg finns kvar och listas i dialogen.

## Rad 129-uppföljning — reviewdialogens text, layout, fokus och laddning

Grenen `junior/129-review-followup` utgår från `origin/main` `3a2b881` (#286) och är **inte mergad, deployad eller accepterad**. Den rättar Test-avvisningen på `e7c1444` (#283): reviewdialogen för allowed trees hette **Save** och visade serverns råa rad `Type product may use food, row129_…`, kryssrutorna var `125,6 × 30 px` med etiketten under och fokusringen efter Esc blev `129,6 × 34 px` över radens högra halva, och det fanns ingen laddningsindikator under den 1–2 s långa omhämtningen innan dialogen dök upp.

- `apps/web/src/model-draft-ui.tsx`: dialogtiteln är nu `Review change` i stället för `Save`. För en allowed-tree-review byggs beskrivningen från `body.definitions`: `Allowed trees for Product: Food, Row129 81933215`. Serverns `lines[0]` används inte längre för den här typen av review, så råa typ- och trädnycklar kan inte läcka in i texten. Fallback när etiketter saknas är `object type` respektive `Structure`, aldrig nyckeln.
- `apps/web/src/model-draft-ui.tsx`: `braian-review-save` sätter en `reviewLoading`-flagga innan `draft.refetch()` startar. En `ReviewLoadingDialog` (`data-testid="review-loading"`) med samma titel och `Loading the data model…` visas direkt, och den riktiga dialogen tar över när svaret kommit. Draft-bar-knapparna Save och Discard är `disabled` medan laddningen eller dialogen är öppen; Discard har fått `data-testid="discard-draft"` för testet. Save-knappen visar också laddning när den cachade draften redan är en review.
- `apps/web/src/model-stage.ts`: ny `removeDraftSteps(indexes)` som tar bort enstaka steg med `POST /v1/model/draft/steps` och `{ remove: index }`, högsta index först. Ingen ny endpoint och ingen `DELETE /v1/model/draft`.
- `apps/web/src/model-draft-ui.tsx`: Cancel, Esc och overlay-klick går nu genom `onRevert(allowedTreeStepIndexes(body))`. Bara `set_structures`-stegen för den senast ändrade typen tas bort, så andra osparade steg i samma draft finns kvar. En draft med en unrelated `create_type` behåller det steget efter Cancel, Esc och overlay-klick.
- `apps/web/src/model-draft-ui.tsx`: öppnaren fångas innan den asynkrona omhämtningen och laddningsdialogen, och reviewdialogen stänger av den delade dialogens egen fokusåterställning (`onCloseAutoFocus`). Efter Esc fokuseras alltså samma kryssruta igen; ringen blir `20 × 20 px` i stället för `129,6 × 34 px`.
- `apps/web/src/styles.css`: `[data-testid='allowed-trees']` är en kompakt wrap-rad. Etiketten ligger bredvid rutan (`flex: none; flex-direction: row; align-items: center`), kryssrutan är `16 × 16 px` med `padding: 0` och `accent-color`, samma storlek som attributtabellens `.check`. Reglerna är scoped till allowed trees, så Singular/Plural/Key-layouten är orörd. Laddningsdialogens stängningskryss döljs.
- `apps/web/src/i18n.ts`: engelsk copy `Review change`, `Allowed trees for`, `object type` och `none`. `scripts/check-english.py` exit 0.
- `apps/web/src/model-draft-ui.test.tsx`: 18 tester. De täcker exakt titel `Review change`, `Allowed trees for Recipe: Food` utan `recipe`/`structure-food`, laddningsdialogen före reviewdialogen, disabled Save/Discard under båda, Cancel och Esc som bara tar bort allowed-tree-steget medan en unrelated `create_type` finns kvar, att ingen `DELETE /v1/model/draft` görs, samt att Save fortfarande sparar. `apps/web/src/data-model.test.tsx`: allowed-tree-testet assertar nu den nya etikettmeningen. `apps/web/src/allowed-trees-css.test.ts`: statisk CSS-kontroll av `16 × 16 px`, radlayouten och den dolda stängningsknappen.
- `apps/web/e2e/row129-allowed-trees.spec.ts`: två isolerade Playwright-tester. Det första mäter kryssrutans storlek mot attributtabellens kryssruta (`16 × 16` båda), att etiketten ligger till höger om rutan och att labelns höjd är `16 px`, fördröjer `GET /v1/model/draft` 1,2 s och ser `review-loading` före `review-dialog`, kontrollerar titel och etikettmening, att Save/Discard är disabled, att Esc inte sparar och att fokusringen är `20 × 20 px`, att Cancel-knappen inte sparar, och att Save sparar och överlever reload. Det andra testet stagingar en unrelated `create_type`, stänger med overlay-klick och assertar att bara allowed-tree-steget försvann och att `create_type`-steget är kvar.
- Mätvärden före/efter i uppgiftens scratch `metrics/`: kryssruta `125,6 × 30` → `16 × 16`, labelhöjd `52` → `16`, laddning `false` → `true`, dialogtitel `Save` respektive `Review change`, beskrivning `Type product may use food, row129_…` → `Allowed trees for Product: Food, Row129 81933215`, fokusring `129,6 × 34` → `20 × 20`.
- Bevis i `docker run --rm` på uppgiftsägt nätverk `row129fu-net` mot syntetisk Postgres 18 (`row129fu-postgres`) och Typesense 30.2 (`row129fu-typesense`), utan host-nätverk, Docker-socket eller demo-DB: serverbygge i `rust:1.93-bookworm` med named volume `row129fu-cargo-home` (exit 0, 3 m 38 s); `pnpm install` med named volume `row129fu-pnpm-store` (12,5 s); `pnpm --dir apps/web typecheck` exit 0; hela vitest-sviten 154 filer / 862 tester gröna; `row129-allowed-trees.spec.ts` 2/2 (45,2 s). Före-körningen på `origin/main` `3a2b881` med samma spec-mall gav 1/1 och skärmbilderna i `shots-before/`; mätvärdena ligger i `metrics/`.
- Rust-koden är orörd (ingen diff i `crates/`, `Cargo.toml` eller `Cargo.lock` mot basen), så inga Rust-tester kördes. Binären för e2e byggdes ändå från exakt den här worktreen i `rust:1.93-bookworm`.
- `apps/web/src/data-model.tsx` är orörd (`sha256 2d3459c60dd7473f2af3c0ff15cf1fd3295b5bc1da9da0e1046905de35babcaa`).
- Ärlig avgränsning: båda "Wanted if it fits"-punkterna fick plats. Om en draft har allowed-tree-ändringar för flera typer tar Cancel bort den senast ändrade typens steg; övriga allowed-tree-ändringar och alla andra steg finns kvar. Skärmbilderna ligger bara i uppgiftens scratch (`shots-before/`, `shots/`, `shots-after-metrics/`), inte i repot.

## Flake-hardening — kända flaky e2e-tester (test-only)

Grenen `junior/flake-hardening` ändrar **bara tester** (fem e2e-specar plus en test-hook i `scripts/e2e.mjs`); ingen produktkod, inget i `apps/web/src`. Målet är att de flaky tester som hållit tillbaka PR 285, 287 och andra ska vänta in det de faktiskt asserterar, utan att försvaga någon assertion.

- `select-source-target.spec.ts` (`:101` / tidigare `:211`): väntar på att tabellens rader ritats och pollar den persisterade vyns `source`-state i stället för att läsa den direkt efter den optimistiska etiketten. Samma förväntade värden som förut. Om radvalet släpps när Products-vyn omrenderas efter explicit All, återställs raden innan Articles-etiketten asserteras (förutsättningen, inte själva asserten).
- `focus-styles.spec.ts:1108` (användarmenyns ring): pollar den beräknade outline tills menyregeln målats innan ringens klippning mäts.
- `agent-tab.spec.ts`: sparandet i `ensureDistinctName` väntar på PATCH-svaret och på aktivitetsloggen innan nästa fråga ställs, så att mock-förslaget inte hinner bli inaktuellt; route-hanteraren i `an agent tab in another workspace is announced` tål ett avbrutet svar från den ersatta sidan (`Response has been disposed`).
- `group-filter.spec.ts:60/86`: väntar på att filterchipet är aktivt innan radantalet läses.
- `palette-drill.spec.ts:205` (`Ctrl+J asks and Tab does not`): läser alternativens ordning först när två avläsningar stämmer överens.
- `scripts/e2e.mjs`: `BRAIAN_E2E_PW_ARGS_JSON` skickar extra Playwright-argument (till exempel `--repeat-each`) till den isolerade körningen.

Bevis (docker `--rm`, uppgiftsägt nätverk `row-flake-net`, syntetisk data): `select-source-target` 20/20, `group-filter` 20/20, `palette-drill` 20/20, `focus-styles:1108` 20/20, `agent-tab` hela filen 3/3 efter sista ändringen (11 passed, 1 skipped per körning; före route-hanterarens skydd föll `:309` två gånger av ~9). Ärlig avgränsning: repeterade körningar på en belastad VPS är inte ett bevis för att flaken är borta; `agent-tab`-felen är lastberoende och kan återkomma.

## Rad 128b — objektnodens meny i Graph öppnar länkvalet

Grenen `junior/128b-object-node-links` utgår från `origin/main` `8f8d5aa` (#285) och är **inte mergad, deployad eller accepterad**. Den rättar Test-avvisningen på `8f8d5aa`: på Articles → ART-CHED-200 → Graph stängde ett klick på "Supplier" (eller "Articles" från produktnoden) bara menyn. Typnodernas "Open <Type>" fungerade redan och är oförändrat.

- Rotorsak: `graph-map.tsx` skickade `braian-add-link` med bara `linkType`, och den enda lyssnaren satt i `LinkSections` som inte är monterad i Graph-fliken. Riktningen tappades dessutom redan i `linkChoices` (den returnerade bara `key` och `label`).
- `apps/web/src/link-section.tsx`: `linkChoices` behåller nu `direction` från `sectionsFor`.
- `apps/web/src/graph-map.tsx`: menyraderna är verb med relationens etikett och en ellips, till exempel `Link Supplier…`, `Link Articles…`, `Link Replaced by…` och `Link Replaces…`. Id:t är `graph:add-link:<key>:<direction>`, så ut och in inte kan blandas ihop. `graphLinkRequest`/`runGraphNodeCommand` skickar relation, riktning, typ och det riktiga objekt-id:t vidare. `graphNodeTarget` använder nodens `objectId` i stället för det grafprefixade nod-id:t.
- Ny `apps/web/src/link-add.tsx`: delar picker → bekräfta-flödet (`LinkObjectPicker` + `LinkCreateDialog`). Graph äger sin egen instans och öppnar den direkt från menyn, utan att förlita sig på att `LinkSections` råkar vara monterad. Efter en skapad länk invalideras `object`, `objects`, `peer-links`, `link-search`, `history` och `graph` för båda ändarna. Typnoder får fortfarande bara `Open <Type>`.
- `apps/web/src/link-object-picker.tsx`: valet visar relation och sida (`Supplier · To this object`) och dialogens `aria-label` innehåller relationen. `apps/web/src/link-create-dialog.tsx` exponerar `data-choice` (`<key>:<direction>`) även när bara ett val finns, så rätt riktning kan verifieras.
- `apps/web/src/graph-map.tsx`: högerklick hit-testar mot simuleringsnodernas aktuella positioner vid själva eventet och ankrar menyn bredvid noden (`x + r + 8`, `y - r`) i stället för över nodens etikett. Tangentbordsvägen (`Ctrl+Enter`, `Shift+F10`, `ContextMenu`) använder samma ankare och samma menyrader.
- Enheter: `apps/web/src/graph-map.test.tsx` (18 tester) assertar exakta verb-etiketter för artikel- och produktnoder, att id/riktning följer med till anropet, att typnoder bara får `Open <Type>`, och att menyn inte får globala rader. Ny `apps/web/src/link-add.test.tsx` (6 tester) assertar relation/sida i pickern, att vald peer öppnar dialog för `supplier_articles:in`, samt fallback när ingen relation finns.
- E2E: ny `apps/web/e2e/row128b-object-node-links.spec.ts` (registrerad i `scripts/e2e.mjs`). Tre tester: artikelns exakta menyrader → Supplier-picker → välj en leverantör → dialog med `supplier_articles:in` → avbryt, samt Product och Replaced by; produktnodens `Link Articles…`/`Link Suppliers…`; upprepat högerklick efter hover och efter klick, och `Ctrl+Enter`/`Shift+F10`/`ContextMenu` som ger samma rader. Skärmbilder i uppgiftens scratch `shots/`: `article-node-menu.png`, `article-supplier-picker.png`, `article-supplier-create-direction.png`, `article-product-picker.png`, `product-node-menu.png`, `product-articles-picker.png`, `article-after-click-right-clicks.png`.
- Bevis i `docker run --rm` på uppgiftsägt nätverk `row128b_default` (compose-projekt `row128b`) mot syntetisk Postgres 18 och Typesense 30.2, utan host-nätverk, Docker-socket eller demo-databas: serverbygge i `rust:1.93-bookworm` med named volume `row128b-cargo-home` (exit 0, 3 m 09 s); `pnpm --dir apps/web exec tsc --noEmit` exit 0; `scripts/check-english.py` exit 0; `row128b-object-node-links.spec.ts` 3/3 (51,7 s); regressionerna `row128-type-menu.spec.ts` 5/5 och `link-picker.spec.ts` 4/4 (1 skipped). Hela vitest-sviten på `node:22-bookworm` med named volume `row128b-pnpm-store`: 155 filer / 873 tester gröna. (Samma svit under Playwrightbildens Node 26 gav en känd lokalStorage-relaterad flake i `active-row.test.tsx`; filen passerade 23/23 på Node 22.)
- Rust-koden är orörd (ingen diff i `crates/`, `Cargo.toml` eller `Cargo.lock`). `apps/web/src/data-model.tsx` är orörd (`sha256 2d3459c60dd7473f2af3c0ff15cf1fd3295b5bc1da9da0e1046905de35babcaa`).
- Ärlig avgränsning: e2e väljer en peer och verifierar dialogens relation/riktning men avbryter innan någon länk skrivs, eftersom ART-CHED-200 redan har en leverantörslänk och `supplier_articles` tillåter en. Skapandet av själva länken täcks av det befintliga `link-picker.spec.ts`-flödet.

## Rad 128c — Graph-länkflödet är exakt Details "Add link…"

Grenen `junior/128c-graph-link-flow` utgår från `origin/main` `1f44650` (#288) och är **inte mergad, deployad eller accepterad**. Den rättar Test-avvisningen på `1f44650`: Graph-menyerna öppnade en egen picker, men dialogen visade källans råa UUID, kandidaterna var inte filtrerade och menyn/dialogen kunde täcka noden vid högerkanten.

- En gemensam implementation: `apps/web/src/link-section.tsx` använder nu `LinkAddFlow` i stället för egna `LinkObjectPicker`/`LinkCreateDialog`. Detail och Graph öppnar därför samma picker, samma bekräftelsedialog och samma skrivning. `LinkAddFlow` tar emot källans nyckel/namn (Detail från objektet, Graph från nodens `Number`-egenskap och caption) och befintliga länkar, så båda vägarna visar samma text och samma kandidater.
- `apps/web/src/link-create-dialog.tsx`: dialogens slut visas som `<källa> · <namn> — <relation> — <peer> · <namn>`, till exempel `PROD-CHOC · Dark chocolate 70% — Suppliers — SUP-NORTH · Northmill Foods`. Ingen UUID kan visas: `linkEndLabel` och pickerns rader använder `visibleText`, som döljer UUID-liknande värden. Flera peers visar relationen per rad. Details centrerade dialog är oförändrad.
- `apps/web/src/link-choices.ts`: `LinkChoice` bär `targetTypes` (motpartens typ(er) från definitionerna). Ny `filterLinkCandidates` filtrerar sökträffar och Recent på dessa typer, och `existingLinkPeerIds` ger redan länkade peers för exakt relation och riktning. Både Detail och Graph får därför bara relationens måltyp och aldrig källan eller en redan länkad peer, även i Recent.
- `apps/web/src/link-object-picker.tsx`: kandidater filtreras på `targetTypes`; Recent använder samma frecency/minne som förut men rensas på typ, UUID-text och uteslutna id:n. Crumben namnger objektet (`Add link… · PROD-CHOC · Dark chocolate 70% · Suppliers · From this object`), identiskt från Detail och Graph.
- `apps/web/src/graph-map.tsx`: varje objektnod bygger menyrader från sin egen `typeKey` via `linkChoices`/`sectionsFor`; artikel-, produkt- och leverantörsnoder får olika verb. Nodens `sourceKey`/`sourceName` följer med i `LinkAddRequest`. Layoutuppdateringen kopierar nu även `typeKey`/`typeName` till befintliga simuleringsnoder, så en peer som fått sin typ efter namnuppslaget inte behåller en tom/gammal typ. Menyn får en exkluderingsrektangel för nodcirkel + etikett.
- `apps/web/src/shared-context-menu.tsx`: `placeContextMenu` tar emot `avoid` och provar höger, vänster, under och över innan den väljer minst överlapp. Graph-menyerna (högerklick och tangentbord) använder samma rektangel. Vid högerkant flyttas menyn till vänster om noden i stället för att täcka den.
- Graph-dialogen dockar till motsatt sida/hörn av graph-ytan med `graphDialogStyle` (24 px marginal, bredd begränsad till utrymmet på motsatt sida). Details dialog är fortfarande centrerad.
- `apps/web/src/graph-scene.ts`: `sentenceCaseLabel` används för API:ets relationsetiketter, så `supplier of product n-n` blir `Supplier of product n-n` och alla kantetiketter följer samma versalisering.
- Enheter: uppdaterade `graph-map.test.tsx` (menyer för artikel/product/supplier skiljer sig och följer detaljsektionerna, källnyckel/caption, exkluderingsrektangel), `link-choices.test.ts` (`targetTypes`, kandidat-/peerfilter, UUID-skydd), `link-add.test.tsx` (källa och relation i picker, båda ändar i dialog), `link-create-dialog.test.tsx` (mänskliga ändar utan UUID, dockning mot nod), `shared-context-menu.test.tsx` (placering vid högerkant och över/under) och `graph-scene.test.ts` (sentence case). Hela vitest-sviten: 155 filer / 885 tester gröna.
- E2E: ny `apps/web/e2e/row128c-graph-link-flow.spec.ts` (registrerad i `scripts/e2e.mjs` med `measuredSeconds: 300`). Tre tester: (1) artikel-, produkt- och leverantörsnoden i ART-CHOC-100-grafen får olika menyer som matchar Details sektionslistor; (2) Detail och Graph jämförs rad för rad för tom fråga (Recent) och skriven fråga, kandidater filtreras till leverantörer, `PROD`/`ART` ger tomt, redan länkad peer saknas, och `PROD-CHOC` → `SUP-NORTH` skapas via `product_suppliers` (many-many), får en `Suppliers`-kant, erbjuds inte igen och tas bort via API i testet; (3) meny och dialog vid högerkanten överlappar inte nodcirkeln/etiketten och ligger inom viewporten. Vald relation/objektpar: `PROD-CHOC` (Dark chocolate 70%) → `SUP-NORTH` (Northmill Foods); `product_suppliers` är many-many och PROD-CHOC saknade leverantör i seed. ART-CHOC-100 användes bara för läsning eftersom den redan har sin produkt och leverantör.
- Regressioner som uppdaterades eftersom texten/valet medvetet ändrats: `link-picker.spec.ts` använder nu en sektion vars måltyp matchar det sökta objektet och assertar att en sektionspicker inte erbjuder andra typer; `link-drag.spec.ts` förväntar relationsorden `— Articles —` i stället för en bar `←`. `row128b-object-node-links.spec.ts` och `row128-type-menu.spec.ts` är oförändrade och gröna.
- Bevis i `docker run --rm` på uppgiftsägt nätverk `row128c_default` (compose-projekt `row128c`) mot syntetisk Postgres 18 och Typesense 30.2, utan host-nätverk, Docker-socket eller demo-databas: serverbygge i `rust:1.93-bookworm` med named volume `row128c-cargo-home` (exit 0, 3 m 27 s); `pnpm --dir apps/web exec tsc --noEmit` exit 0; `scripts/check-english.py` exit 0; `row128c-graph-link-flow.spec.ts` 3/3 (1,2 m); `row128b-object-node-links.spec.ts` 3/3; `row128-type-menu.spec.ts` 5/5; `link-picker.spec.ts` 4/4 (1 skipped); `link-drag.spec.ts` 11/11 (1 skipped); `link-types.spec.ts` 3/3; `design-polish-low-rows.spec.ts` 2/2. Vitest på `node:22-bookworm` med named volume `row128c-pnpm-store`: 155 filer / 885 tester gröna.
- Skärmbilder i uppgiftens scratch `shots/`: `article-menu.png`, `product-menu.png`, `supplier-menu.png`, `graph-picker-recent.png`, `graph-create-dialog.png`, `graph-edge-created.png`, `right-edge-menu.png`, `right-edge-dialog.png`.
- Rust-koden är orörd (ingen diff i `crates/`, `Cargo.toml` eller `Cargo.lock`). `apps/web/src/data-model.tsx` är orörd (`sha256 2d3459c60dd7473f2af3c0ff15cf1fd3295b5bc1da9da0e1046905de35babcaa`). Fullscreen-grafens verktygsfält (rad 220) är orört.
- Ärlig avgränsning: den befintliga invalid-dialogen för par utan länktyp nås inte längre via Detail/Graph-pickern, eftersom kandidaterna nu filtreras till relationens måltyp. Den vägen finns kvar för drag och "Link selected to…" och testas fortfarande i `link-drag.spec.ts`; `link-picker.spec.ts` testar i stället att fel typ aldrig erbjuds.

## Rad 128d — länkflödet: bred dialog, centrerad graf-dialog, fokus, kantetiketter och menyplacering

Grenen `junior/128d-link-flow-polish` utgår från `origin/main` `80a0844` (#290) och är **inte mergad, deployad eller accepterad**. Den rättar Test-avvisningen på `80a0844`: create-dialogen var cirka 340 px bred med horisontell scroll och klippta Cancel/Confirm, Graph-dialogen låg i ett hörn i stället för centrerad, Esc från tangentbordsmenyn/pickern tappade fokus till noden, legendraden kunde scrolla bort, kantetiketterna syntes inte, och nodmenyn vid högerkanten kunde täcka granncirklar/etiketter och klippa nodens egen etikett.

- `apps/web/src/link-create-dialog.tsx` + `apps/web/src/styles.css`: create-dialogen är `min(640px, 100vw - 48px)` med `box-sizing: border-box`, `link-end` får radbrytas och `dialog-actions` får wrappa. `graphDialogStyle` (hörndockning) är borttagen och ersatt av `placeDialog`: dialogen utgår från samma centrering som Detail och flyttas bara längs en axel, minsta möjliga, när den klickade nodens cirkel/etikett annars skulle täckas. Den stannar inom viewporten och hamnar aldrig i en annan panels hörn.
- `apps/web/src/link-add.tsx`: öppnaren fångas vid render innan pickerns `autoFocus` hinner flytta fokus, så Esc från pickern återställer fokus till noden/knappen. Både den återställningen och menyens stängning använder `focus({ preventScroll: true })`, så en fokuserad graf nod inte scrollar legend-/chipraden.
- `apps/web/src/graph-edge-label.ts` + `apps/web/src/graph-map.tsx`: `edgeLabelMode` visar alla kantetiketter på en läsbar graf (högst 10 kanter och zoom ≥ 0,55), bara den aktiva nodens kanter på en tät graf och inga när grafen är utzoomad. Etiketterna ritas i den stillastående bilden (inte under simuleringsticken, vilket höll stora expansioner kvar i rörelse) och publiceras som `data-shown` på `graph-edges` för testet.
- `apps/web/src/graph-map.tsx` + `apps/web/src/shared-context-menu.tsx`: canvas publicerar mätta etikettrektanglar (`data-label-*`), etiketter klampas innanför panens kant, och menyn får alla synliga nodcirklar + etikettrektanglar som hinder. Placeringen provar fler positioner runt varje hinder och en grov rutnätssökning, väljer noll överlapp och annars minst överlapp, fortfarande inom viewporten.
- `apps/web/src/command-registry.ts`: den dubblerade `link:open-peer` är borttagen; länkradens meny har kvar `object:open` som enda **Open**. `link-section.tsx` registrerar inte längre den oanvända körningen.
- Enheter: `placeDialog` (centrering, minimal förskjutning, viewport), `edgeLabelMode`, mätta/klampade etikettrektanglar, `nodeObstacles`, menyplacering mot flera hinder (noll överlapp och minst överlapp) samt en enda **Open** i länkmenyn.
- E2E: ny `apps/web/e2e/row128d-link-flow-polish.spec.ts` (registrerad i `scripts/e2e.mjs` med `measuredSeconds: 300`). Fem tester: (1) Detail och Graph skapar en länk med **Confirm utan `force`** och assertar bredd, `scrollWidth <= clientWidth`, radbrutna ändar och synliga Cancel/Confirm; (2) Graph-dialogens centrum ligger inom 2 px från viewportens centrum som Details och täcker inte noden; (3) fokus på en nod stannar genom `Ctrl+Enter`/`Shift+F10`/`ContextMenu`, Esc från meny och picker, och legendens `scrollLeft` är 0 med chipsen synliga; (4) en ny länk får en läsbar `Supplier`-kantetikett (`data-shown=true`) efter hover på ändpunkten; (5) menyn vid högerkanten överlappar ingen nodcirkel och ingen etikett, och alla etiketter ligger innanför panen. Testlänkarna tas bort via API.
- Bevis i `docker run --rm` på uppgiftsägt nätverk `row128d_default` (compose-projekt `row128d`) mot syntetisk Postgres 18 och Typesense 30.2, utan host-nätverk, Docker-socket eller demo-databas: serverbygge i `rust:1.93-bookworm` med named volume `row128d-cargo-home` (exit 0, 3 m 47 s); `pnpm --dir apps/web exec tsc --noEmit` exit 0; `scripts/check-english.py` exit 0; `row128d-link-flow-polish.spec.ts` 5/5 (1,3 m); `row128c-graph-link-flow.spec.ts` 3/3; `row128b-object-node-links.spec.ts` 3/3; `row128-type-menu.spec.ts` 5/5; `link-picker.spec.ts` 4/4 (1 skipped); `link-drag.spec.ts` 11/11 (1 skipped); `link-types.spec.ts` 3/3; `design-polish-low-rows.spec.ts` 2/2; `create-dialog.spec.ts` 12/12; `context-menu-placement.spec.ts` 1/1. Vitest: 156 filer / 899 tester gröna.
- `graph.spec.ts` "force-directed graph" når inte `data-settled=true` inom 15 s på den här VPS:en. Samma timeout reproducerades med `origin/main`s `graph-map.tsx` i samma isolerade miljö, så det är en befintlig tidsgräns-/belastningsflake och inte en 128d-regression; den ingår inte i 128/128b/128c-regressionerna.
- Rust-koden är orörd (ingen diff i `crates/`, `Cargo.toml` eller `Cargo.lock`). `apps/web/src/data-model.tsx` är orörd (`sha256 2d3459c60dd7473f2af3c0ff15cf1fd3295b5bc1da9da0e1046905de35babcaa`). Fullscreen-grafens verktygsfält (rad 220) är orört.
- Ärlig avgränsning: kantetiketter ritas först i den stillastående bilden (annars blir stora expansioner märkbart långsamma); på en tät graf visas bara den aktiva nodens kanter. Menyns rutnät är avsiktligt grovt och kan i ett helt packat läge fortfarande välja minst överlapp. Graf-dialogen klampas till viewporten, inte till den mindre graph-ytan.

## Rad 128e — länkpickern överst i flerpanelsarbetsytor, kantetiketter och stabil grafliknande

Grenen `junior/128e-picker-on-top` utgår från `origin/main` `0adeebe` (#293) och är **inte mergad, deployad eller accepterad**. Den rättar Test-avvisningen på `4ad263e`: Detail-pickern låg kvar i `section.pane` (`isolation: isolate` + `overflow: hidden`), så grannpaneler målade över den, musen träffade en tabellcell och sökfältet kunde få tangentbordet från tabellfiltret. Samma retest visade kantetiketter som bara syntes efter hover, staplade etiketter kring hubben, hel omlayout vid länkändringar, en tangentbordsmeny cirka 190 px från noden och en meny som kunde bryta ut ur en liten Graph-panel.

- `apps/web/src/components/ui/portal.tsx`: ny liten `Portal` som renderar på `document.body`. `LinkObjectPicker` använder den, så `.palette` ligger över varje panel men behåller `:root`-tema, `data-testid`, `#link-picker-list`, `aria-*` och `role="dialog"`. Create-dialogen använde redan Radix portal och menyn har sin egen top-level host; de är oförändrade. Sökfältet får verkligen fokus, Tab/Shift+Tab stannar i pickern, Esc stänger och fokuserar tillbaka öppnaren, och bakgrundsklick stänger. Pickerns relationsrad visar nu relationen som en chip (t.ex. `Replaced by`) med samma text som förut.
- `apps/web/src/graph-map.tsx`: kantetiketter ritas i den stillastående bilden utan hover, inte bara för den aktiva ändpunkten. De sorteras efter prioritet och en lägre prioriterad etikett som inte får plats **döljs i stället för att staplas**; en nodetikett som skulle hamna under en kantetikett döljs också. Etiketterna räknas om från aktuella nodpositioner varje drag/rörelse, så de följer kanten och lämnar ingen gammal platta kvar, och en ny länk får sin etikett. Vid zoom publiceras nodernas mätta positioner igen så `data-x`/`data-y` och etiketterna inte glider isär.
- `apps/web/src/graph-map.tsx`: en ny nod placeras bredvid grannen den länkades från. En länk- eller dataändring som bara lägger till noder ritar om utan att starta om kraftsimuleringen; befintliga noder behåller exakt sina positioner. Kameran återfitas bara vid en uttrycklig expansion eller det första intrycket, inte vid varje uppdatering. `Relayout` är fortfarande en uttrycklig full omlayout.
- `apps/web/src/graph-map.tsx` + `apps/web/src/shared-context-menu.tsx`: tangentbordsmenyn (`Shift+F10`/`ContextMenu`) och högerklick använder nodens levande simuleringsposition, inte en publicerad markör som kan släpa efter. Menyns hinderlista innehåller nu även kantetiketternas rektanglar. Menyn kan ges panens `bounds`, stannar innanför den lilla Graph-panelen (krymper och scrollar vid behov) och väljer en ledig plats nära noden.
- Enheter: `Portal` (body-render, tema/klass bevarad, explicit container), `placeContextMenu` med `bounds`, samt befintliga graf-/menytester. `data-label-*` på `graph-edges` används av E2E för strikta rektanglar.
- E2E: ny `apps/web/e2e/row128e-picker-on-top.spec.ts` (registrerad i `scripts/e2e.mjs` med `measuredSeconds: 300`). Tre tester i en arbetsyta med fyra respektive fem paneler: (1) Detail-pickern ligger på `body`, `elementFromPoint` i optionens mitt träffar pickern, sökfältet får tangentbordet medan tabellfiltret är orört, ett riktigt musklick väljer och Confirm skapar länken, Tab/Shift+Tab stannar inne, Esc fokuserar Add link, overlay stänger, och Graph-menyn öppnar samma picker; (2) kantetiketter syns utan hover, inga etikettrektanglar överlappar, befintliga nodpositioner är oförändrade (±2 px) när en ny nod/länk kommer och den nya noden hamnar nära grannen, och etiketten följer en dragen nod; (3) `Shift+F10` och högerklick i en cirka 200 px bred Graph-panel öppnar menyn nära noden, innanför panelen och utan att täcka någon etikett. Testlänkarna tas bort via API.
- Bevis i `docker run --rm` på uppgiftsägt nätverk `row128e_default` (compose-projekt `row128e`) mot syntetisk Postgres 18 och Typesense 30.2, utan host-nätverk, Docker-socket eller demo-databas: serverbygge i `rust:1.93-bookworm` med named volume `row128e-cargo-home` (exit 0, 4 m 40 s); `pnpm --dir apps/web exec tsc --noEmit` exit 0; `scripts/check-english.py` exit 0; `row128e-picker-on-top.spec.ts` 3/3 (1,5 m); `row128d-link-flow-polish.spec.ts` 5/5; `row128c-graph-link-flow.spec.ts` 3/3; `row128b-object-node-links.spec.ts` 3/3; `row128-type-menu.spec.ts` 5/5; `link-picker.spec.ts` 4/4 (1 skipped); `link-drag.spec.ts` 11/11 (1 skipped); `row129-allowed-trees.spec.ts` 2/2; `row129c-allowed-trees-review.spec.ts` 5/5; `row129d-allowed-trees-polish.spec.ts` 6/6. Vitest: 160 filer / 924 tester gröna.
- `graph.spec.ts` "force-directed graph" når fortfarande inte `data-settled=true` inom 15 s på den här VPS:en. Samma timeout reproducerades med `origin/main`s `graph-map.tsx` i samma isolerade miljö, så det är en befintlig tidsgräns-/belastningsflake och inte en 128e-regression. Den ingår inte i 128/129-regressionerna ovan.
- Rust-koden är orörd (ingen diff i `crates/`, `Cargo.toml` eller `Cargo.lock`). `apps/web/src/data-model.tsx` är orörd (`sha256 2d3459c60dd7473f2af3c0ff15cf1fd3295b5bc1da9da0e1046905de35babcaa`). Demoetiketterna för `product_suppliers` och fullscreen-grafens verktygsfält (rad 220) är orörda.
- Ärlig avgränsning: på en mycket tät graf kan den lågprioriterade etiketten helt döljas i stället för att visas; det är avsiktligt för att aldrig stapla. Menyns placering i en liten panel kan hamna några tiotal px från nodetiketten när kantetiketter blockerar alla närliggande ytor, men den stannar i panelen. Kantetiketterna ritas inte under en pågående kraftsimulering (endast vid stillastående bild eller drag), av prestandaskäl.

## Rad 128f — kameran står still, etiketter där de behövs, menyn intill noden

Grenen `junior/128f-graph-camera` utgår från `origin/main` `fd1cbcf` (#295) och är **inte mergad, deployad eller accepterad**. Den rättar Test-avvisningen på `be7048d`: ett nodrag kunde passas om kameran från zoom 1,38 till 0,35 så alla etiketter försvann, ett klick kunde flytta hubben 20–80 px, kantetiketter saknades vid standardzoom 0,44, Tangentbord/Shift+F10 kunde ge Chromes meny, nodetiketter klipptes vid panens kant, menyn hamnade 66–81 px från noden och länkväljaren låg under en maximerad graf.

- `apps/web/src/graph-map.tsx`: `fit()` anropas bara vid första intrycket/fokusbyte och från **Fit**/**Re-layout**. `useLayoutEffect`-passningen på `[density, sheet, placement, full, selected]` är borttagen, canvas-`ResizeObserver` ritar och publicerar mätta rektanglar men passar aldrig om kameran, och expansion sätter inte längre `fitAfterRef`. Ett nodtryck pinnar inte förrän pekaren faktiskt rört sig mer än 3 px, så ett klick startar ingen kraftsimulering; `Unpin` släpper bara noden och startar ingen omlayout. Hover/fokus/fullskärm ritar om utan att flytta noder.
- `apps/web/src/graph-edge-label.ts`: zoomtröskeln 0,55 är borta. Högst 10 kanter visar alla etiketter även vid passad standardzoom; tätare grafer visar den valda/hovrade/fokuserade nodens kanter. Kring den fokuserade ändpunkten ritas en etikett per relationstyp (t.ex. en `Has`), så `Has`/`From type` aldrig staplas. Kollisionspassningen döljer fortfarande lågprioriterade etiketter i stället för att stapla.
- `apps/web/src/graph-chrome.ts` + `graph-map.tsx`: `placeNodeLabel` håller nodtexten innanför panen och vänder den ovanför cirkeln när underkanten skulle klippas; en etikett som är bredare än panen ritas inte alls (hellre ingen platta än en klippt). `data-label-*` publiceras med samma rektangel.
- `apps/web/src/graph-map.tsx`: `Shift+F10`/`ContextMenu` konsumeras alltid på canvas och på varje nod, även en värdenod utan menyåtgärder; tangentbordsmenyn på en nod fokuserar nodens a11y-knapp, så Esc från en musöppnad meny ger synlig fokusring. Pilarna flyttar markeringen även när en nodknapp har fokus.
- `apps/web/src/shared-context-menu.tsx`: menyplaceringen glider längs varje sida (flera vertikala/horisontella lägen) och provar närgaps 4–16 px innan rutnätet; `bounds` klämmer fortfarande menyn till panen. Nodcirkeln är ankare för närheten medan nodetiketten och kantetiketterna ligger kvar som hinder; dialogankaret använder fortfarande cirkel + etikett.
- `apps/web/src/styles.css`: menyn (`36`), undermenyn (`37`) och länkväljaren (`.palette`, `38`) ligger över `.graph-full` (`35`) men under overlay (`40`) och dialog (`41`), så väljare, meny och create-dialog fungerar i maximerad graf.
- Enheter: `placeContextMenu` med `bounds` (klamp, närgaps, hinder, liten yta), `placeNodeLabel` (under/ovan, subtitle, klamp i liten ram) och `edgeLabelMode` (liten graf i vila, tät graf oberoende av zoom, modellgraf alltid).
- E2E: ny `apps/web/e2e/row128f-graph-camera.spec.ts` (registrerad i `scripts/e2e.mjs` med `measuredSeconds: 480`). Sju tester: (1) kameran står kvar genom zoom+drag, klick, hover, fokus, Unpin, fullskärm och viewportbyte, och alla befintliga noder flyttar högst 1 px; (2) vald/hovrad/fokuserad nods kantetiketter finns i vila vid passad zoom och inga etiketter överlappar, även på ART-CHOC-100; (3) Tab når canvas och noder i en smal panel, pilar byter markering, Shift+F10 på värdenod/tom canvas konsumeras, och Esc från en musöppnad meny fokuserar noden med synlig ring; (4) nodetiketter ligger innanför panen även efter pan och när hubben dras till underkanten; (5) legend och länkantal uppdateras direkt efter Add link och Remove link utan F5; (6) väljare, meny och create-dialog ligger över `.graph-full` och menyn stannar innanför ytan; (7) menyn ligger inom 16 px från nodkanten när panen har fri yta. Testlänkar tas bort via API och egna öppna förslag discardas.
- Bevis i `docker run --rm` på uppgiftsägt nätverk `row128f_default` (compose-projekt `row128f`) mot syntetisk Postgres 18 och Typesense 30.2, utan host-nätverk, Docker-socket eller demo-databas: serverbygge i `row128f-e2e-pw:local` med named volume `row128f-cargo-home` (exit 0, 3 m 51 s); `pnpm --dir apps/web exec tsc --noEmit` exit 0; `scripts/check-english.py` exit 0; `row128f-graph-camera.spec.ts` 7/7 (2,5 m); `row128-type-menu.spec.ts` 5/5, `row128b-object-node-links.spec.ts` 3/3, `row128c-graph-link-flow.spec.ts` 3/3, `row128d-link-flow-polish.spec.ts` 5/5, `row128e-picker-on-top.spec.ts` 3/3, `context-menu-placement.spec.ts` 1/1, `row129-allowed-trees.spec.ts` 2/2, `row129c-allowed-trees-review.spec.ts` 5/5, `row129d-allowed-trees-polish.spec.ts` 6/6, `row129e-allowed-trees-input.spec.ts` 5/5. Vitest: 160 filer / 939 tester gröna.
- Rust-koden är orörd (ingen diff i `crates/`, `Cargo.toml` eller `Cargo.lock`). `apps/web/src/data-model.tsx` är orörd (`sha256 2d3459c60dd7473f2af3c0ff15cf1fd3295b5bc1da9da0e1046905de35babcaa`). Demoetiketterna för `product_suppliers` och fullscreen-grafens verktygsfält (rad 220) är orörda.
- Ärlig avgränsning: på en mycket tät graf kan kanten eller den egna nodetiketten blockera alla platser inom 16 px, och då väljs en längre men ledig plats; E2E:t för den hårda 16 px-gränsen gömmer därför värde-/grupp-/strukturlegenderna för att bevisa ett läge med verklig fri yta. En nodetikett bredare än panelen ritas inte (klipps inte). Kantetiketter ritas fortfarande bara i stillastående bild eller under drag.

## Rad 128g — rätt meny på rätt nod, 16 px-hugg i panel och fullskärm, kamera-fit tills användaren flyttar den

Grenen `junior/128g-graph-menu-fit` utgår från `origin/main` `a726591` (#299, med #297/#298/#296) och är **inte mergad, deployad eller öppnad som PR**. Den rättar Test-avvisningen på `580f972` (#296) och är sista rundan på 128. Bara de sex acceptanskriterierna är byggda.

- `apps/web/src/graph-map.tsx`: **rätt meny på rätt nod.** Tryck på en nod flyttar nu tangentbordsfokus till nodens a11y-knapp (bara ett klick, inte ett drag), så nästa `Shift+F10` öppnar samma nods meny. Värdenoder får en egen `Open value`-åtgärd (`graph:value:open`) i stället för att sakna meny; artikel- och leverantörsnoder behåller sina typmenyer. Både pekarmeny och tangentbordsmeny ankrar nu på **cirkel + mättext** (nodens kant) och skickar samma rect som hinder, så menyn aldrig täcker sin egen nod.
- `apps/web/src/shared-context-menu.tsx`: menyn behåller den **mätta** positionen efter att fokus flyttats mellan menyrader (tidigare återställdes den till den grova reservpositionen vid re-render, vilket gav 77–96 px gap). Placeringen väljer först en ledig plats inom 16 px, därefter en plats inom 16 px som aldrig täcker den egna noden men får täcka en annan etikett i en trång graf, och först därefter en längre ledig plats. Med legenderna synliga och i maximerad vy ligger menyn inom 16 px i E2E:t.
- `apps/web/src/graph-map.tsx`: **kameran passar om** vid första laddning, Re-layout, in/ut ur fullskärm och panelresize så länge `movedRef` är falsk. Efter användarens zoom eller pan (och efter nodrag) ritas bara aktuell transform; fullskärmsbytet passar dessutom om i nästa frame och efter 60 ms när panelens krom fått sin nya storlek. Den gamla 128e-regressionen (nodrag nollställde zoom) är kvar skyddad.
- `apps/web/src/graph-map.tsx`: **Pin/Unpin stannar på kortet och växlar.** En ny `Pin`-knapp (`graph-pin`) sätter noden på plats; `Unpin` (`graph-unpin`) släpper den utan omlayout, så samma nod kan pinnas igen.
- `apps/web/src/graph-map.tsx`: **högerklick på tom canvas** konsumerar alltid webbläsarmenyn och öppnar vår meny med `Fit`/`Re-layout` (samma körningar som verktygsfältet). Esc lämnar canvasen fokuserad med synlig ring; `canvas.graph:focus` har samma accentring som `:focus-visible`.
- Kantetiketter är oförändrade från 128f (högst 10 kanter i vila, en etikett per relationstyp kring vald/hovrad/fokuserad nod, kollision döljer hellre än staplar). Nya E2E:t kontrollerar den **ritade** texten via `data-shown` + `data-label-*` för vald och hovrad nod, samt att viloetiketterna på en gles graf inte överlappar varandra eller nodtexter.
- `apps/web/src/i18n.ts`: `pin: 'Pin'` och `openValue: 'Open value'` (engelska UI-texter). `apps/web/src/data-model.tsx` och `product_suppliers`-etiketterna är orörda; rad 220 (fullskärmens verktygsfält) är inte byggd.
- Medvetet uppdaterade äldre specar, eftersom beteendet ändrats enligt kriterierna: `row128-type-menu` förväntar nu vår `Fit`/`Re-layout`-meny på tom canvas i stället för ingen meny; `row128d` och `row128e` kräver fortfarande att menyn aldrig täcker sin egen nod men tillåter att en trång graf täcker en annan etikett, och de mäter nu **16 px** i stället för 96 px; `row128f` förväntar en `Open value`-meny på värdenoden och 16 px i stället för 96 px. Inga toleranser har slappats.
- E2E: ny `apps/web/e2e/row128g-graph-menu-fit.spec.ts` (registrerad i `scripts/e2e.mjs` med `measuredSeconds: 480`). Sex tester: (1) Shift+F10 och högerklick på värde-, artikel- och leverantörsnod öppnar respektive nods meny intill noden, och ett musklick flyttar fokus så nästa Shift+F10 öppnar samma nod; (2) menyn ligger inom 16 px med legenderna synliga i panel och maximerad vy; (3) kameran passar vid första laddning, Re-layout, in/ut ur fullskärm och resize men står still efter användarzoom, fullskärm, resize och nodrag; (4) Pin/Unpin växlar samma nod; (5) vald och hovrad nods kantetiketter är ritade utan överlapp med varandra eller nodtexter, och en gles graf visar etiketter i vila; (6) tom canvas konsumerar `contextmenu` (`defaultPrevented`) och visar bara `Fit`/`Re-layout` (eller inget), och Esc lämnar synlig fokusring. Inga länkar skapas; egna öppna förslag städas om något skulle uppstå.
- Före fixen, mot ofixad `origin/main` i samma miljö: nya specen föll 6/6 på rätt sätt — menygap 82/88 px med legenderna synliga, ingen fullskärmsfit (grafens höjd 0,55 → 0,89 men zoom stod kvar 0,54), ingen Pin-knapp efter Unpin, ingen `Open value`-meny, och `contextmenu` på tom canvas var inte `defaultPrevented` (Chrome-menyn). Loggen ligger i uppgiftens scratch `logs/row128g-before.log`.
- Bevis i isolerad compose-projekt `row128g` (Postgres 18 på 127.0.0.1:25452, Typesense 30.2 på 127.0.0.1:28152) och API/Vite på dedikerade loopback-portar 25455/25453, utan demo-databas eller Track B-resurser: `cargo build -p braian-server` i worktreet (exit 0, 3 m 30 s); `pnpm --dir apps/web exec tsc --noEmit` exit 0; `scripts/check-english.py` exit 0; hela vitest-sviten 160 filer / 945 tester gröna; `row128g-graph-menu-fit.spec.ts` 6/6 (2,0 m). Regressionerna körda tillsammans i samma projekt: `row128-type-menu.spec.ts` 5/5, `row128b-object-node-links.spec.ts` 3/3, `row128c-graph-link-flow.spec.ts` 3/3, `row128d-link-flow-polish.spec.ts` 5/5, `row128e-picker-on-top.spec.ts` 3/3, `row128f-graph-camera.spec.ts` 7/7 och nya `row128g-graph-menu-fit.spec.ts` 6/6 — 32/32 (cirka 9,5 m).
- Ärlig avgränsning: i en mycket trång panel kan menyn behöva täcka en annan nods etikett för att komma inom 16 px; den täcker aldrig sin egen nod. Det är den medvetna avvägningen i kriterium 2, och äldre specar är uppdaterade därefter. Tab-ordning/pilar, klippning i ~250 px-panel, Remove link i grafen, nya noders överlapp, tom väljartext, Cancel-fokus, zoomindikator, info-kort över Nutri-Score och rad 220 är inte byggda.

## Rad 212b — inaktiva Save all/Discard all neutrala, läsbara och utan felaktig stängd-text

Grenen `junior/212-disabled-polish` utgår från `origin/main` `45e16c4` (#284) och är **inte mergad, deployad eller accepterad**. Den rättar Test-avvisningen på `45e16c4`: på ett slutet förslag hade **Discard all** fortfarande danger-fyllning (`rgb(91,53,67)` med rosa text), hover-tooltipen kunde aldrig visas eftersom knappen har `pointer-events: none`, och ett nyss valt `discarded`-förslag hann visa **Proposal already closed** innan raderna laddats. Förklaringstexten var dessutom 11 px och för låg kontrast.

- Rotorsak 1: `apps/web/src/styles.css` gav `.btn-danger:disabled` egna rosa `--danger-disabled-*`-tokens i stället för samma neutrala fyllning som `.btn-raised:disabled`. I ljust tema överskrevs dessutom den neutrala disabled-regeln av den generiska ljusa knappregeln, som inte undantog `:disabled`.
- Rotorsak 2: `title` låg på den `disabled` knappen. `disabled:pointer-events-none` gör att hover aldrig når den, så webbläsaren visar ingen tooltip.
- Rotorsak 3: `closedProposalReason` föll tillbaka på `Proposal already closed` när status och rader ännu inte var kända. `ProposalView` renderade därför den texten innan detaljfrågan hunnit svara.
- Rotorsak 4: `.proposal-actions-reason` använde `--muted` och `--text-sm` (11 px).
- `apps/web/src/styles.css`: disabled `.btn-danger` får nu exakt samma `background: var(--raised)`, `border-color: transparent`, `color: var(--text-2)` och `opacity: 0.8` som disabled `.btn-raised`, med en explicit regel även för ljust tema. `--danger-disabled-bg/-text` är borttagna. Den ljusa generiska knappregeln och dess hover-regel gäller bara `:not(:disabled)`, så de kan inte längre skriva över inaktiva actionknappar. Enabled Discard all behåller `--danger` i båda teman.
- `apps/web/src/styles.css`: `.proposal-actions` är en `inline-flex`-wrapper. `.proposal-actions-reason` är 13 px (`--text-base`) och använder `--text-2`; uppmätt kontrast enligt WCAG-formeln blir `10,76:1` i mörkt tema (`#c3cad6` på `#111827`) och `10,31:1` i ljust (`#374151` på `#ffffff`).
- `apps/web/src/proposal-actions.tsx`: `ProposalBulkActions` har en `loading`-flagga. Medan den är satt är båda knapparna disabled, ingen felaktig orsak renderas och i stället visas `Loading proposal…`. Den synliga orsaken ligger kvar i en `span` med `id`, och båda knapparna pekar på den via `aria-describedby`. `title=reason` ligger nu på den nya wrappern `data-testid="proposal-actions"`, så hover över en disabled knapp visar förklaringen. `closedProposalReason` returnerar `null` när status/rader är okända; `Proposal already closed` kräver fortfarande både `accepted`- och `rejected`-rader.
- `apps/web/src/panes.tsx`: `ProposalView` skickar `proposal.isPending` som `loading`. `apps/web/src/palette.tsx`: Ctrl+K-förhandsvisningen skickar `!proposal.status` som `loading`, och Save all är bara `primary` när förslaget har en `pending`-rad; annars är den neutral som Discard all.
- `apps/web/src/i18n.ts`: engelsk copy `Loading proposal…`.
- `apps/web/src/proposal-closed.test.tsx`: nio tester. Accepted, discarded och blandat assertar samma computed `background`, `border`, `color` och `opacity` för båda knapparna, wrapper-`title`, `aria-describedby`, 13 px och kontrast `>= 4,5:1` i båda teman. Ett fördröjt detaljsvar assertar `Loading proposal…`, att ingen orsak eller wrapper-title visas och att `Proposal already closed` aldrig förekommer; därefter `Proposal already discarded`. Pending assertar båda enabled, ingen orsak/title och att Discard all fortfarande är `btn-danger`. Ett rent funktionstest visar att endast blandade rader ger `Proposal already closed`. Palettens test-id:n täcker samma komponent, inklusive loading.
- `apps/web/e2e/proposal-lifecycle.spec.ts`: fyra tester. Det utökade livscykeltestet kontrollerar samma computed fyllning, border, text och opacitet, wrapper-title, `inline-flex`/blockifierad `flex`, 13 px och `>= 4,5:1` kontrast för accepterat (mörkt och ljust), avvisat (mörkt och ljust) och blandat (mörkt). Pending kontrollerar att Discard all är danger-färgad och att ingen title finns. Ett nytt test fördröjer `GET /v1/proposals/{id}` med 1,5 s, väljer ett `discarded`-förslag och observerar DOM från klick till stabilt läge: loading visas, ingen `Proposal already closed` förekommer, och först därefter visas `Proposal already discarded`. Det befintliga testet för andra disabled-kontroller är kvar och tar skärmbilder.
- Skärmbilder i uppgiftens scratch: `shots-before/` och `shots/` har `closed-accepted-disabled-look*.png` och `closed-discarded-disabled-look*.png` i mörkt och ljust tema, plus `closed-*-review.png`, `other-disabled-buttons-*.png` och `create-dialog-primary-disabled-dark.png`. Före-bilderna är tagna från en tillfällig worktree på exakt `origin/main` `45e16c4` med samma syntetiska data; den enda ändringen i den worktreen var en extra ljustema-skärmbild för discarded.
- Ctrl+K-vägen till förhandsvisningen finns inte längre. `CommandPalette` har state `proposal`, men `setProposal` anropas bara med `null` från previewns discard/save-knappar. Ctrl+K öppnar listläge; Ctrl+J eller en fråga kör `ask`, som skapar en agentkörning, stänger paletten och öppnar agentens egen flik (#209). Ingen agent- eller människoåtgärd sätter en förhandsvisning, så `data-testid="palette-proposal"` kan inte nås på demon, varken för öppna eller stängda förslag. Komponenten testas därför bara på enhetsnivå med palettens test-id:n; ingen e2e-väg finns att testa.
- Bevis i `docker run --rm` på uppgiftsägt nätverk `row212b-net` mot syntetisk Postgres 18 (`row212b-postgres`) och Typesense 30.2 (`row212b-typesense`), utan host-nätverk, Docker-socket eller demo-DB: serverbygge i `rust:1.93-bookworm` med named volume `row212b-cargo-home` (exit 0, 380 s); `pnpm --dir apps/web typecheck` exit 0; `scripts/check-english.py` exit 0; `proposal-lifecycle.spec.ts` 4/4 (1,1 m). Hela vitest-sviten kördes: 153 filer / 858 tester, varav 857 gröna. Enda felet var det kända tidskänsliga `graph-scene.test.ts` (`1172 ms` mot 1000 ms-gränsen på belastad maskin); samma fil passerade isolerat 7/7 (`989 ms`). Före-körningen på `origin/main` gav 3/3 för den tidigare livscykelspecen.
- **CI-fix 1 efter PR 286:** CI:s e2e föll i `proposal-lifecycle.spec.ts` på `disabled Discard all must paint exactly like disabled Save all`. Felet var en läsning mitt i den delade knapptransitionen: Discard all hade `background rgb(60, 46, 63)` och `color rgb(205, 210, 221)` medan Save all redan hade `rgb(24, 33, 50)` / `rgb(203, 209, 220)`. Lokalt hann transitionen bli klar, så testet passerade bara av timing. Inga förväntningar sänktes.
- `apps/web/src/styles.css`: disabled `button.btn-raised` och `button.btn-danger` (inklusive `[aria-disabled='true']` och ljustemavarianterna) sätter nu `transition: none` med en kort kommentar. En inaktiverad action animerar därför aldrig genom den aktiva röda fyllningen. Andra disabled-kontroller påverkas inte; deras regler är oförändrade.
- `apps/web/e2e/proposal-lifecycle.spec.ts`: hjälparna `settledActionPaint` och `settledReasonReadability` läser computed style upprepat med `expect.poll` (10 s) tills två läsningar är identiska. För stängda actions krävs dessutom att Discard all och Save all är exakt lika (`background`, `border`, `color`, `opacity`) innan de strikta assertionerna körs. Wrapper-`display` pollas också, så även ljustemat och kontrastläsningen går genom samma väntan. `apps/web/src/proposal-closed.test.tsx` väntar på samma paint-likhet med `waitFor` och assertar att de två disabled-reglerna deklarerar `transition: none`.
- **CI-fix 1-bevis:** `pnpm --dir apps/web typecheck` exit 0; `scripts/check-english.py` exit 0; `proposal-closed.test.tsx` 9/9; `proposal-lifecycle.spec.ts` 4/4 tre körningar i rad med `BRAIAN_E2E_SPEC=proposal-lifecycle.spec.ts` på `row212b-net` mot syntetisk Postgres 18 och Typesense 30.2. Loggar i scratch: `logs/fix1-typecheck.log`, `logs/fix1-check-english.log`, `logs/fix1-vitest-proposal.log`, `logs/fix1-e2e-run{1,2,3}.log`.
- Rust-koden är orörd (ingen diff i `crates/`, `Cargo.toml` eller `Cargo.lock` mot basen). `apps/web/src/data-model.tsx` är orörd (`sha256 2d3459c60dd7473f2af3c0ff15cf1fd3295b5bc1da9da0e1046905de35babcaa`).
- Ärlig avgränsning: Ctrl+K-förhandsvisningen är död kod i nuvarande UI, så den kan inte verifieras i webbläsare. Den fullständiga vitest-körningen hade en tidskänslig flake i `graph-scene.test.ts`; den passerade isolerat. Ingen baseline före/efter-mätning av andra knappars pixlar gjordes utöver de sparade skärmbilderna och de befintliga opacity-kontrollerna.

## Rad 212-uppföljning — stängda förslags Save all/Discard all ser inaktiva ut

Grenen `junior/212-disabled-look` utgår från `origin/main` `e7c1444` (#283) och är **inte mergad, deployad eller accepterad**. Den rättar Test-avvisningen på `e7c1444`: knapparna var redan `disabled` i DOM (PR #281), men **Save all** och **Discard all** såg fortfarande aktiva ut på ett slutet förslag, framför allt **Discard all** som behöll den starka danger-rosan. Ingen förklaring syntes heller, eftersom `disabled:pointer-events-none` hindrar hover och därmed native `title`.

- Rotorsak i `apps/web/src/styles.css`: globala `button:disabled { opacity: 1 }` tog bort all fade, `.btn-danger` hade ingen `:disabled`-regel, och den enda disabled-hoverregeln kunde aldrig träffa knapparna på grund av `pointer-events: none`.
- `apps/web/src/styles.css`: globala `opacity: 1` är kvar för neutrala flikar, chips och ikonknappar. Nya specifika regler för `.btn-raised`, `.btn-danger`, `.btn-accent` och `button.primary` ger muted fyllning och etikett samt `opacity: 0.8`. Nya temavariabler `--danger-disabled-bg/-text` och `--accent-disabled-bg/-text` finns för både mörkt och ljust tema. Ljustemats generiska disabled-regel undantar nu `.btn-raised`, så den inte skriver tillbaka `opacity: 1`. Create-dialogens lokala `opacity: 0.45` ligger kvar och vinner fortfarande på sin högre specificitet.
- `apps/web/src/proposal-actions.tsx` (ny): delad `ProposalBulkActions` och `closedProposalReason`. Både Review-panelen (`panes.tsx`) och Ctrl+K-förhandsvisningen (`palette.tsx`) använder samma komponent, så knappar, disabled-look och förklaring inte kan glida isär. Förklaringen är synlig text med `title` och `aria-describedby`, inte en hover-tooltip på den disabled knappen.
- Engelsk copy i `apps/web/src/i18n.ts`: `Proposal already accepted`, `Proposal already discarded` och `Proposal already closed` (blandade accepterade/avvisade rader). Ett förslag med minst en `pending`-rad behåller båda knapparna aktiva och får ingen sådan förklaring.
- `apps/web/src/proposal-closed.test.tsx`: fem tester. Accepterat, avvisat och blandat slutet förslag assertar `disabled`, `opacity 0.8` från den riktiga CSS-regeln, exakt förklaringstext, `title` och `aria-describedby`; ett öppet förslag med pending-rad assertar `opacity 1`, inga `aria-describedby` och ingen förklaring. Ett femte test renderar samma komponent med palettens test-id:n och assertar samma look och text.
- `apps/web/e2e/proposal-lifecycle.spec.ts`: det befintliga livscykeltestet kontrollerar nu computed style (opacity under 1 och att danger-fyllningen inte är den aktiva rosa/röda), förklaringen, `title` och `aria-describedby` för accepterat, avvisat och blandat förslag, i mörkt tema och accepterat även i ljust. Det öppna förslaget i första testet assertar motsatsen: båda knapparna enabled, `opacity 1` och ingen förklaring. Ett tredje test kontrollerar att andra disabled-kontroller inte ändrats (ghost-ikon, flik och chip har kvar `opacity 1`; create-dialogens primärknapp har kvar `0.45`). Skärmbilder: `closed-*-disabled-look.png`, `closed-*-review.png`, `other-disabled-buttons-*.png` och `create-dialog-primary-disabled-dark.png` i uppgiftens scratch `shots/`.
- Kontrast (WCAG, disabled-kontrollernas etikett med `opacity 0.8` över panelbakgrund): mörkt tema raised `6,75:1`, danger `5,54:1`, accent `6,01:1`; ljust tema raised `9,44:1`, danger `4,74:1`, accent `5,11:1`. Alla disabled-etiketter når AA. Mätningen ligger i scratch `logs/contrast.txt`.
- Bevis i `docker run --rm` på uppgiftsägt nätverk `row212look-net` mot syntetisk Postgres 18 (`row212look-postgres`) och Typesense 30.2 (`row212look-typesense`), utan host-nätverk, Docker-socket eller demo-DB: serverbygge i `rust:1.93-bookworm` med named volume `row212look-cargo-home` (exit 0, 5m31s); `proposal-lifecycle.spec.ts` 3/3 (1,2 m); hela vitest-sviten 153 filer / 854 tester gröna; `pnpm --dir apps/web typecheck` exit 0; `scripts/check-english.py` exit 0.
- Rust-koden är orörd (ingen diff i `crates/`, `Cargo.toml` eller `Cargo.lock` mot basen), så inga Rust-tester kördes. Binären för e2e byggdes ändå från exakt den här worktreen i `rust:1.93-bookworm`.
- `apps/web/src/data-model.tsx` är orörd (`sha256 2d3459c60dd7473f2af3c0ff15cf1fd3295b5bc1da9da0e1046905de35babcaa`).
- Ärlig avgränsning: Ctrl+K-förhandsvisningen nås inte i den nuvarande AI-vägen, så e2e kan inte öppna den. Den använder samma komponent som Review-panelen, och enhetstestet renderar komponenten med palettens test-id:n.

## Rad 107-uppföljning 3 — senast klickade header vinner även när Detail öppnas

Den här grenen (`junior/107-header-race`) utgår från `origin/main` `795eb06` (#277) och är **inte mergad, deployad eller accepterad**. Den rättar den intermittenta resten efter #277: direkt efter omladdning kunde Products-cell → Articles-header → Ctrl+Shift+→ flytta Products `Type` i stället för Articles `Name` (cirka 1 av 6 första interaktioner på demo).

- Rotorsak: `ObjectTable` publicerade sin `activeColumn` både direkt i `activateColumn` och igen från en passiv `useEffect`. Ett body-klick startar Detail asynkront; när den passiva effekten för body-tabellen kördes efter header-klicket i den andra panen skrev den tillbaka body-tabellens kolumn som `lastActiveColumnViewId`. Upprepade header-klick ändrade inget React-state, så ingen motpublicering återställde headern. En tillfälligt återinsatt effekt reproducerade exakt felet i enhetsregressionen (`viewId` Products, `column` `type`).
- `apps/web/src/panes.tsx`: den passiva `publishActiveColumn`-effekten är borttagen. Kolumnmålet publiceras bara synkront i den händelse som faktiskt aktiverar kolumnen (`activateColumn`), så en senare Detail-/fokus-commit kan inte skriva över ett senare header-klick.
- `apps/web/src/sortable-column-header.tsx`: headern registreras synkront på `pointerdown` (primärknapp) utöver klick och fokus. Därmed hinner målet sättas även om klicket/omslaget avbryts när Detail öppnas och fokus flyttas.
- `apps/web/src/column-move-target.test.tsx`: ny enhetsregression för ordningen body-klick → upprepat header-`pointerdown` medan body-state fortfarande commits; headern ska behålla målet. Testet faller om den gamla passiva effekten sätts tillbaka.
- `apps/web/e2e/column-move-race.spec.ts` (registrerad i `scripts/e2e.mjs`): 20 repetitioner i båda riktningarna (40 race). Efter omladdning och synliga rader skickas body-klick (Type), header-`pointerdown`/klick på `Name` och chorden direkt efter varandra utan väntan eller polling. Events dispatchas mot noderna i stället för att klickas via skärmkoordinater, eftersom Playwrights actionability/force-box kunde vänta in Detail-omflödet (och därmed dölja racet) eller träffa ett grann-element. `Name` alternerar mellan index 1 och 2, så ingen flytt är en no-op. Ett enda fel fäller testet. Det befintliga `column-move-target.spec.ts` är oförändrat (det tillfälliga repro-testet är borttaget).
- Bevis i `docker run --rm` på uppgiftsägt nätverk `row107shortcut-net` mot syntetisk Postgres 18 och Typesense 30.2 (containrarna `row107shortcut-postgres`/`row107shortcut-typesense`), utan host-nätverk, Docker-socket eller demo-DB: web-typecheck exit 0; `column-move-target.test.tsx` 6/6 (inklusive den nya regressionen); `column-move-target.spec.ts` 2/2 (59,8 s); `column-move-race.spec.ts` 1/1 med 40 race (4,2 m). Hela vitest-sviten kördes också: 149/150 filer och 823/824 tester gröna; enda felet var det tidskänsliga `graph-scene.test.ts` (1629 ms mot 1000 ms-gränsen) på en belastad maskin, utan koppling till den här ändringen.
- `apps/web/src/data-model.tsx` är orörd (`sha256 2d3459c60dd7473f2af3c0ff15cf1fd3295b5bc1da9da0e1046905de35babcaa`).
- Ärlig avgränsning: den tightade e2e-stressen kördes grön med fixen. Ingen baseline-körning av e2e mot den gamla koden gjordes; att ordningen verkligen var fel visas av enhetsregressionen när den gamla passiva effekten återinsattes tillfälligt.

## Rad 135-uppföljning 3 — fokusringen klipps inte längre

Grenen `junior/135-focus-ring-visible` utgår från `origin/main` `795eb06` (#277) och är **inte mergad, deployad eller accepterad**. Den kompletterar #269/#272: 2px accentringen fanns, men klipptes mot flik-, sök- och menykanter, och användarmenyns pilmarkerade rad saknade ring eftersom `:focus-visible` inte sätts vid pilnavigering.

- `apps/web/src/styles.css`: `.tabs`, `.pane-tab` och `.standard-table-bar` har 2px padding så flikens respektive sökfältets ring ryms innanför listen. Användarmenyns markerade rad får nu ring via `.menu.user-menu-content .menu-item[data-highlighted]` (2px `--accent`, `outline-offset: -2px`) i stället för att kräva `:focus-visible`; pilnavigeringen är oförändrad.
- `apps/web/e2e/focus-styles.spec.ts`: nya tester för top-nav, sökfält, aktiv pane-flik med stängnings-X, användarmeny efter Enter + ArrowDown samt datamodellsträdet och Shift+Tab. Hjälparna `ringClip`/`expectRingUnclipped` kontrollerar att ringens bounding box inte skärs av någon overflow-ancestor. Användarmenytestet assertar den målade 2px accentoutlinen på `[data-highlighted]` i stället för `:focus-visible`, eftersom pilnavigering inte sätter den flaggan.
- Oförändrat: `apps/web/src/data-model.tsx` (`sha256 2d3459c60dd7473f2af3c0ff15cf1fd3295b5bc1da9da0e1046905de35babcaa`).

Verifierat i isolerad `BRAIAN_E2E_ISOLATE=1`-körning via `scripts/e2e.mjs` med `BRAIAN_E2E_COMPOSE_PROJECT=row135ring` mot syntetisk Postgres 18 och Typesense 30.2, utan demo, host-nätverk eller Docker-socket: `pnpm --dir apps/web exec tsc --noEmit` grön; `vitest run src/focus-ring.test.ts src/user-menu.test.tsx` 14/14; `focus-styles.spec.ts` 19/19 (2,2 m). Fokusbevis från webbläsaren (mörkt tema): användarmenyns markerade rad `2px solid` `rgb(154, 77, 255)` med offset `-2px`; träd `2px solid` offset `-2px`; Account-trigger `2px solid` offset `0`; aktiv cell `rgb(154, 77, 255) 0px 0px 0px 2px inset`. Skärmbilder: `row135-*.png` i `apps/web/test-results/focus-screenshots/` och uppgiftens scratch (`shots/direct/`), ej committade.

## Rad 103-uppföljning — omladdning, cykeltext och målfilter i Select source

Grenen `junior/103-reload-selection` utgår från `origin/main` `795eb06` (#277, inkluderar #276) och är **inte mergad, deployad eller accepterad**. Den rättar de tre kvarvarande punkterna från Test-avvisningen efter #276: efter "Articles from Products" + produktradsval + F5 blev Articles tom ("Select a row in Products"), cykelraden visade `SYN-001632 · Would create a cycle` utan följriktning, och Products-menyn listade greyed `Articles from Products`/`Suppliers from Products`.

- `apps/web/src/ui-context.ts`: `publishMarked` sparar nu även objektets typ och avger en stabil `readMarkedSelection()`; `publishSelection`-versionen bumpas så tabeller som lyssnar re-renderas när det öppnade objektet eller dess typ landar.
- `apps/web/src/shell.tsx`: `publishMarked` får `opened.data?.type` när objektroten har laddats, både vid URL-återställning och vid klick.
- `apps/web/src/panes.tsx`: en icke-peer-tabell adopterar det markerade objektet som sin radvalning när typen matchar tabellens typ och tabellen inte redan har en vald rad. Peer-tabeller adopterar aldrig det globala objektet (deras valning är en egen rad). Efter F5 publicerar Products alltså produkten igen, och Articles visar sina länkade artiklar.
- `apps/web/src/palette-select-source.ts` + `apps/web/src/i18n.ts`: cykelradens undertext är nu `Would create a cycle ({type} follows {source})`, t.ex. `Would create a cycle (Articles follows Products)`; det förr missvisande `SYN-… ·`-prefixet är borttet.
- `apps/web/src/palette-select-source.ts` + `apps/web/src/palette.tsx`: submenyn filtreras till målvyns typ. Products-menyn visar `All Products` och de källor Products kan använda (t.ex. `Products from Articles`, `Products from Suppliers`), men inte `Articles from Products`/`Suppliers from Products`. En generisk vy (titeln "Objects") behåller alla typer.
- `apps/web/e2e/select-source-reload.spec.ts` (registrerad i `scripts/e2e.mjs`): F5-Scenario med Articles följer Products och produktradsval — efter omladdning visar Articles samma länkade artiklar och Products-raden är vald; Products-menyn listar inte `Articles from Products`/`Suppliers from Products`; cykelraden visar `Would create a cycle (Articles follows Products)` och `(Articles follows Suppliers)`.
- Bevis i uppgiftsägda `--rm`-containrar på `row103-net` mot syntetisk Postgres 18 och Typesense 30.2, utan host-verktyg, hostnätverk eller Docker-socket: `pnpm typecheck` grön; vitest 151 filer / 830 tester, varav 829 gröna och 1 timeout (`active-row.test.tsx > does not move the palette row when the pointer hovers`, lastbarhetstest som passerar isolerat 23/23); `select-source-reload.spec.ts` 2/2; regressioner 25/25 i `select-source-target`, `select-source-reload`, `view-source-type`, `peer-source`, `peer-source-empty`, `peer-source-chain`, `source-all-explicit`, `link-source-repair`, `link-types`, `type-template-peer`, `template-picker`, `readable-urls`; `scripts/check-english.py` exit 0.
- `apps/web/src/data-model.tsx` orörd (`sha256 2d3459c60dd7473f2af3c0ff15cf1fd3295b5bc1da9da0e1046905de35babcaa`).
- Kvarstående beteende (oförändrat): objektets nyckel/namn i rubriken `Products › …` beräknas först när objektroten har laddats; om produkten inte finns på den första sidan visar rubriken tillfälligt objektets id tills raden laddas.

## Rad 212-uppföljning — Save all/Discard all på slutna förslag

Grenen `junior/212-closed-proposal-buttons` utgår från `795eb06` (#277) och är **inte mergad, deployad eller accepterad**. Den rättar Test-avvisningen efter #273: i Review → Proposals var **Save all** och **Discard all** fortfarande aktiva på slutgiltiga förslag (`accepted` eller `discarded`, inga `pending`-rader).

- `apps/web/src/panes.tsx`: `hasPendingRows` (minst en rad med status `pending`) styr båda knapparna. Save all är som förut avstängd vid laddning, pågående mutation eller stale; Discard all vid pågående mutation. Utan pending-rader blir båda avstängda.
- `apps/web/src/palette.tsx`: palettens förslagsförhandsvisning får samma gate. Förhandsvisningen nås inte i den nuvarande AI-vägen, så ändringen är ett lika bred skyddsnät utan synbar beteendeförändring.
- API- och store-produktionskoden ändras **inte** i den här PR:en. `POST /v1/proposals/{id}/accept` svarar 409 `conflict` («this proposal is no longer pending») för icke-`open`, och `POST /v1/proposals/{id}/discard` är en idempotent no-op (204) utan pending-rader. Beteendet kom med #273 och bekräftas nu med tester.
- `apps/web/src/proposal-closed.test.tsx` (ny): fyra tester — `accepted`, `discarded` och blandat (`accepted` + `rejected`) förslag har båda knapparna disabled; ett öppet förslag med en pending-rad har dem enabled.
- `apps/web/src/proposal-errors.test.tsx`: fixture-objektet har nu en pending-rad, så Save all/Discard all förblir enabled i de tre befintliga fel-testen.
- `crates/api/tests/http.rs`: tre nya tester — `closed_accepted_proposal_rejects_bulk_accept_and_discard_is_a_no_op`, `closed_discarded_proposal_rejects_bulk_accept_and_discard_is_a_no_op` och `closed_mixed_proposal_without_pending_rejects_bulk_accept_and_keeps_accepted_rows`. De kontrollerar 409/204, att objektversioner och värden inte ändras, och att ingen `proposal_recoveries`-rad skrivs.
- `crates/store/tests/proposals.rs`: `a_closed_proposal_cannot_be_reopened_or_reset` — `set_proposal_status` vägrar både `discarded` och `accepted` igen, och `finalize_proposal` returnerar `None`.
- `apps/web/e2e/proposal-lifecycle.spec.ts`: nytt test som skapar `accepted`, `discarded` och blandat (en accepterad + en avvisad rad) förslag, öppnar dem i Review och assertar att knapparna är disabled, att accept igen ger 409, discard igen 204, och att status, radstatus och verkliga värden står sig.
- Bevis i `docker run --rm` på uppgiftsägt nätverk `row212buttons-net` mot syntetisk Postgres 18 (`row212buttons-postgres`) och Typesense 30.2 (`row212buttons-typesense`), utan host-nätverk, Docker-socket, demo-DB eller DB-reset: serverbygge i `rust:1.93-bookworm` (exit 0, 7m12s); `proposal-lifecycle.spec.ts` 2/2 (53,6 s); `cargo test -p braian-store --test proposals` 13/13; `cargo test -p braian-api --test http` 53/53; `pnpm --dir apps/web typecheck` exit 0; vitest `proposal-closed` + `proposal-errors` 7/7.
- `apps/web/src/data-model.tsx` är orörd (`sha256 2d3459c60dd7473f2af3c0ff15cf1fd3295b5bc1da9da0e1046905de35babcaa`).


## Rad 129 — Allowed trees öppnar Review med Cancel innan sparning

Grenen `junior/129-allowed-trees-review` utgår från `origin/main` `795eb06` (#277) och är **inte mergad, deployad eller accepterad**. Den rättar Test-avvisningen från 2026-11-09: en Allowed-tree-avtoggle på en befintlig typ auto-sparade genom modelldraften utan att någon ReviewDialog eller Cancel öppnades.

- `apps/web/src/model-draft-ui.tsx`: `draftSaveGate` returnerar nu `'confirm'` också för en draft med ett `set_structures`-steg, även när `consequence.destructive` är false. `draftHasForcedReview` läser draftens steg, inte bara konsekvensen. Övriga säkra draftar (t.ex. attributändringar) direct-save fortfarande.
- `ReviewDialog`: en tvungen icke-destruktiv granskning visar primär **Save** (`variant="primary"`, inte danger Delete) och beskrivningen kommer från draftens första ändringsrad i stället för "0 values on 0 objects will be deleted". Cancel (och Escape/overlay) kastar det stagade draftet via `DELETE /v1/model/draft`, så omladdning visar oförändrat och draftantalet blir 0. Den destruktiva vägen är oförändrad: danger Delete, Cancel stänger utan att spara och lämnar draften kvar.
- `apps/web/src/model-draft-ui.test.tsx`: gate-enhetstest, dialog utan spar-POST, Cancel → DELETE, Escape → DELETE, Save → exakt en POST, samt att en destruktiv draft lämnas kvar vid Cancel.
- `apps/web/src/data-model.test.tsx`: integrationstest där AllowedTrees-togglen tillsammans med `ModelDraftHost` öppnar ReviewDialog utan spar-POST.
- `apps/web/e2e/row129-allowed-trees.spec.ts` (registrerad i `scripts/e2e.mjs`): ägd fixture, toggle → synlig ReviewDialog med Save+Cancel, live-structures oförändrade, inga save-POST eller PUT; Cancel → omladdning → oförändrat, draft 0; toggle → Save → omladdning → ändringen kvar; restore via samma Review-väg; fixture borttagen.
- Bevis i `docker run --rm` och isolerat compose-projekt `row129fix` (eget nätverk, syntetisk Postgres 18 + Typesense 30.2, portar 25433/28108), utan host-nätverk, Docker-socket eller demo-DB: `tsc --noEmit` exit 0; hela vitest-sviten 150 filer / 830 tester gröna; `row129-allowed-trees.spec.ts` 1/1 (34,9 s); regression `save-confirm.spec.ts` 3/3 (direkt sparning av säker icke-strukturändring, destruktiv attributborttagning, destruktiv gruppborttagning). Skärmdumpar i uppgiftens scratchkatalog.
- `apps/web/src/data-model.tsx` är orörd (`sha256 2d3459c60dd7473f2af3c0ff15cf1fd3295b5bc1da9da0e1046905de35babcaa`).
- CI-run 42757050767 på exakt `87950ea` fångade en föråldrad `apps/web/e2e/drag.spec.ts`: testet "allowed trees save directly without a confirmation dialog" förväntade sig fortfarande den gamla direktsparningsvägen (review-dialog count 0 + poll på persisted) och tömde sig efter 15 s. Testet är nu omdöpt till "allowed trees open the review dialog before saving" och följer rad 129-kontrakten: efter togglen synlig ReviewDialog med primär **Save** (inte danger Delete) och **Cancel**, live-structures oförändrade, 0 save-POST och 0 PUT; **Save** ger exakt en draft-save-POST, dialog stänger, omladdning behåller ändringen; originaluppsättningen återställs via samma Review-väg så typen inte lämnas draftig. De övriga fyra drag.spec-testerna är oförändrade. Ingen annan test togglar Allowed trees; unit-testerna i `data-model.test.tsx` och `model-draft-ui.test.tsx` uttrycker redan det nya kontraktet.
- Isolerad compose-körning i projektet `row129ci` (eget nätverk, syntetisk Postgres 18 + Typesense 30.2, portar 25433/28108; binären byggd i `rust:1.93-bookworm` med named volume `row129-cargo-home`, utan host-nätverk, Docker-socket eller demo-DB): hela `drag.spec.ts` 5/5 gröna (inkl. det uppdaterade allowed-tree-testet, 30,7 s) och `row129-allowed-trees.spec.ts` 1/1 (46,2 s). `select-source-target.spec.ts` 2/2 gröna (45,8 s): CI:s `states.get(productsId) undefined` i e2e (2) reproducerades alltså inte och är en flake, inte en produktbugg; rad 103-produktkoden är orörd.
- Kvarstående beteende (oförändrat): ReviewDialog för en **destruktiv** ändring lämnar draften stagad efter Cancel, så användaren kan öppna den igen. På den tvungna icke-destruktiva allowed-tree-vägen kastas draften, enligt mandate.

## Rad 128 — typnoder i modellgrafen öppnar delade kontextmenyn

Grenen `junior/128-type-node-context-menu` utgår från `origin/main` `795eb06` (#277) och är **inte mergad, deployad eller accepterad**. Den rättar QA-avvisningen på demo `4cd25f7`: högerklick på en riktig Product-typnod i Data model → Model graph öppnade ingen Braian-meny (`[data-testid="context-menu"]` saknades).

- `apps/web/src/graph-map.tsx`: porten som tidigare bara släppte igenom `kind === 'object'` släpper nu igenom både `object` och `type` med `typeKey` (`canOpenGraphNodeMenu`). Ctrl/Cmd+Enter följer samma port.
- Samma fil: de tillgänglighetsbaserade nodknapparna ligger utanför skärmen (`.graph-a11y`), så ett riktigt högerklick träffar canvasen. En canvas-nivå-`contextmenu`-lyssnare hit-testar noden och öppnar exakt samma delade meny (`openGraphNodeMenu`). Tom canvas släpps fortfarande genom till webbläsarens egen meny.
- Menyn är `extraOnly` och node-scopad: den visar bara länkval från `linkChoices` (Articles/Suppliers för Product) och aldrig globala kommandon (Search, Sign out, Light mode, Send feedback, Open agent, Switch catalog, Export).
- Tom-menyn undviks: `SharedContextMenuHost` returnerar `null` när `items.length === 0`. För en typ utan länktyper läggs ett node-scopat fallback-alternativ till (`graph:type:view`, "Open <typ>"). Objektnoder utan länkval är oförändrade (tom extra-lista).
- `graph:type:view` och de befintliga `graph:add-link:*` har ingen registrerad command-runner; klick skickar bara ett `braian:command`-event som ingen lyssnare agerar på. Ingen ny add-link-funktion har byggts. För typnoder skickas aldrig `objectId` (vilket skulle kunna tolkas som ett objekt-id); bara `typeKey`.
- `apps/web/src/graph-map.test.tsx`: porten (type+typeKey öppnar, object+typeKey öppnar, andra kind och utan typeKey nekar), extras-fallback och target utan objectId, plus en komponenttest som högerklickar och trycker Ctrl+Enter på en typnod och kontrollerar att menyn syns, att inga globala etiketter finns och att inget skrivs.
- `apps/web/e2e/row128-type-menu.spec.ts` (registrerad i `scripts/e2e.mjs`): högerklick på `type:product` öppnar menyn utan globala alternativ; Ctrl+Enter gör samma; tom canvas öppnar ingen meny; kontroll i objektgrafen att en `kind=object`-nod fortfarande får meny utan globala alternativ. Skärmdumpar under `apps/web/test-results/row128-type-menu/`.
- Bevis i isolerad compose-project `row128fix` (eget nätverk, syntetisk Postgres 18 + Typesense 30.2, portar 25433/28108) utan host-nätverk, Docker-socket eller demo-DB: `braian` byggd i `rust:1.93-bookworm` med namngiven `row128-cargo-home`-volym; vitest i `node:22` 151 filer / 834 tester gröna; `tsc --noEmit` exit 0; `scripts/check-english.py` exit 0; e2e 2/2 (25,2 s).
- `apps/web/src/data-model.tsx` är orörd (`sha256 2d3459c60dd7473f2af3c0ff15cf1fd3295b5bc1da9da0e1046905de35babcaa`).

## Rad 128-uppföljning — typnodmenyn har samma meny från tangentbord och högerklick

Grenen `junior/128-type-menu-followup` utgår från `origin/main` `45e16c4` och är **inte mergad, deployad eller accepterad**. Den rättar QA-avvisningen på demo `e7c1444` (PR #283): tangentbordsvägen (Ctrl+Enter / Shift+F10 / ContextMenu) öppnade en annan meny än högerklick, menyn hamnade i övre vänstra hörnet, Supplier visade Products objektlänkar, klick på posterna gjorde inget och fokusringen syntes inte.

- `apps/web/src/graph-map.tsx`: typnoder får bara typåtgärder. Menyn innehåller exakt en post, `graph:type:view` med titeln `Open <typ>`; `graph:add-link:*` finns kvar bara för objektnoder i Graph-fliken. En registrerad command-runner öppnar `Open <typ>` i Object types och skickar `braian-add-link` med rätt `linkType` för objektnoder.
- Samma fil: alla menyvägar använder `defsRef.current`/`activeDefs`; `GraphView` i `panes.tsx` skickar dessutom `defs={defs.data}` till Data model-mounten, så en saknad prop inte kan ge tomma länkar igen.
- Samma fil: menyankaret är nodens publicerade markör (`data-x`/`data-y` plus radie), inte den off-screenade a11y-knappens rect. Ctrl+Enter, Shift+F10 och ContextMenu på fokuserad nodknapp (och på canvasens valda nod) öppnar samma meny som högerklick.
- Fokus: den fokuserade typnoden ritar en synlig ring (`data-testid="graph-focus-ring"`, `--accent`, 2 px) runt den synliga canvas-noden; ringen stannar kvar medan menyn har fokus.
- `apps/web/src/model-type-open.ts`, `apps/web/src/model-tables.tsx` och `apps/web/src/shell.tsx`: `Open <typ>` väljer typen i Object types-panelen. En köad typnyckel konsumeras när tabellen mountas, så åtgärden fungerar även när panelen inte är öppen.
- `apps/web/src/graph-map.test.tsx`: typmenyns exakta poster för Product/Supplier/Article, att objektlänkar bara finns på objektnoder, ankarpunkten, Ctrl+Enter/Shift+F10/ContextMenu, att `Open Product` skickar rätt typnyckel utan skrivning och att en objektlänk skickar rätt `linkType`.
- `apps/web/e2e/row128-type-menu.spec.ts`: strikta exakta menyposter per nod (Product/Supplier/Article skiljer sig), menyposition nära noden, fokusringens position och synliga ram, tangentbords- och högerklicksparitet för alla tre tangenter, att `Open Product`/`Open Supplier` markerar rätt rad i Object types, tom canvas utan Braian-meny samt objektnodens meny i Graph-fliken. Skärmdumpar under `apps/web/test-results/row128-type-menu/`.
- `apps/web/src/data-model.tsx` är orörd (`sha256 2d3459c60dd7473f2af3c0ff15cf1fd3295b5bc1da9da0e1046905de35babcaa`).
- Bevis i isolerad miljö utan host-nätverk, Docker-socket eller demo-DB: eget nätverk `row128fu-net`, syntetisk Postgres 18 (`row128fu-postgres`) och Typesense 30.2 (`row128fu-typesense`), `braian` byggd i `rust:1.93-bookworm` med namngiven volym `row128fu-cargo-home`, Playwright i `mcr.microsoft.com/playwright:v1.64.1-noble`. `pnpm typecheck` exit 0; `scripts/check-english.py` exit 0; hela vitest-sviten 153 filer / 858 tester gröna i en ren körning före det sista enhetstestet, därefter 17/17 i de riktade filerna inklusive nya `model-type-open.test.ts`. Upprepade fullkörningar under hög värdlast (load average 10-16 på 8 kärnor, andra uppgifters containrar) föll på tidsgränser/perf i `graph-scene`, `active-row`, `path-cell`, `palette-home-end` och `peer-selection`; samma filer passerar ensamma, och ingen av dem rör den här ändringen. `row128-type-menu.spec.ts` 5/5 (3,5 m). Regressionskontroller: `link-to-submenu.spec.ts` 1/1, `context-menu-placement.spec.ts` 1/1, `model-table-row-selection.spec.ts` 1/1, samt modellgraf-testet i `graph.spec.ts` 1/1. `graph.spec.ts` "force-directed graph" föll på `data-settled=true` inom 15 s även när `graph-map.tsx` och `styles.css` tillfälligt återställdes till `HEAD` i samma miljö, så det är en miljö-/lastflake och inte en regression från den här grenen. Skärmdumpar (högerklick och tangentbord för Product och Supplier, fokusring) ligger i uppgiftens scratchkatalog.

## Rad 107-uppföljning 2 — tangentbordet följer senast klickade header

Den här grenen (`junior/107-shortcut-target`) utgår från `origin/main` `86bb9a0` (#275) och är **inte mergad, deployad eller accepterad**. Den rättar Test-avvisningen på demo `86bb9a0`: Ctrl+K och kontextmenyn var rätt efter #274, men Ctrl+Shift+←/→ flyttade fortfarande fel tabell i sekvens A1 och C1b.

- Rotorsak: `publishActiveColumn(viewId, null)` behandlade en tabells "ingen aktiv kolumn" (före första aktiveringen och vid en remount) som att tabellen släppte sin aktiva kolumn. Det kunde rensa `lastActiveColumnViewId` eller flytta den till en annan pane, så chordens `resolveColumnMoveTarget()` → `readLastActiveColumn()` inte pekade på headern användaren just klickat. Debug-körningen visade `publishActiveColumn … null` direkt före chord-eventet.
- `apps/web/src/ui-context.ts`: ett null-meddelande ignoreras nu, så senaste icke-null-aktivering behålls. Tangentbordet ser därmed exakt samma mål som Ctrl+K (`resolveColumnMoveTarget`/`readLastActiveColumn`). Explicit `viewId` och fokus-fallback är oförändrade.
- `apps/web/src/column-move-target.test.tsx`: ny enhetsregression för att en remount som publicerar null bevarar senast aktiverade header (både A1- och C1b-mönstret), och att `dispatchColumnMove` skickar rätt `{ viewId, column }`.
- `apps/web/e2e/column-move-target.spec.ts`: nytt test för exakta A1 och C1b. Products-cell → Articles-header → Ctrl+Shift+→ flyttar bara Articles Name. Articles-cell → Products-header → Ctrl+Shift+→ flyttar Products Name, och Products-header igen → Ctrl+Shift+← flyttar tillbaka Products Name. Grannvyn behåller exakt sin kolumnordning i varje steg. Det befintliga #274-testet (header → Ctrl+K/kontextmeny, alla fem vägar) är kvar och grönt. En mjuk kontroll säger att `aria-sort` inte blir `none` efter flytten.
- Bevis i `docker run --rm` på uppgiftsägt nätverk `row107shortcut-net` mot syntetisk Postgres 18 och Typesense 30.2 (containrarna `row107shortcut-postgres`/`row107shortcut-typesense`), utan host-nätverk, Docker-socket eller demo-DB: web-typecheck exit 0; riktade vitest-filer `column-move-target.test.tsx` + `ui-context.test.ts` 6/6; `column-move-target.spec.ts` 2/2 (A1/C1b 18,3 s, hela filen 1,4 m). Skärmdumpar: `a1-01-before`, `a1-02-after`, `c1b-03-after` i uppgiftens scratchkatalog.
- `apps/web/src/data-model.tsx` är orörd (`sha256 2d3459c60dd7473f2af3c0ff15cf1fd3295b5bc1da9da0e1046905de35babcaa`).
- Sortpilen: den mjuka kontrollen passerade i den här körningen. Den tidigare glitchen är inte oberoende bekräftad eller bevisad åtgärdad, så inget sådant påstående görs.

## Rad 103 — Select source med explicit målvy

Grenen `junior/103-select-source-target` utgår från `86bb9a0` (#275) och är **inte mergad, deployad eller accepterad**. Den rättar Test-avvisningen från 2026-11-07: medan Products höll fokus öppnades Articles-panelens Select source-meny, men paletten visade "Current: All Products" och "Articles from Products" var felaktigt inaktiverad som cykel.

- `apps/web/src/palette-select-source.ts`: ny `resolveSourceTarget` föredrar ett explicit meny-mål (`viewId`) framför fokus, och fokus framför den första objektstabellen. Ctrl+K har inget explicit mål och följer därför den fokuserade tabellen som förut.
- `apps/web/src/palette.tsx`: paletten använder målet för både "Current"-märkning och cykelkontroll, och skickar med målvyn när en typ eller peer-källa väljs.
- `apps/web/src/shell.tsx`: `view:select-source`-köraren bevarar meny-målets `viewId` i `paletteSourceTargetViewId` och nollställer det för Ctrl+K samt alla andra palettvägar.
- `apps/web/e2e/select-source-target.spec.ts`: två målvyper i båda fokus-/menyordningarna, relation och explicit All, omladdning, Ctrl+K fokusregression, samt en äkta A→B→C→A-cykel jämfört med den felaktiga cykeln.
- Bevis i uppgiftsägda `--rm`-containrar på `row103-net` mot syntetisk Postgres 18 och Typesense 30.2, utan host-verktyg, hostnätverk eller Docker-socket: `pnpm typecheck` grön; vitest 821/822 gröna (den enda felvigheten `graph-scene.test.ts` är ett tidskänsligt test som passerar isolerat, 415 ms); `select-source-target.spec.ts` 2/2; regressioner 14/14 (`view-source-type`, `peer-source`, `peer-source-empty`, `peer-source-chain`, `source-all-explicit`, `link-source-repair`, `link-types`, `type-template-peer`, `template-picker`); `scripts/check-english.py` exit 0.
- `apps/web/src/data-model.tsx` orörd (`sha256 2d3459c60dd7473f2af3c0ff15cf1fd3295b5bc1da9da0e1046905de35babcaa`).
- Kvarstående beteende (oförändrat): omladdning bevarar källan men inte den valda raden. Efter omladdning visar målet peer-empty-tillståndet tills en rad väljs igen, och ingen tyst All-fallback sker.

## Rad 215 uppföljning — låsta fält, levande namn och väntande Save

Test av #271 på demo `549d2d3` (2026-11-09) fann tre saker som den här grenen rättar. Ändringen är inte mergad, deployad eller accepterad.

- Type och Kind i Edit selection var disabled `<select>` och såg därför fortfarande ut som dropdowns med chevron. I edit-läget renderas de nu som read-only värden med låsikon, utan select eller chevron. Namnfältet har en synlig 1px-kant i vila. Reglerna ligger i `apps/web/src/styles.css` (`.model-field .selection-name`, `.model-field .model-field-locked`).
- Products-panelen visade kvar "Cheese" efter att Articles-selectionen bytt namn. Orsaken var inte React Query-cachen: demon har två speglade selection-rader med samma filter, samma namn och samma ägare, en per typ. Product-raden behöll därför sitt gamla namn även efter F5. `Store::update_assortment` låter nu speglade rader (samma ägare, kind, fråga och tidigare namn) följa med vid namnbytet, och webbklienten invaliderar redan alla `assortments`-frågor. Både Articles- och Products-chippen samt listan visar det nya namnet efter omladdning. Skrivvägen är oförändrad: Save selection går direkt via `PUT /v1/assortments/{id}`, inte som en draft.
- Save selection visar nu `Saving…` och är disabled medan PUT:en pågår. Namnet läses från inputfältets värde vid submit, så ett snabbt skrivet namn inte kan sparas trunkerat. Ctrl+A i namnfältet markerar bara fältets text.

`e2e/edit-selection-click.spec.ts` täcker nu också: låsta Type/Kind utan select/chevron, synlig namnkant i vila, snabbskrivning följt av omedelbar Save och fullt namn efter omladdning, `Saving…` medan PUT:en väntar, Ctrl+A som bara markerar namnfältet, samt Articles- och Products-chippen och listan efter namnbyte och F5. `crates/store/tests/dynamic_selections.rs` har `renaming_a_mirrored_selection_updates_the_same_filter_in_another_type`. Körningen är gjord i isolerade `--rm`-containrar på ett uppgiftsägt Docker-nätverk mot syntetisk Postgres 18 och Typesense 30.2: web-typecheck grön, 150 vitest-filer med 815 tester gröna, `edit-selection-click.spec.ts` 7/7, `dynamic-selections.spec.ts` 2/2, `new-selection-dialog.spec.ts` 1/1, store-testet 3/3, `cargo fmt --all --check` och `cargo clippy -p braian-store --tests -- -D warnings` gröna. Inga demo-, host- eller Docker-socket-körningar.
`e2e/edit-selection-click.spec.ts` (registrerad i `scripts/e2e.mjs`) täcker: öppna via faktisk meny, klicka namnfältet, byta namn på den seedade manuella Articles-selectionen Cheese, Save selection, synligt namn och API-läsning efter omladdning, Cancel/X/Escape utan oavsiktlig ändring, upprepad öppning, Type/Kind låsta i edit-läget, samt en stagad tabelldraft. Körningen är gjord i isolerade `--rm`-containrar mot syntetisk Postgres/Typesense. Mergad till `main` som #271 (`549d2d3`); inte deployad eller accepterad.

Braian går att starta lokalt och att klicka igenom på [demo.braian.io](https://demo.braian.io). Postgres är källan och ändringsloggen. Indexer, sök, auth, förslag och webbgränssnittet sitter på samma kedja. Flödet står i `docs/events.md`. Demokatalogen som `just dev` visar är bara seed: hjälteobjekt plus 240 syntetiska livsmedel (leverantörer, produkter och artiklar). Etiketter finns på sv/en/de och objektdata är engelska. Strukturen heter Food, leverantörer står utanför trädet och pekas ut med länkar. Tester skriver i databasen `braian_e2e` och sökaliaset `braian_e2e`, inte i demon.

Skalprovet (5 000 skrivningar i sekunden, 1 miljon och 10 miljoner objekt) är inte gjort. En virtuell tabell mot 100 013 objekt är mätt, se `docs/measurements/2026-10-25-table-100k.md`.


## Rad 107-uppföljning — levererad på main (#274)

Den här grenen (`junior/107-header-column-target`) utgår från `549d2d3` (#271) och är **inte mergad, deployad eller accepterad**. Den rättar Test-avvisningen på demo `549d2d3`: ingen väg flyttade kolumnen i båda tabellerna längre, men två av fem vägar flyttade den i fel tabell. Ett header-klick satte inte den tabellen som mål, så upplösningen föll tillbaka på tabellen som senast hade cellfokus.

- `apps/web/src/column-move.ts`: målupplösningen föredrar nu den senast aktiverade kolumnen (header-klick eller cellfokus) före den fokuserade panen. Fokus är kvar som fallback när ingen kolumn aktiverats. Ett explicit `viewId` vinner fortfarande.
- `apps/web/src/panes.tsx`: varje kolumnaktivering publiceras direkt via `activateColumn`, även ett upprepat header-klick som lämnar `activeColumn` oförändrat. Det gör att tangentbordet och Ctrl+K följer den tabell vars header användaren senast klickade. Sortering på header-klick är oförändrad.
- Header-menyn, cellfokus, radmenyn, buslyssnaren och ett explicit `viewId` behåller samma `viewId`-plumbing som #270.
- `apps/web/src/column-move-target.test.tsx`: två tabeller med samma `Name`; senast aktiverad kolumn vinner över fokus, explicit `viewId` vinner, och ett header-klick (även upprepat) sätter målvyn.
- `apps/web/e2e/column-move-target.spec.ts`: Products och Articles sida vid sida. Alla fem vägar körs mot båda tabellerna och båda riktningarna: tangentbord efter header-klick, Ctrl+K efter header-klick (inklusive upprepat klick), cellfokus-tangentbord, header-meny och explicit `ui.move_column` på bus. Varje steg kontrollerar att grann tabellen behåller exakt sin kolumnordning; första/sista kolumn är gränsfall och omladdning bevarar ordningen.
- Bevis i uppgiftsägda `--rm`-containrar på `row107follow-net` mot syntetisk Postgres 18 och Typesense 30.2, utan host-verktyg, hostnätverk eller Docker-socket: `pnpm typecheck` grön; hela vitest-sviten 150 filer / 816 tester gröna; `column-move-target.spec.ts` 1/1 (30,5 s); `move-col-flash-sse`, `column-drag-and-system-fields`, `palette-root-focus` och `shortcut-registry` 13/13; `scripts/check-english.py` exit 0. Skärmdumpar: `01-before.png` till `06-after-reload.png` i uppgiftens scratchkatalog.
- `apps/web/src/data-model.tsx` är orörd (`sha256 2d3459c60dd7473f2af3c0ff15cf1fd3295b5bc1da9da0e1046905de35babcaa`).
- Header-klick sorterar fortfarande. Om header-klick i stället ska välja utan att sortera, eller om ett separat väljargest ska införas, bör bli en egen backlog-rad; det är inte ändrat här.

## Rad 212-uppföljning — levererad på main (#273)

Mergad till `main` som #273 (`77ff773`). Grenen utgick från `549d2d3` (#271). Inte deployad eller accepterad. Den rättar en kvarvarande
inkonsekvens efter #268: när A redan var sparad (raden `accepted`) och B
fortfarande `pending`, stängde en Discard från draft-baren det öppna
förslaget som `discarded`. Samma blandade medlemskap via den historiska
återställningsvägen på ett redan stängt förslag behöll `accepted`. Review →
Proposals visade alltså olika slutstatus beroende på vilken Discard-väg som
användes, trots att en rad faktiskt hade tillämpats.

- `Store::discard_proposal` härleder nu den öppna radens slutstatus från
  medlemskapet på samma sätt som `finalize_proposal`: minst en `accepted` rad
  ger `accepted`, annars `discarded`. Kvarvarande `pending`-rader avvisas
  fortfarande i samma transaktion.
- Historisk återställning av ett redan stängt förslag behåller sin tidigare
  status, avvisar bara `pending`-rader och skriver samma
  `proposal_recoveries`-granskningsrad som förut. Därmed slutar båda vägarna
  `accepted` för ett blandat utfall, och ren Discard utan accepterade rader
  slutar fortsatt `discarded`.
- Katalogägarskap, claim/lease, scoped Discard och rollskydd från #268 är
  oförändrade.
- Regressioner: `crates/store/tests/proposals.rs` har
  `discard_of_an_open_mixed_proposal_ends_accepted` (A accepterad, B
  `pending`, Discard via store-vägen) och
  `discard_of_an_open_proposal_without_accepted_rows_ends_discarded`.
  Historiska `discard_recovers_a_closed_proposal_with_pending_rows_idempotently`
  kräver fortsatt `accepted`, B `rejected` och en granskningsrad.
  `crates/api/tests/http.rs` beskriver nu samma blandade fall över HTTP:
  `discarded["status"] == "accepted"` med A `accepted` och B `rejected`.
- Bevis i engångscontainrar (`docker run --rm`, eget nät, tmpfs, ingen
  hostnetwork, ingen demo-DB): `cargo fmt --all --check` (exit 0),
  `cargo clippy -p braian-store -p braian-api --all-targets -- -D warnings`
  (exit 0), `cargo test -p braian-store` (105 godkända),
  `cargo test -p braian-api` (219 godkända, 1 ignorerad live-test),
  web-typecheck (exit 0), hela vitest-sviten (810 godkända; 5 tidskänsliga
  filer slog timeout under full körning och passerade 34/34 vid isolerad
  omkörning), English checker (exit 0) och
  `e2e/proposal-lifecycle.spec.ts` (1 godkänd, 49,1 s).
- Testbevisets väg: QA-skärmbilderna under
  `/workspace/braian-qa/212-retest268-20261109-0949/` (`01-version` …
  `07-after-discard-B`) visar mixed draft-bar Discard; den här grenen jämför
  den vägen med historisk Discard-återställning av samma medlemskap.
- `apps/web/src/data-model.tsx` är orörd
  (`sha256 2d3459c60dd7473f2af3c0ff15cf1fd3295b5bc1da9da0e1046905de35babcaa`).
## Rad 135 uppföljning — levererad på main (#272)

Demo-omtesten efter #269 visade att tabellcellens 2px-ring är rätt, men att tangentbordsfokus fortfarande saknades på några ställen. Mergad till `main` som #272 (`f001573`). Den rättade den kvarvarande fokusringen efter #269. Inte deployad eller accepterad.

- `apps/web/src/styles.css`: tar bort `.pane-tab.active .pane-tab-open:focus-visible { outline: none; }`, så även den aktiva pane-fliken (till exempel Products) får samma 2px accentring på Tab som en inaktiv flik.
- `apps/web/src/styles.css`: delar upp sökfältet. Endast `:focus-within` har `box-shadow: var(--inset), 0 0 0 2px var(--accent)`. `:hover:not(:focus-within)` byter till den mjukare `--hover`-fyllningen utan accentring, så hover inte ser ut som fokus.
- Övriga `outline: none` i `styles.css` är genomgångna och behålls där de redan ersätter ringen med en likvärdig accentbehandling: grid med `.active-cell` (inset-ring), cell-editor (accentkant), inre `.search-field input`, menyalternativ med `data-highlighted`, palettens frågefält (ring på containern) och create-dialogens fält (accentkant). Ingen blanket-borttagning.
- `apps/web/src/focus-ring.test.ts`: två enhetsregressioner: aktiv pane-flik får inte längre en outline-suppressor, och sökfältets hover-regel får inte innehålla 2px accentringen medan `:focus-within` måste göra det.
- `apps/web/src/user-menu.test.tsx`: Account-triggern är en native `button` med `aria-label="Account"`, `tabIndex` 0 och inte disabled.
- `apps/web/e2e/focus-styles.spec.ts`: hover på sökfältet ger ingen fokusring; Account-avataren och den aktiva pane-flikens `.pane-tab-open` nås med enbart Tab från sidstart efter inloggning och visar 2px accentring. Befintliga fokus-, nested-chrome- och tabelltester behålls.
- `apps/web/e2e/layout.spec.ts`: CI:s e2e-shard 1 föll på den gamla hover-assertionen för Articles sökfält. Hover-delen kräver nu ingen accent och ingen 2px-ring, bara `outline: none`, `hovered` och en mjuk fyllnadsändring; fokusdelen behåller kravet på 2px accent via `:focus-within`.

Muspekarens beteende: ett vanligt klick på en tabellcell visar inte den accentfärgade 2px-ringen. Ringen är tangentbordsfokus (`.grid:focus-visible .row.selected .cell.active-cell` / `.row.active .cell.active-cell`), medan urvalet är dimfyllning plus 3px vänsterkant. Det är samma separering som rad 135 krävde, och `e2e/focus-styles.spec.ts` assertar att ett pointer-klick lämnar `:focus-visible` falskt och cellen utan ring.

Verifierat i isolerade `--rm`-containrar på ett task-ägt Docker-nätverk mot syntetisk Postgres 18 och Typesense 30.2, utan demo, host-verktyg, host-nätverk eller Docker-socket: typecheck grön; hela web-enhetssviten 150 filer / 818 tester grön; `focus-styles.spec.ts` 14/14 (inklusive de två nya regressionerna), `nested-chrome.spec.ts` 2/2 och `user-menu.spec.ts` 6/6; `check-english.py` grön. I webbläsaren (mörkt tema) nåddes Account på Tab-steg 8 och den aktiva pane-fliken på steg 16 från sidstart, båda med `2px solid` accentring. Skärmbilder skrevs till den gitignorerade `apps/web/test-results/focus-screenshots/` och committas inte.

## Rad 135 — levererad på main (#269)

Rättar Test-avvisningen 2026-11-07 15:42 Europe/Stockholm: den aktiva tabellcellens tangentbordsmarkering är nu `box-shadow: inset 0 0 0 2px var(--accent)`, inte `inset 0 0 0 1px var(--accent-hover)`. Urval och fokus är fortfarande separata: vald rad behåller `--accent-dim`-fyllningen och 3px vänsterkant medan 2px accent-ringen följer den aktiva cellen. Ingen ny shortcut eller urvalssemantik.

- `apps/web/src/styles.css`: 2px accent inset på `.cell.active-cell` när griden har tangentbordsfokus.
- `apps/web/src/focus-ring.test.ts`: regressionen kräver exakt 2px `--accent` och avvisar `--accent-hover`.
- `apps/web/e2e/focus-styles.spec.ts`: Tab till användarmenyn, trädet och tabellen; vald rad behåller sin fyllning när ringen flyttar mellan celler.
- `apps/web/e2e/nested-chrome.spec.ts`: den kvarvarande syskonassertionen krävde fortfarande `--accent-hover`; den kräver nu exakt `0px 0px 0px 2px inset` i `--accent` och avvisar `--accent-hover`, medan urvalets 3px vänsterkant, dimma fyllning och frånvaro av extra markör behålls.

Verifierat i isolerade `--rm`-containrar mot syntetisk Postgres 18 och Typesense 30.2, utan demo, host-verktyg eller Docker-socket: typecheck grön; 57 enhetstester i 5 filer gröna; `focus-styles.spec.ts` 13/13, `grid-focus-select.spec.ts` 1/1 och `user-menu.spec.ts` 6/6. Beräknade stilar i webbläsaren (mörkt tema): aktiv cell `rgb(154, 77, 255) 0px 0px 0px 2px inset`, träd `2px solid` med offset `-2px`, användarmeny `2px solid` med offset `0`, grid utan extra outline, vald rad `rgba(154, 77, 255, 0.28)` med `rgb(154, 77, 255) 3px 0px 0px 0px inset`. Skärmbilder togs i den isolerade körningen (`apps/web/test-results/focus-screenshots/`, ej committade).

CI på `e022849` föll i jobbet e2e3 på just den gamla syskonassertionen i `nested-chrome`, inte på fokusregeln. Efter rättelsen kördes `nested-chrome.spec.ts` mörkt och ljust (2/2) samt `focus-styles.spec.ts` (13/13) om i task-egna `--rm`-containrar mot samma typ av syntetiska Postgres/Typesense; inga fokus-styles-assertioner ändrades eller försvagades. Oberoende kodgranskning accepterade koden vid `3b6ca5f`, medan dokumentationsgranskningen kvarstår. Mergad till `main` som #269 (`ef9b43a`); inte deployad eller accepterad.

## Rad 107 — levererad på main (#270)

Kolumnflytt (Notion 107) är mergad till `main` som #270 (`a7e7d58`) och ingår i basen. Den är inte en del av den här PR:en (rad 135-uppföljningen) och är inte deployad eller accepterad. Reproduktionen 2026-11-07: Products och Articles har båda `Name`, och Ctrl+Shift+→ på Products.Name flyttade `Name` i båda tabellerna eftersom `ui.move_column` broadcastades utan vyidentitet.

- `apps/web/src/column-move.ts` är en gemensam målupplösning. Tangentbordet läser fokuserad vy och den vyns egen aktiva kolumn (`readActiveColumn`), aldrig en annan panes rubrik. Register-körarna (`column:move-left/right`), Ctrl+K, header-/cell-/radmenyn och buslyssnaren använder samma `viewId`.
- Header- och cellmenyn skickar `target.viewId = view.id`. Ctrl+K tar den fokuserade tabellen, annars tabellen vars rubrik senast aktiverades (samma `viewId`), och läser den tabellens egna kolumner. `ui.move_column` bär `{ column, direction, viewId }`. `ObjectTable` lyssnar bara när `viewId` är dess egen vy; ett äldre event utan `viewId` följer fokus i stället för att broadcasta.
- Agenten får `viewId` i `ui_move_column`-anropet. `selection_args` behåller ett explicit `viewId` och fyller annars i fokuserad pane från UI-snapshoten. `ui_command` ekar argumenten oförändrade.
- Oförändrat: Ctrl+K:s fyra Alt+piltangbordsrader för Focus pane, grannpanesnavigering, dockens Move left/right/up/down/Maximize/Close med titel+genväg, Alt+←/→ och Ctrl+Alt+Z maximera/återställ. Inga nya dubblettrader i paletten.
- Vitest: `column-move-target.test.tsx` (två tabeller med samma `Name`, tangentbordsmål, explicit header-/palettmål efter fokusbyte, agent-/busdispatch utan viewId-broadcast, gränsfall) samt registry-, palette-, shortcut- och ui-bus-testerna. `cargo test -p braian-api ui_move_column` och `move_column_args_follow` täcker agentargumenten; `cargo fmt --all --check` är grön.
- Playwright: `e2e/column-move-target.spec.ts` skapar en isolerad workspace med Products och Articles sida vid sida, flyttar `Name` med Ctrl+Shift+→, Ctrl+K, header-menyn med fokus i Articles och en explicit `ui.move_column` på bus; före/efter-kolumnordning för båda tabellerna, gränsfall för första/sista kolumn och omladdning ingår. Skärmdumpar: `artifacts/row107/01-before.png` till `05-after-reload.png`.
- Körningarna är gjorda i isolerade `--rm`-containrar på ett uppgiftsägt Docker-nätverk mot syntetisk Postgres/Typesense. Web-typecheck är grön. Full web-unitsvit utan `path-cell` gav 810/811; den enda röda var en 5-sekundstimeout i den tidskänsliga `palette-home-end.test.tsx`. `palette-home-end`, `path-cell`, `active-row` och `column-move-target` passerade tillsammans vid isolerad omkörning (31/31). Ingen av dem rör den här ändringen.

## Rad 170 (mergad i #265) — i basen, inte den här PR:en

Läsbara URL:er (Notion 170) är mergade i `main` som squash `61c6e3c` (#265). Den här grenen har nu `origin/main` `549d2d3` (#271) som bas, som redan innehåller den ändringen, så avsnittet beskriver basen och inte ett omergat arbete i den här PR:en. Rad 135- och rad 107-ändringarna rör inte URL- eller review-koden.

- `ws`, `view` och `catalog` är slug av visningsnamn. Unicode-bokstäver och siffror behålls (NFKC, gemener); ett namn utan bokstav eller siffra får ett `~`-suffix av id:t. `object` är objektets nyckel, inte ett uuid.
- Nuvarande namn eller nyckel är adressen. Ett byte byter URL:en. Gamla länkar och uuid-adresser öppnas inte. Inga redirectar.
- `~` och ett kort hex-suffix används när sluggen eller nyckeln krockar i samma omfång. Lägsta id behåller den nakna token. Ett `~` i en nyckel escapas som `~~`.
- Nyckellösa objekt (länkrader) får `~` plus det slumpmässiga id-suffixet, inte tidsstämpel-prefixet som UUIDv7 delar. Delar flera nyckellösa rader samma 8 tecken förlängs suffixet (12, 16, sedan 32) tills det är unikt. De slås upp med `GET /v1/objects?id_suffix=...` i katalogen; typen utelämnas eftersom en länkrad har länktypen.
- `GET /v1/objects` accepterar både typnyckel och typ-id i `type`. Sparade vyer lagrar typ-id (V18), så en direktlänk annars fick tom träff.
- Vitest täcker Unicode-slug (även namn som bara är kombinerande tecken), fallback, krock, escapad `~` i typad SKU, nyckellöst suffix som förlängs vid delad svans, kodning, uuid-avvisning, att en delad nyckel slås upp i produkttypen och att ett URL-objekt inte tappas när en annan rad redan är vald. `e2e/readable-urls.spec.ts` är registrerad i `scripts/e2e.mjs`: direktlänk och omladdning, nyckel i stället för uuid, navigationsslug, byte av nyckel, dubbletter, kodning, typad SKU med `~`, bakåt/framåt, trasig eller saknad måltavla, nyckellös länkrad efter omladdning och två kolliderande nyckellösa länkar vars utskrivna förlängda tokens laddas om. `e2e/palette-drill.spec.ts` har ett regressionstest för att inloggning når en objekttabell även när en tidigare sparad layout har en agentflik i fokus. Körningen är gjord i isolerade `--rm`-containrar mot syntetisk Postgres/Typesense; den är inte deployad.

## Rad 215 — Edit selection-dialogen (mergad i #271)
## Rad 215 (mergad i #271) — i basen, inte den här PR:en

Rapporten gällde att kontrollerna i Edit selection inte svarade på klick i Articles-arbetsytans Selections-panel. På basen `4cd25f7` gick klickflödet igenom i Chromium, Firefox och WebKit, både från radmenyn och från högerklick, efter att urvalet tillämpats och med en stagad objekt-draft. Ingen pointer-interception eller överlägg kunde reproduceras.

Det som däremot gick att reproducera var fokus: dialogen öppnades från radmenyn med fokus kvar på radens "More actions"-knapp bakom modalen, och efter stängning hamnade fokus på `<body>`. Orsaken var att den delade `DialogContent` fångade opener i sin `useState` när komponenten monterades med skalet (långt före öppningen), och att `autoFocus` på namnfältet hann flytta fokus innan Radix `onOpenAutoFocus`. Nu fångas opener i `DialogContent` under render medan innehållet ännu inte är monterat, alltså innan ett `autoFocus`-fält hinner ta fokus (till skillnad från `onOpenAutoFocus`, som körs för sent), menyn fokuserar sin trigger innan kommandot öppnar dialogen, och namnfältet får fokus via Radix fokusomhändertagande. CI-regressionen där `create-dialog`-dialogen tappade opener-fokus efter stängning är åtgärdad; `create-dialog.spec.ts` går grönt (12/12) tillsammans med `edit-selection-click.spec.ts` (6/6). Efter Cancel, X och Escape återgår fokus till radens meny-knapp; inget överlägg ligger kvar och `body` har `pointer-events: auto`.

`e2e/edit-selection-click.spec.ts` (registrerad i `scripts/e2e.mjs`) täcker: öppna via faktisk meny, klicka namnfältet, byta namn på den seedade manuella Articles-selectionen Cheese, Save selection, synligt namn och API-läsning efter omladdning, Cancel/X/Escape utan oavsiktlig ändring, upprepad öppning, Type/Kind låsta i edit-läget, samt en stagad tabelldraft. Körningen är gjord i isolerade `--rm`-containrar mot syntetisk Postgres/Typesense. #271 är mergad till `main` som `549d2d3`; den är inte deployad eller accepterad.

## Levererat sedan 2026-11-01 (verifierat via `git log` på main)

Sedan statusen 2026-11-01 (`8300319` / #145) har ungefär #146–#272 landat (`git rev-list --count 8300319..f001573`; #265, som gav rad 170 läsbara URL:er, är mergad som `61c6e3c`, #270 som gav rad 107 kolumnflytt stannar i måltabellen är mergad som `a7e7d58`, och #271 som gav rad 215 Edit selection-fokus är mergad som `549d2d3`). Den här PR:en är rad 107-uppföljningen (rubrikklick sätter måltabell) och är inte mergad, deployad eller accepterad. #272 (`f001573`) och #273 (`77ff773`) landade på main. Många leveranser står på Att testa i Notion och väntar på Glenns genomgång.

### Kartläggning #253–#270 (squash på main, `git log` + `gh pr view`)
- #253 `2d78daf` · rad 149 · fix(web): move hardcoded UI strings into copy (row 149)
- #254 `434697a` · docs-only, ingen Notion-rad · docs: refresh status.md for 2026-11-06
- #255 `4583c56` · rad 153 · fix(web): grid focus without select; Enter/Space select (row 153)
- #256 `bb024d8` · uppföljning rad 153 · fix(web): keep suggestion badge out of name cell title/text
- #257 `97e7fbb` · rad 154 · feat(web): standardize UI buttons on Button variants (row 154)
- #258 `aacc665` · rad 157 · fix(web): model graph edge labels + settle (M14 / row 157)
- #259 `9ac66f4` · rad 159 · refactor(web): type and space tokens (L1 / row 159)
- #260 `e0e1834` · rad 142 · Soft-delete user-facing rows, with trash and a 30-day cleanup
- #261 `85fe6d4` · rad 206 · Save safe model edits directly; confirm only destructive changes (row 206)
- #262 `1d179b1` · rad 171 · fix(agent): propose a display-name change for a named product (row 171)
- #263 `fc09d6c` · rad 205 · fix(web): attribute table bool columns use Braian checkboxes and pointer cursor
- #266 `ca7a786` · review · feat(review): project every draft into one save or discard (#266) — agentförslag, importrader, config-apply och personens modelldraft läses som samma `ReviewDraft`; Save och Discard går kvar via befintliga proposal- och modelldraft-writes
- #267 `4cd25f7` · rad 212 · Show one shared object draft in the table and Detail (#267) — en delad objekt-draft i tabell och Detail; Enter stagar en cell, Save skriver den, och en sen eller äldre läsning kan inte ersätta draften
- #268 `a7a8ce2` · rad 212 · fix: preserve pending proposal rows and support scoped discard recovery (#268)
- #269 `ef9b43a` · rad 135 · fix(web): restore 2px accent keyboard focus ring for active cells (#269)
- #270 `a7e7d58` · rad 107 · fix(web): target column move to one view (row 107) (#270)

### Seed, kataloger och config
- #146: status.md 2026-11-01.
- #147 (+ följdcommits): källkataloger, mergeprofiler och huvudkatalog (Notion 117) + config apply för Catalog/MergeProfile/Ownership.
- #185–#186: mer realistisk grocery-demo; seed som tål befintlig demo-DB i stället för att krascha.

### Felhantering, dialoger och designpolish
- #188, #190–#194, #196–#199, #203–#206 m.fl.: synliga skrivfel (toast/inline), danger-confirm utan type-to-confirm, fokusring, en kantnivå, accentpolicy, delade Dialog/Popover, F-/H-fynd (rader omkring 134–183, 152, 158, 160–166).
- #257 `97e7fbb` (rad 154): feat(web): standardize UI buttons on Button variants (row 154) — knappar på `Button`-varianter (design M11).
- #259 `9ac66f4` (rad 159 / L1): refactor(web): type and space tokens (L1 / row 159) — typ- och spacing-tokens i stället för hårdkodade px.

### Länkar
- #207–#208, #195/#224–#227: sökbart länk-mål, drag-för-länk, kardinalitet/replace, två vyer sida vid sida, Link to-undermeny, demolänktyp produkt→leverantör via config apply.

### Agent
- #202, #209, #212, #217, #222, #235–#237: agentredigering i Detail, egen flik/vy, bakgrundskörningar och agents-lista, rename utan fråga, disabled Send, vänsterkant/marker, proposal-diff-tooltips.
- #262 `1d179b1` (rad 171): fix(agent): propose a display-name change for a named product (row 171) — visningsnamnsförslag för namngiven produkt.

### Ctrl+K / command-registry (rad 107)
- #187, #195, #231–#234: Raycast-lik palett, registry-styrda kolumnflytt- och layout-rader (`palette:true`).

### Show by default och prototyproute
- #247–#249 (rad 192): `show_by_default` på attribut; create-popup och Detail/tabell-defaultkolumner respekterar flaggan.
- #250: field-picker-prototypen ute ur produktionsbygget (rad 167).

### Sources / Merge
- #251 (rad 148): Merge runs — tabellrubriker, JSON expand, objektväljare.
- #252 (rad 147): Sources merge profiles / ownership — etiketter, hjälptexter, strukturerad ownership-editor, Dialog i stället för `window.confirm`, ingen header-flash.

### Copy / i18n
- #253 `2d78daf` (rad 149): fix(web): move hardcoded UI strings into copy (row 149) — strängar i `apps/web/src/i18n.ts` `copy`, sentence case på palette/field-picker-fot (t.ex. Run, Ask AI, Toggle / open).

### Tabell, fokus och celler
- #255 `4583c56` (rad 153): fix(web): grid focus without select; Enter/Space select (row 153) — `role=grid`, fokus ≠ urval; Enter/Space markerar rad; Detalj följer urval (design M9).
- #256 `bb024d8` (uppföljning rad 153): fix(web): keep suggestion badge out of name cell title/text — badge utanför namncellens `title` och textContent (`cell-name`).

### Datamodell
- #258 `aacc665` (rad 157 / M14): fix(web): model graph edge labels + settle (M14 / row 157) — synliga kantetiketter och stabiliserad layout.
- #261 `85fe6d4` (rad 206): Save safe model edits directly; confirm only destructive changes (row 206) — säkra ändringar sparas direkt.
- #263 `fc09d6c` (rad 205): fix(web): attribute table bool columns use Braian checkboxes and pointer cursor — bool-kolumner med delad Radix-checkbox; Tab hoppar över inaktiverade.

### Soft delete och papperskorg
- #260 `e0e1834` (rad 142): Soft-delete user-facing rows, with trash and a 30-day cleanup — `deleted_at`, `GET /v1/trash`, återställning och 30-dagars rensning (`V43__soft_delete.sql`, `braian purge-deleted`, API-janitor). Slice: objekt, länkar, arbetsytor/vyer, sortiment, importmappningar, katalog/merge. Utanför slice: definitionsrevisioner, `view_types`/`job_types`-PK, `workspace_templates.key`, ephemeral-rader och förslag via status — inte allt är soft delete.


## Levererat sedan 2026-10-25 (verifierat via `git log` på main)

Endast mergade PR:er i intervallet #104–#145 (läget vid status 2026-11-01). #103, #121, #122, #127, #129 och #131 stängdes utan merge och räknas inte som levererade.

### Tabell, fältväljare och kolumnpreferenser
- #104–#105: Fields ›-prototyp och riktig fältväljare med hop-kolumner och prefs v2.
- #106–#111, #113, #115, #117–#119: demo- och flikbuggar i fältväljaren, pathValues, keep-alive/dirty-gate för multitab, sort/filter, nested Fields ›, move-column/SSE.
- #112: kolumnpreferenser sparas med TanStack Query-mutationer.
- #114: systemfält i Fields › och dnd-kit kolumndrag.

### Datamodell-arbetsytor
- #123: legacy Data model-arbetsytor återställs till standardmallen.
- #125–#126: läker layouts med hängande view-id:n, utan Unavailable-flash.
- #130: radmarkering, hover och piltangenter i Data model-tabellen.

### Celleditor
- #128: caret kvar vid cellredigering; PATCH av lokaliserat namn.
- #132: tangentbord blockeras medan en cell-editor är öppen.
- #134: Status som Select; systemkolumner går inte att redigera inline.
- #139: cell-editor väntar tills path-values är laddade (Notion 111).

### Arbetsytor, mallar och behörighet
- #135: aktiv arbetsyta överlever omladdning (Notion 106).
- #136: ta bort arbetsyta (Notion 110).
- #137: membership-grindar för workspace/view (följd till #136).
- #138: New from template öppnas som undermeny i paletten.
- #142: openTypeView väntar tills workspace-dokumentet är klart (Notion 112).

### Tangentbord, register och Ctrl+K
- #120: Ctrl+K öppnar alltid palettroten med synk fokus.
- #140: shortcut-register med Ctrl+Shift kolumnflytt (Notion 107).
- #143: Home/End flyttar caret i Ctrl+K-frågefältet.
- Ctrl+K: kommandon med argument (`ui.open_view` `{id: view}`, `ui.open_workspace` `{id: workspace}`, `get_object` `{id: object}`, plus Open product per typ) öppnar en sökbar undernivå. Tab går in, Backspace och Esc går upp, Ctrl+J frågar agenten. Senaste valen ligger överst. Params-schemat följer med i `GET /v1/operations`, MCP `tools/list` och agentens verktyg.

### Statusrad och ny version
- #144: statusraden erbjuder Reload när en nyare deploy finns (Notion 113).

### Vyer / datakällor
- #145: object_table-källa = alla objekt av en typ; Ctrl+K Data source, trepunktsmeny Select source, rubriketikett (Notion 103 PR 1).

### Import och header
- #141: import som utkast (drafts) + städad header (Notion 46 + 114).

### API-klient, store och CI
- #116: typad OpenAPI-klient för webbappen.
- #124: store byggs om när inbäddade migreringar ändras.
- #133: CI återanvänder release-binären och kortar stack-jobbet.

## Nyligen levererat — detaljer (PR 267–268)

- **Rad 212 / PR 267 (PR2, mergad i #267): en delad objekt-draft i tabell och Detail.**
  Grenen `junior/212-ai-drafts` byggde på `ca7a786` (#266) och är mergad till
  `main` som #267 (`4cd25f7`). Enter stagar en cell i en modulstore som både
  tabellen och Detail läser. Save/Discard gäller exakt de granskade raderna.
  Språkberoende celler har identitet per objekt, attribut och språk, och en
  sammanslagning tappar inte andra språk. En sen eller äldre läsning kan inte
  ersätta en öppen draft eller ett värde som sparats på en nyare version.
  Endast den exakta snapshoten som skickades rensas vid Save; ändringar som
  skrivs medan anropet väntar ligger kvar. Misslyckade rader i en delvis
  accept eller ett transportfel behåller sin draft.
- Agentytan visar status och navigering. `data.messages`-chatten
  (agent-question/agent-answer) renderas inte längre där. Create utan
  `object_id`, `$delete` och modelldrafts har en synlig väg till
  förslagsgranskningen i stället för att gömmas bakom borttagna panelkort.
- `apps/web/src/data-model.tsx` är inte ändrad. Modellstegens stabila nycklar
  finns i den delade granskningsprojektionen och som klienthjälpare, men är
  inte inkopplade i data-modelltabellen än.
- Kvar till PR3: import/config-flöden som inte är en vanlig objektcell,
  per-fält-delaccept, samt inkoppling av modellstegsnycklar i
  `data-model.tsx` i efterföljande arbete. Importdrafts ligger kvar i
  importtabellen; modelldrafts har egen yta.
- En lokal draft vinner över en väntande proposal på samma objekt: Save
  skriver draften och proposalen blir stale i stället för att blockera.
  Stale/konfliktande proposals hoppas över vid Save men ligger kvar för
  Discard. Save-scope är de synliga raderna; Discard följer
  medlemskapsregeln nedan, så proposals på andra objekt rörs inte. Efter Save
  rensas exakt den skickade snapshoten och förslags-cacharna uppdateras. En
  proposal som ett agentkörning skapar medan
  en tabell eller Detail är öppen syns inom några sekunder.
- Discard stänger hela proposalen på servern. En whole-proposal-discard kräver
  därför fullständig medlemskap: alla pending-rader, inklusive objekt utanför
  vyn och create/delete/model/assortment. Callers skickar hela medlemskapet i
  stället för bara de synliga update-cellerna. En proposal med minst en
  ogranskad rad bevaras och ligger kvar i granskningsvägen; ingen partiell
  discard hittas på. Regressionstester renderar de faktiska `ObjectTable`- och
  `ObjectDetail`-anroparna med visibleA/hiddenB, update+create/delete och
  model/unmapped.
- Verifierat för rad 212, allt i throwaway-containrar:
  `./node_modules/.bin/tsc --noEmit` (exit 0), targeted-regressionerna
  (`object-draft-save`, `object-draft`, `detail-pending`,
  `object-draft-discard-table`) 4 filer / 60 tester och hela vitest-sviten i
  `apps/web` (147 filer, 777 tester) i `node:22-bookworm`.
  `cargo test -p braian-store --test review_drafts` (4 tester mot en
  isolerad throwaway-Postgres) passerade i `rust:1.93-bookworm` i stage 3.
  Playwright mot isolerad Postgres/Typesense/API (eget nät, tmpfs, ingen
  hostnetwork): smoke (1), change-flow (2), write-error (1),
  status-select-cell-edit (1), cell-editor-unloaded-value (1) och agent-tab
  (11 + 1 skärmbild skippad) passerade i en batch. inline-cell-edit (1) och
  detail-name-edit-flicker (1) passerade i separata, isolerade körningar; i den
  delade batchen färgades de av kvarvarande agent-proposals mellan spec-filer
  (registrerad runner isolerar per fil). Nya regressionstester täcker
  språkidentitet, återöppnad editor, semantiska no-op-drafts, samtidiga
  ändringar, scope, fullständig proposal-medlemskap, partiella fel, sena
  läsningar och stabila modellstegsnycklar. Inget påstående om acceptans eller
  deploy.
- `model-draft.spec.ts` är nu anpassad till nuvarande datamodellsyta:
  Object types-tabellen, Type attributes-tabellen, create-dialogen för
  attribut och attributmenyns Min/Max. Den använder inte längre de borttagna
  `type-recipe`-, `attr-add`-, `attr-min`-, `attr-max`- eller
  `review-lines`-kontrollerna. Det isolerade hela browserflödet (skapa typ och
  värdelista, skapa/redigera Number-attribut med enhet och Min/Max, spara,
  avbryta en create-dialog, öppna och avbryta delete, samt radera typen)
  passerar: 1 test, 0 skippade. `data-model.tsx` är fortfarande orörd.
- Historisk korrigering: stage 3:s första targeted-körning var 59 godkända och
  1 underkänd innan Table-testet rättades. Den senare fulla sviten (777)
  innehöll den rättade testen. Siffran 60 påstås först efter stage 4:s nya
  riktiga körning ovan.
- Separat baseline, ingen fix blandad i rad 212-arbetet:
  `group-filter.spec.ts` passerade i den isolerade körningen; den kända
  avvikelsen på main (`expected 4, got 1`) återupprepades inte där.
  `model-draft.spec.ts` är inte längre en känd avvikelse i rad 212-arbetet.

- **Rad 212 / livscykel för förslag (mergad i #268).**
  Grenen `junior/212-proposal-lifecycle` utgick från `4cd25f7` (#267) och är
  mergad till `main` som #268 (`a7a8ce2`). Den rättar rotorsaken som QA hittade: när en
  person sparade bara de synliga raderna stängdes hela förslaget trots att en
  dold rad fortfarande var `pending`. `accept_proposal` räknade bara det
  skickade urvalet; `close_claimed_proposal` fanns med full medlemskap men
  användes inte på den vanliga accept-vägen. Dessutom kunde `set_proposal_status`
  sätta `accepted` med kvarvarande `pending`, vilket gjorde att en historisk
  sådan proposal inte kunde discardas (409).
- Ändringen: `finalize_proposal` läser hela medlemskapet och stänger bara när
  ingen rad är `pending`, i samma transaktion som claimen. Alla kvarvarande
  `pending`-rader - ovalda, misslyckade, versionskrockade eller med soft-deletad
  objekt - håller förslaget öppet. `accepted` sätts när minst en rad är
  accepterad, annars `discarded`. Accept vägrar ett förslag som redan är stängt.
  `set_proposal_status` vägrar stänga utan att först avvisa `pending`-rader.
- Stödd städning av historiska `accepted`/`discarded`-förslag med kvarvarande
  `pending`: `discard_proposal` claimar, avvisar bara `pending`-rader och behåller
  redan accepterade rader och redan persistade objektvärden. Soft-deletade
  objekt behöver inte röras och ingen databasreparation krävs. Åtgärden är
  atomär och idempotent; en ny tabell `proposal_recoveries` (V44) skriver en
  granskningsrad per faktisk återställning, inte vid upprepade no-op-anrop.
  Roll- och stale-skydd ligger kvar i API:t.
- Katalogisolering före varje claim/mutation: `proposal_catalog` läser ägaren
  och Accept/Discard avvisar en proposal från en annan katalog med 404 innan
  importgrenen eller claimen körs. `claim_proposal` och `discard_proposal`
  filtrerar dessutom på `catalog_id` i samma transaktion, eftersom kataloger
  är en session-inställning och inte row-level security. En API-regression
  skapar en källkatalog och bevisar att cross-catalog Accept/Discard lämnar
  rader, `claimed_by`/`claimed_until` och `proposal_recoveries` orörda; en
  master-Discard når inte heller en proposal i en källkatalog. Samma-katalog
  Discard är fortsatt idempotent och bevarar accepterade rader och live-värden.
- Bevis i den här grenen, allt i engångscontainrar (`docker run --rm`, eget
  nät, tmpfs, ingen hostnetwork, ingen demo-DB):
  `cargo check -p braian-store -p braian-api --tests` (exit 0),
  `cargo clippy -p braian-store -p braian-api --all-targets -- -D warnings`
  (exit 0), `cargo fmt --all --check` (exit 0),
  `cargo test -p braian-store --test proposals` (10 godkända, inklusive
  katalogscopad claim/discard), `review_drafts` (4), `migration_upgrade`
  (9, med baslinje från `origin/main`), `cargo test -p braian-api --test http`
  (50, inklusive cross-catalog Accept/Discard), `config_apply` (16),
  `import_http` (9) och `product` (2). Web: `tsc --noEmit` (exit 0) och hela
  vitest-sviten (149 filer, 812 tester). English checker
  (`scripts/check-english.py`, exit 0). Ny `e2e/proposal-lifecycle.spec.ts`
  kördes mot isolerad Postgres/Typesense/API/Vite: A synlig/sparad, B dold och
  kvar som `pending`, förslaget `open`, och B syns igen efter reload:
  1 godkänd (31,9 s).
- `apps/web/src/data-model.tsx` är orörd (sha256 lika med `4cd25f7`). Inga av de
  tre faktiska demolämningarna har rörts; de kräver fortsatt verifierad deploy
  och ny QA. Mergad i #268; inget påstående om deploy eller demoacceptans.

## Öppet

- **Kataloger (Notion 117)** och **usage (Notion 45)** — Glenn bygger själv.
- **Notion 103 PR 2:** vyns källa = det som är länkat till den markerade raden i en annan vy.
- **Notion 103 PR 3:** kedjor (med cykelskydd) + Articles/Products-mallar med länkade paneler.

## Så här kör du

```bash
cp .env.example .env
just up
pnpm install
just dev
```

Öppna http://127.0.0.1:3000. API:t lyssnar på http://127.0.0.1:8090. Demokontot skapas från `BRAIAN_DEMO_EMAIL` och `BRAIAN_DEMO_PASSWORD` i `.env` (se `.env.example`). Inget lösenord ligger i källkoden. Playwright läser samma variabler, från miljön eller från `.env`, och har inget lösenord i specen. Agenten vill ha `OPENAI_API_KEY`. Utan nyckel svarar samma Ctrl+K-panel på engelska att ingen modell är kopplad, och resten av programmet fungerar.

På Windows, om `just` inte är installerat: `.\scripts\up.ps1`, `pnpm install`, `.\scripts\dev.ps1`. `just` installeras med `winget install --id Casey.Just` eller `scoop install just`.

En ren klon på Linux följde README: `cp .env.example .env`, `just up`, `pnpm install`, `just dev`. API:t lyssnade på 8090 och webben på 3000. Sökningen svarade 3 013 objekt ur den befintliga volymen, hjälteobjekten först (`ART-REGEL-45` och vidare). `just` behöver vara installerat. Första `just dev` byggde Rust-koden i klonen. Windows-anteckningarna står i README. En värd som fortfarande har replikeringsslotten `braian_relay` måste släppa den innan `wal_level` sänks. Se `deploy/drop-relay-slot.sql`.

## Det som fungerar

- Definitioner, validering (samma regler i Rust och wasm), objekt, länkar, enheter och värdelistor.
- Källkataloger och en masterkatalog. `/v1` är master. `/v1/catalogs/{key}/...` är en källa. Mergeprofiler skriver direkt till fält de äger, utan förslag. `braian all` kör mergern. Källor, profiler, ägarskap och körningar är vyer i arbetsytan Sources. Se `docs/catalogs.md`.
- Varje skrivning är en batch med aktör och, för en agent, personen agenten agerar för.
- `changes` är kön. Indexern leasar seq-intervall per spår (`interactive` och `bulk`). Ett interaktivt intervall tas medan ett bulk-intervall fortfarande är öppet. En krasch innan commit lämnar leaset. Nästa arbetare tar samma seq. `LISTEN braian_changes` väcker indexer och SSE-svansen, även när en annan anslutning committade. `braian reindex` bygger om aliaset från Postgres.
- Indexer, sök med `wait_seq`, och `braian reindex` som byter alias. Indexern hämtar många objekt per fråga och importerar dem till Typesense i batchar. Ett fält per språk i en Typesense-samling.
- Massändring som jobb (`bulk.write`) med status och fel per rad.
- Inloggning med lösenord (argon2id), cookie-session, roller admin/editor/viewer, och API-token knuten till en person. Ett ooptimerat debugbygge lät Argon2id och blake2 köra utan optimering, och inloggningen tog omkring tio sekunder på en Windows-laptop. Dev-profilen bygger `argon2` och `blake2` med `opt-level = 3`. Hash plus verify av ett lösenord tog 41 ms i den profilen, se `docs/measurements/2026-10-25-login-debug.md`.
- Operationer som UI, Ctrl+K, agenten och `/mcp` delar, med ett params-schema (`ui.open_view` tar `{id: view}`). Samma schema ligger i `GET /v1/operations`, MCP `tools/list` och agentens verktyg. Inklusive UI-operationer (`ui.open_view`, `ui.open_template`, `ui.open_workspace`, `ui.place`, `ui.link`, `ui.filter`, `ui.group`, `ui.sort`, `ui.select`, `ui.select_rows`, `ui.show_column`, `ui.hide_column`, `ui.move_column`, `ui.set_theme`, `ui.export`). De returnerar en beskrivning som webbläsaren tillämpar. En extern MCP-klient får samma beskrivning och får tillämpa den själv. En agent skriver inte direkt: `create_object`, `patch_object` och `create_link` blir förslag, även när anropet kommer från den inloggade personen via `/v1/agent`. In-app-agenten anropar OpenAI Responses (`/v1/responses`) med `reasoning.effort` satt till `none`, så `gpt-6-luna` tar emot verktyg. Punkt i ett operationsnamn blir understreck i verktygsnamnet, och det namnet mappar tillbaka till operationen. `POST /v1/agent` med `stream: true` skickar stegen som SSE (`step`, `tool`, `proposal`, `answer`). Utan nyckel är svaret samma engelska mening som förut.
- Arbetsytor och vyer som data, låsbara och delbara. Tre arbetsytor seedas: Datamodell (träd, klass, konsekvens), Berika objekt (träd, tabell, detalj, graf, historik) och Granska (förslag, batchlogg, jobb). En arbetsyta kan skapas från en mall (högerklick på fliken, eller Ctrl+K). Lås och dela sitter på samma meny. Delningens token kopieras; det finns ingen separat behörighetsvy. Rutorna är ett n-ärt träd i v4-form (`split` med `ratios`, `tabs` med numeriskt `active`). Avdelaren är egen flex, 6 px med 8 px träffyta. Förhållandet sparas i ett personligt dokument (`workspace_states`, miljö `default`) ungefär 700 ms efter sista ändringen, och localStorage ritas först. En låst eller delad arbetsyta lämnar den kanoniska layouten orörd. Återställning finns på flikmenyn.
- Tabell med serverfilter, serversortering och servergruppering. Kolumnordning, bredder, filter, gruppering och sortering sparas i vyn och kommer tillbaka vid omladdning. Piltangenter, Page Up/Down, Home och End flyttar markören. Shift utökar urvalet, Ctrl klickar av och på. Enter öppnar. Esc stänger menyn. Ctrl+Alt+pilar flyttar den fokuserade vyn. Alt+pilar fokuserar grannen. Ctrl+Alt+Shift+pilar ändrar storlek. Ctrl+Alt+Z maximerar rutan. Ctrl+Alt+W stänger vyn. Samma operationer finns i högerklicksmenyn, med kortkommandot bredvid. Massändring av markerade rader blir ett förslag. En flik kan dras till en droppzon (vänster, höger, över, under, mitten) när arbetsytan inte är låst.
- Detaljformulär i två kolumner. Etiketter är dämpade, värden sitter i mjuka fält. Typ och status är chips. Språkfält är små kort för språklistan i modellen. Demomodellen har bara engelska. Tal med enhet och intervall visas som mått. Flervärden som inte är värdelista visas som brickor. En objektreferens visar nummer och namn och väljs i en lista, inte som ett rått id. Piltangenter flyttar mellan fält. Spara ett befintligt objekt blir ett förslag med Confirm i formuläret. Nytt objekt skapas direkt.
- Datamodell är en vanlig arbetsyta från mallen Data model: strukturträd, klasslista med förälder och barn, och ett klasskort. Attribut från en föräldraklass markeras som ärvda. Egna attribut är kort med typ, enhet, flervärde, språk och om fältet är obligatoriskt. Man lägger till, tar bort och byter ordning där. En klass dras till en grupp, eller flyttas med piltangenter, Enter, Ctrl+X/Ctrl+V och Move to…. Allt går via registret (`model.move_class`, `model.add_attribute`, `model.remove_attribute`, `model.reorder_attributes`, `model.create_attribute`, `model.create_class`, `model.set_parent`, `model.draft`, `model.command`), så Ctrl+K, högerklick, agenten och `/mcp` använder samma operationer. Ingenting skrivs förrän personen bekräftar. Konsekvensvyn visar en modelldiff, antal berörda objekt, ett urval och de jobb som deklarerat fälten. Avbryt kastar förslaget. `model.command` och `model.draft` ger ett förslagsträd. En agent kan lämna trädet men kan inte acceptera det.
- Jobbhistorik per jobbtyp, med en seedad körning per typ. Historik med tidslinje, "As it was at #seq", fältdiff och återställning som förslag. Grafen visar länkar. Piltangenter flyttar markeringen, Enter öppnar en länk. Open full size täcker arbetsytan. Under kartan står var attributet kommer ifrån, och om det är ärvt från en föräldraklass. Noderna följer layouten och går inte att dra loss.
- OpenAPI beskriver alla rutter, 51 stycken, inklusive plattformens. `GET`, `PUT` och `DELETE /v1/workspaces/{id}/state` är den nya, utöver `GET` och `POST /v1/frecency`. Filen genereras om med `just openapi`. Layoutkommandon i samma register: `open_view`, `move_view`, `split`, `resize`, `swap`, `focus`, `move_view_left/right/up/down`, `zoom`, `close_view`, `get_layout`, `reset_layout`.
- Realtid till webbläsaren (SSE, med ping var 15:e sekund). En ny rad syns i aktivitetsloggen utan omladdning, som en mening (`live · Created …`), inte som rå JSON. Raden eller detaljen blinkar till i accentfärgen.

## Mätt mot 100 013 rader

Tre Playwright-körningar på den här virtuella maskinen (4 vCPU). Första objektraden efter inloggning: 489–512 ms. Filter `Kupol`: 196–199 ms. Scroll över hela höjden 2 400 337 px: 1354–1370 ms, långsammaste frame 27–46 ms. Ett sökuppslag av första sidan tog 19 ms. Siffrorna och kommandona ligger i `docs/measurements/2026-10-25-table-100k.md`.

## Det som är skrovligt

- Ctrl+K är en panel. Grupperna är Recent, Best match, On selected object, Views & workspaces och Objects. Sista raden är alltid "Ask AI: …". Ctrl+J och Agent-knappen öppnar AI-läget i samma panel, med lila kant, tidigare turer, en förloppsrad och stegen på engelska. Modellen instrueras att svara på engelska. Förslag förhandsvisas där med Cancel och Confirm. En modellmening ("add attribute weight (kg) to Drill", "set up a model for power tools") blir en rad som öppnar konsekvensvyn. Frecency sparas per person i Postgres. Panelen läser localStorage först, så listan ritas innan svaret från servern hunnit fram, och skriver sedan ihop de två. "Next time: …"-toasten visas när raden har en sparad genväg. En tom detalj visar en ledtext och kortkommandon i stället för bara ordet Detail.
- Grafens layout är tre kolumner, inte dagre eller elk. Full storlek är ett lager över arbetsytan, inte en sparad vy.
- En klassflytt som inte rör ett fält som något jobb läser visar "No job reads these fields." `POST /v1/impact` finns kvar för den som frågar efter ett fält utan att ändra modellen. Det seedade jobbet är Bulk write (`bulk.write`), som har en riktig körning. Status check (`dq.status`) är bara en registrerad stubb och seedas inte.
- Entra/OIDC och Tauri är inte byggda. Importen (CSV och Excel) blir ett förslag som granskas och godkänns innan något skrivs; se beslutet 2026-10-31 i `docs/plan.md`. En vytyp kan bädda in en URL, och vytyper kan registreras via API:t. Det finns inget pluginramverk utöver det. The seeded Supplier view type, the External demo view, and the `/embed/preview` route were removed; the built-in `embed` view type (external views via iframe, `/v1/view-types`) remains a supported public feature.
- 10 000 mediumobjekt på 8 vCPU är mätta: masskrivning 3031 obj/s (målet 5 000 är inte nått), ändring till sökbar p95 2,1 s vid 10k och 4,1 s vid 50k, omindexering på 17 s. Se `docs/measurements/2026-10-25-perf-v3-10k.md`. 1 miljon och 10 miljoner objekt är inte mätta.

## Kända fel

- En krasch innan claimen committas spelar upp samma seq-intervall. Indexern är idempotent. En konsument som inte tål dubbletter får se samma `seq` igen.
- Sökningen är till slut konsekvent utom när anropet skickar `wait_seq` från skrivsvaret.
- Exakt decimal ligger i Postgres. Indexet lagrar basenhetens värde som flyttal, så stora tal kan tappa precision i sortering.

## Tester

`cargo fmt`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace` (ändringsloggens tester behöver `BRAIAN_TEST_DATABASE_URL`; indexertesterna mot Typesense hoppar över om `TYPESENSE_URL` saknas), wasm-bygget av `rules`, `pnpm --dir apps/web exec tsc --noEmit`, vitest och Playwright. `node scripts/e2e.mjs` kör rök, drag och layout mot `braian_e2e`. Röken bekräftar ett objekts förslag innan raden räknas som sparad. `e2e/drag.spec.ts` drar en kolumn, dockar en flik och flyttar en klass via konsekvensvyn. `e2e/layout.spec.ts` drar en avdelare, dockar till varje zon, byter flikordning, maximerar, laddar om och flyttar med Ctrl+Alt+pil. Samma svit mäter att förhandsvisningen är panelets halva eller hela yta med 4px indrag (±2px), och att fönsterkanten följer 0.3-andelen plus 6px-gapet. Vitest täcker de rena layoutfunktionerna. `e2e/latency.spec.ts` är mätningen ovan och hoppas över om inte `BRAIAN_SCALE=1`. HTTP-testerna täcker modellförslag, att en agent inte får acceptera, och frecency per person. Agentanropet i enhetstesterna är mockat mot OpenAI.
