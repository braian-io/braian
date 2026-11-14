# Status 2026-11-13

## Row 238 — Detail and table Save retry and in-flight state (in progress, not merged)

Branch `junior/238-detail-save-flow` starts at `origin/main` `4fcbe4c` and keeps the
docs-first commit `aea620b` first. The branch is local only, has no upstream yet and is
**not merged, not deployed and not accepted**. Nothing below describes live behavior.

The product WIP for the four acceptance criteria is finished and committed together with
the tests and this status note:

- **Failed Save does not lock retry.** `Detail` passes `validationErrors: []` to
  `reviewCapabilities` / `draftSavePlan`; a server or transport failure is shown only in
  the existing `data-testid="detail-error"` banner. Save stays enabled for an otherwise
  valid draft, and the banner clears when a new save starts or the save succeeds. The
  table already used an empty validation list and still reports through
  `reportWriteError`/the toast.
- **In-flight is not success.** `runDraftSave` returns the named
  `DRAFT_SAVE_IN_FLIGHT` constant instead of `''` when a save is already running.
  `isDraftSaveInFlight` lets both callers ignore that result, so an overlapping request
  can never push `Saved`.
- **Pending reaches the bar.** `setSaving`/`subscribeObjectDraftSaving` expose the
  in-flight flag; the new `useObjectDraftSaving` hook uses `useSyncExternalStore`, and
  both table and Detail pass `pending={draftSaving}`. While pending, Save reads
  `Saving…` and both Save and Discard are disabled.
- **Both views share the behavior.** The table and Detail use the same constant, the same
  subscription and the same bar copy.

New `apps/web/e2e/row238-detail-save.spec.ts` covers four cases: a failed Detail Save
shows the banner and retries successfully, a failed table Save keeps Save enabled and
retries successfully, and each view shows `Saving…` with both buttons disabled while a
delayed PATCH is in flight. The in-flight case also force-clicks the disabled button and
verifies that the activity log gains no `Saved` line. Screenshots of the failed-Detail
retry state and both in-flight states are written to `apps/web/test-results/row238-shots`
(ignored by git). The spec is registered in `scripts/e2e.mjs` with a measured weight of
45 s, which makes the file weight 49 s including the 4 s reseed.

Evidence locally in this worktree:

- `docker run --rm --network none` with the real symlinked `apps/web/node_modules` and
  `node:22-bookworm`: `./node_modules/.bin/tsc --noEmit` exit 0.
- Full vitest suite in the same container: **173 files / 1022 tests passed**, including
  the new `object-draft-bar.test.tsx` (2 tests) and the new in-flight cases in
  `object-draft-save.test.ts` and `object-draft.test.ts`.
- `python3 scripts/check-english.py` exit 0 and `git diff --check` exit 0.
- `sha256sum apps/web/src/data-model.tsx` is
  `2d3459c60dd7473f2af3c0ff15cf1fd3295b5bc1da9da0e1046905de35babcaa`, unchanged.

Playwright was **written but not run locally**: the disk is at 89% and this session did
not start an isolated Postgres/Typesense/API stack. The end-to-end gate is CI on this
branch, not the local unit results.

## Rad 226 — graph-uppföljningen från 128g (inte mergad)

Grenen `junior/226-graph-fixes` utgår från `origin/main` i den här worktreen (`669c84b`, PR #319) som bygger på den begärda basen `03b207b` (PR #318). Den innehåller guide-/statuscommiten, kod-/testcommitarna och den här statusnotisen. Den är **inte mergad, inte deployad och inte accepterad**; inget här ska läsas som att beteendet är live.

CI-körning **#990 på head `4c0c79e` föll** på riktiga regressioner från rad 226: `row128e-picker-on-top` (en befintlig nods `data-x` flyttades 34 px efter add-link, och en object-caption kunde krocka med `value:created_at` i en liten pane), `row128g-graph-menu-fit` och `row226-graph-fixes` (den valda artikeln tappade `Supplier`-etiketten). Uppföljningen `bd2e39e` rättade `Supplier`-regressionerna i 128g/226, men **CI-körning #991 föll fortfarande** på 128e: stay-put flyttade en befintlig nod 29 px efter add-link och object-captionen kunde fortfarande krocka med `value:created_at` i en pane under 260 px. Den här uppföljningen fryser idle-refit-baslinjen och återställer `[full]`-only idle fit; 16 px-, kamera-, stay-put- och överlappsassertionerna i de äldre specarna är fortfarande orörda. Raden är fortfarande inte mergad.

Bara de fem acceptanskriterierna från `ACCEPTANCE.md` är byggda:

- **Pin överlever klick.** `onPointerUp` rensar inte längre `fx`/`fy` när `travel <= 3`; en ny `staysPinnedAfterPointerUp` behåller en befintlig pin genom både klick och drag, medan drag fortfarande pinnar där noden släpps. Endast **Unpin** och **Re-layout** släpper pinnen. Model graph behåller sitt gamla dragbeteende men tappar inte en pin som redan finns.
- **Kameran passar om vid laddning/F5, full storlek och orörd resize.** `[full]`-passningen (120 ms så chromen hinner sätta sig) och canvas-`ResizeObserver` (som kontrollerar `dataset.dragging !== 'true'`) passar om så länge `movedRef` är falsk. Captions som löses ut efter första målningen (F5) ger en ny omfit **bara när nod-id-mängden är oförändrad jämfört med den frysta baslinjen från första observationen**; när nodmängden växer (add-link, expand group) uppdateras aldrig baslinjen och kameran rör sig inte, inte ens när den nya nodens caption fylls i efteråt. Efter användarens zoom, pan eller nodrag är `movedRef` fortfarande satt och kameran står kvar.
- **Menyn håller sig inom 16 px.** `placeBesideMenu` provar nu 8 px-steg längs varje sida av nodens cirkel + mätta caption, så en ledig närplats hittas innan rutnätet väljs. Den egna noden täcks aldrig; i en trång pane får menyn fortfarande täcka en annan etikett.
- **Gruppnoder får egen meny.** `canOpenGraphNodeMenu` släpper igenom `group`, `class` och `structure`. Deras meny har `graph:node:expand` (`Show members` för grupp, `Expand` för klass/struktur) som kör samma expansion som `Enter`/dubbelklick. Högerklick på hubben i full storlek hit-testas med canvasens klientrektangel och väljer närmaste nod, så en centrerad träff öppnar nodmenyn.
- **Kantetiketter krockar inte med captions.** `placeEdgeLabel` tar emot synliga caption-rektanglar som hinder för etiketter som bara visas i vila; en vald eller hovrad (aktiv-endpoint) etikett hoppar över caption-hindren, flyttas bara undan från nodcirklar och andra etiketter och **får aldrig kastas för en captions skull**. Om den enda platsen ligger över en caption behålls etiketten och captionen döljs. Etiketter som ändå inte får plats döljs som förut.

Filer: `apps/web/src/graph-map.tsx`, `apps/web/src/shared-context-menu.tsx`, `apps/web/src/graph-edge-label.ts`, `apps/web/src/i18n.ts` (engelsk `Show members`), `apps/web/src/graph-map.test.tsx`, `apps/web/src/graph-edge-label.test.ts`, nya `apps/web/e2e/row226-graph-fixes.spec.ts` samt registrering i `scripts/e2e.mjs` (vikt 70 s). Skärmbilder skrivs till den relativa katalogen `apps/web/test-results/row226-shots`.

Bevis lokalt i worktreen:

- `pnpm --filter ./apps/web exec tsc --noEmit` exit 0.
- `pnpm --filter ./apps/web exec vitest run` gav **172 filer / 1017 tester** gröna.
- `publish()` mäter nu nodetiketten med samma orundade radie som canvasmålningen, så `data-label-*` och den målade captionen håller samma rektangel.
- `python3 scripts/check-english.py` exit 0. `sha256sum apps/web/src/data-model.tsx` är `2d3459c60dd7473f2af3c0ff15cf1fd3295b5bc1da9da0e1046905de35babcaa`, oförändrad. `product_suppliers`-etiketterna, landing och `crates/` är orörda.
- Playwright-specen är skriven och registrerad men **kördes inte i den här sessionen**; ingen isolerad Postgres/Typesense/API-stack startades, så resultatet från `row226-graph-fixes.spec.ts` och regressionerna `row128e`/`row128f`/`row128g` saknas här. Följden verifieras av CI på den här grenen, inte av lokala enhetstester.

## Rad 213b — Add view klonar alltid till en ny panel till höger (mergad som #319, `669c84b`)

Grenen `junior/213b-add-view-clone` utgick från `origin/main` `03b207b` (PR #318, rad 213) och är **mergad till `main` som PR #319 (squash `669c84b`)**. CI-körning #988 var grön på head `9ca0c02`. Demo Playwright mot https://demo.braian.io kördes efter autodeploy när `version.json` visade `669c84b`. Avsnittet nedan beskriver vad #319 innehöll.

Buggen: på den delade demon öppnade Add view → Products view en gammal **stängd** Products-objekttabell som en flik i den fokuserade panelen. `objectTableViewForType` föredrog en stängd träff, och `openTypeView` öppnade den med `zone: 'center'`. Move right kunde dessutom lägga kopian som flik i en befintlig granne, och Ctrl+Alt+→ snappas ofta av operativsystemet. K3 underkändes därför.

Beteendet nu:

- `objectTableViewForType` returnerar bara en typstabell som redan ligger i layouten. Stängda vyer ignoreras som mål. En stängd (eller öppen) mall används bara för att kopiera tabellstate till ett **nytt** id.
- Add view → typrad skapar alltid en ny vy och placerar den med `placeView`/`insert` och `zone: 'right'` intill den öppna typstabellen, annars till höger om fokuserad panel. Den använder inte `moveDir`, återöppnar aldrig en stängd kopia och lägger aldrig en andra typflik i samma panel.
- Open view för sparade `view:`-rader är oförändrat: den fokuserar vyn på plats. Move right behövs inte för att få en andra typstabell.
- K5-testet i `row213-open-view.spec.ts` stänger nu den agentflik som testet själv skapade (UI-knappen PATCH:ar `tab_open: false`), laddar om och verifierar att körningen finns kvar men fliken inte kommer tillbaka.

Vad som ändrades:

- `apps/web/src/open-type-view.ts`: `objectTableViewForType` returnerar endast öppna träffar; ny `objectTableTemplateForType` hittar en stängd eller öppen mall enbart för klonstate.
- `apps/web/src/shell.tsx`: `openTypeView` klonar alltid till nytt id och placerar med `zone: 'right'` (mål = öppen typstabell när den finns).
- `apps/web/src/open-type-view.test.ts`: testerna dokumenterar att stängd träff aldrig väljs som mål men kan användas som mall.
- `apps/web/e2e/row213b-add-view-clone.spec.ts` (ny) och `scripts/e2e.mjs` (registrering och vikt 35): K3 börjar med en icke-tom demoyta, skapar en Products-kopia, stänger fliken så vyn ligger kvar i katalogen, fokuserar trädet och kräver sedan en ny `data-pane` till höger. Ett andra fall stänger alla öppna Products-tabeller och kräver en helt ny vy i stället för den stängda. Förstärkningen `fc87d4c` kontrollerar också att Graph och Detail behåller sina paneler.
- `apps/web/e2e/row213-open-view.spec.ts`: K5-testet stänger agentfliken och verifierar efter omladdning att körningen finns kvar.
- `docs/guide/workspaces-and-panels.md` och `docs/guide/command-palette-and-shortcuts.md`: Add view → typrad beskrivs som en ny panel till höger som aldrig återöppnar en stängd kopia; Open view fokuserar fortfarande på plats.

Bevis (lokalt i worktreen, utan skrivningar mot delad demo eller produktion):

- `pnpm --filter ./apps/web exec tsc --noEmit` exit 0.
- `pnpm --filter ./apps/web exec vitest run` gav **172 filer / 1011 tester** gröna, inklusive de uppdaterade `open-type-view.test.ts`-fallen.
- `python3 scripts/check-english.py` exit 0. `sha256sum apps/web/src/data-model.tsx` är `2d3459c60dd7473f2af3c0ff15cf1fd3295b5bc1da9da0e1046905de35babcaa`, oförändrad.
- Playwright kördes i isolerad compose (`braian-e2e-213b`) med API/Vite bundna till `127.0.0.1` på track A-portarna 25452/28150 och Postgres/Typesense på 25450/25451. Resultat: `row213-open-view.spec.ts` 3 godkända, `row213b-add-view-clone.spec.ts` 2 godkända, `open-type-view-ready.spec.ts` 1 godkänd och `duplicate-type-views.spec.ts` 1 godkänd. Skärmbilder skrivs under `apps/web/test-results/row213-shots` och `row213b-shots` (ignorerade av git).
- Ingen deploy, PR eller merge gjordes från grenen, och den isolerade stacken togs ner utan att röra delade volymer.

## Rad 213 — Open view fokuserar på plats och rör inte strukturen (mergad som #318, `03b207b`)

Grenen `junior/213-open-view` utgick från `origin/main` `7b18f18` (PR #317, rad 211) och är **mergad till `main` som PR #318 (squash `03b207b`)**. Acceptanstestet underkände K3 på grund av den stängda Products-kopian; rättningen är rad 213b ovan. Avsnittet nedan beskriver vad #318 innehöll.

Buggen: Ctrl+K → Open view → Products flyttade den redan öppna Products-vyn in i den fokuserade panelen. Stod strukturen (Food/Selections) i fokus hamnade Products som aktiv flik där, så trädet försvann ur synhåll och det såg ut som att det stängdes eller ersattes. Paletten listade dessutom gamla agentkörningar som vyer.

Den här skivan delar kommandona så här:

- **Open view** fokuserar och aktiverar en vy som redan finns i layouten på dess plats. Den flyttar inte vyn, stänger inte strukturen och rör inte Graph. Palettens `view:`-rader skickar inte längre `zone: 'center'`, så layouten går genom `ensureInLayout` i stället för `moveView`.
- **Add view** är kvar som vägen till den fokuserade panelen. En rad för en befintlig vy skickar fortfarande `zone: 'center'` plus `target` och flyttar in vyn dit. En typrad (`Products view`) går fortfarande genom `openTypeView`, som kopierar en redan öppen typ-tabell och placerar kopian till höger.
- Open view döljer vyer vars typ är `agent`. Agentkörningarna och deras flikar finns kvar; det är bara destinationslistan som inte erbjuder dem.

Vad som ändrades:

- `apps/web/src/palette.tsx`: `view:`-raden dispatchar `ui.open_view` utan `zone`, och rotkatalogens `view:`-rader filtrerar bort `type === 'agent'`.
- `apps/web/src/palette-views.ts`: Open view-listan filtrerar bort `type === 'agent'` innan raderna byggs.
- `apps/web/src/layout.test.ts`: enhetstest för att `ui.open_view` utan `zone` aktiverar en öppen vy på plats och lämnar layouten orörd.
- `apps/web/src/palette-views.test.ts` (ny): enhetstest för att agentkörningar inte blir Open view-destinationer och att typraden döljs när en vy med samma titel redan finns.
- `apps/web/e2e/row213-open-view.spec.ts` (ny) och `scripts/e2e.mjs` (registrering och vikt 30): Playwright täcker kriterium 1–5 med skärmbilder under `apps/web/test-results/row213-shots` (inom worktreen, så CI kan skriva dem).
- `docs/guide/workspaces-and-panels.md` och `docs/guide/command-palette-and-shortcuts.md`: avsnittet Open a view beskriver fokus på plats, att strukturen och Graph står kvar, att listan inte tar med agentkörningar, och att Add view är vägen till fokuserad panel eller en andra typkopia.

Bevis efter merge av #318 (historiskt för den här skivan; K3 underkändes sedan på demon):

- CI-körning #987 var grön på head `e81ccad`. Squash-mergad till `main` som PR #318 (`03b207b`). Demo Playwright mot https://demo.braian.io kördes efter autodeploy när `version.json` visade `03b207b`.
- Acceptanstestet underkände därefter K3 på den delade demon: Add view återöppnade en stängd Products-vy som flik i samma panel. Rättningen är rad 213b ovan; avsnittet ovan ska inte läsas som att K3 är löst i `03b207b`.

## Rad 211 — New from template skapar en ny workspace (mergad som #317, `7b18f18`)

Grenen `junior/211-new-from-template` utgår från `origin/main` `b4d4d62` (PR #316, rad 51c). Den är **mergad till `main` som PR #317 (squash `7b18f18`)**. Rad 51c är mergad som PR #316 (squash `b4d4d62`).

Buggen: Ctrl+K → New from template → Products öppnade bara den befintliga Products-workspacen i stället för att skapa en ny. `createWorkspaceFromTemplate` återanvände workspacen med typens kanoniska `share_token`, och palettraden sa Open existing.

Den här skivan skiljer den explicita New from template-vägen för objekttabeller från de andra anropare som fortfarande ska öppna-eller-skapa singletons:

- Om typens kanoniska workspace redan finns skapar New from template en ny workspace med eget id, egen `user-…`-token och namn `Products 2`, sedan `Products 3`, och så vidare. Den använder typmallens layout (samma slags vyer som en färsk Products-workspace). Ingen namnpopup.
- Om den kanoniska workspacen saknas skapas den som förut, med typens namn och typens `share_token`.
- Data model och Review öppnar fortfarande sin befintliga kanoniska workspace (`Open existing`) och skapar ingen dubblett. Sparade workspace-mallar skapar fortfarande en ny workspace.
- `shell.tsx` och andra anropare som ser till att en typworkspace finns är oförändrade och öppnar-eller-skapar fortfarande singeln.

Vad som ändrades:

- `apps/web/src/templates.ts`: `createWorkspaceFromTemplate` har fått `{ forceNew?: boolean }`, `nextWorkspaceName` räknar ut nästa lediga `"{name} {n}"` från 2, och `isTypeWorkspaceTemplate` identifierar `type:`-mallarna.
- `apps/web/src/palette-new-from-template.ts` och `apps/web/src/palette.tsx`: endast objekttabeller skickar `forceNew`; deras rad säger Create medan Data model och Review säger Open existing.
- `apps/web/src/templates.test.ts` och `apps/web/src/palette-new-from-template.test.ts`: enhetstester för unikt namn, force-new och underrubrikerna.
- `docs/guide/workspaces-and-panels.md`: avsnittet Create a workspace beskriver kopiorna, det oförändrade originalet, att standardworkspacen skapas när den saknas, samt att Data model/Review och sparade mallar är oförändrade.
- `apps/web/e2e/row211-new-from-template.spec.ts` (ny) och `scripts/e2e.mjs` (registrering och vikt 40): Playwright täcker kriterium 1–6 med skärmbilder under `apps/web/test-results/row211-shots` (inom worktreen, så CI kan skriva dem).

Bevis (lokalt i worktreen, utan demo- eller produktionsskrivningar):

- `pnpm --filter ./apps/web exec tsc --noEmit` exit 0.
- `pnpm --filter ./apps/web exec vitest run` gav **171 filer / 1006 tester** gröna, inklusive de nya `templates.test.ts`- och `palette-new-from-template.test.ts`-fallen.
- `python3 scripts/check-english.py` exit 0. `sha256sum apps/web/src/data-model.tsx` är `2d3459c60dd7473f2af3c0ff15cf1fd3295b5bc1da9da0e1046905de35babcaa`, oförändrad.
- E2e-specen är typkontrollerad och registrerad men inte körd lokalt; ingen isolerad compose-stack startades och hela e2e-sviten kördes inte. Ingen demo-mutation, ingen deploy, ingen PR och ingen merge gjordes från grenen.

## Rad 51b — taxonomi- och gruppfält i Select fields (mergad som #314, `0513ee9`)

Grenen `junior/51b-taxonomy-fields` utgick från `origin/main` `5949cb1` (#310), hade guidecommiten `efefeb5` och ordinary-mergade `origin/main` `8367722` (rad 51a-fix, PR #313) som `a47f262`, därefter `origin/main` `bcc7e2b` (rad 77, PR #312) och sedan `origin/main` `76d96f0` (rad 77:s status- och mätuppföljning). Den är **mergad till `main` som PR #314 (squash `0513ee9`) och live på demon med buildId `0513ee9`**. Rad 51a är mergad som PR #310 (squash `5949cb1`), 51a-fixen som PR #313 (squash `8367722`) och rad 77 som PR #312 (squash `bcc7e2b`).

Den här skivan gör `Select fields` till en ärlig och testad katalog över typens egna attribut plus attribut från typens tillåtna strukturer: alla grupper, inklusive nästlade grupper, och äldre klasslistor. Värdearv, separata värde/enhet-kolumner (51c) och skrivning till länkade/hop-fält är utanför omfattningen.

Acceptanskriterierna (Braian Test grindar bara på dessa):

1. **Select fields listar typens egna attribut och gruppattribut från alla tillåtna strukturer, inklusive nästlade grupper.** På seed/demoträdet för livsmedel innehåller Product Fat content (dairy), Caffeine (coffee_tea, under beverages) och Cocoa content (chocolate, under snacks), och de kan slås på som kolumner. En typ som inte tillåter en struktur ser inte den strukturens gruppattribut.
2. **Äldre klasslistor ingår på samma sätt.** `structure.classes` som är bundna till en grupp ingår för typer som tillåter strukturen. Om en payload fortfarande nästlar klasser under `group.classes` ingår de också. Detta påverkar bara vilka fält som kan väljas som kolumner; värden ärvs aldrig.
3. **Katalogens nycklar för typens egna attribut följer `GET /v1/types/{id}/attribute-paths`.** Varje löv för typens egna attribut som API:t listar erbjöds som fält med samma attributnyckel. I 51b var delar som `.unit` / `.label` fortsatt kvalificerare, inte egna kolumner; 51c lägger senare till `.value` / `.unit` som egna kolumner för måttfält.
4. **Grupp- och klassfält syns och går att hitta.** Väljaren visar en källhint för dessa fält (gruppens visningsnamn, till exempel `Dairy & eggs` eller `Chocolate`), och att skriva gruppnamnet i Select fields-sökningen hittar fältet.
5. **Guidesidorna är redan uppdaterade i `efefeb5`.** `workspaces-and-panels.md` har avsnittet Select fields och `object-types-and-relations.md` samt `command-palette-and-shortcuts.md` har meningarna om grupp- och klassfält. De är oförändrade här och beskriver det som koden nu gör.
6. **Automatiska tester täcker kriterium 1–4.** Ny enhetstest `apps/web/src/fields/catalog-taxonomy.test.ts` med fixture för typattribut, nästlade grupper, en äldre klass och en typ som inte tillåter strukturen, plus kontroll mot `crates/server/demo/definitions.json` för Product. Ny komponenttest `apps/web/src/fields/fields-mode-source.test.tsx` täcker källhinten och sökning på gruppnamn. Befintliga Select fields-, hide- och Reset to default-tester är fortsatt gröna.
7. **Endast engelska i UI, skyddade filer orörda.** Ingen ändring av `data-model.tsx`, `product_suppliers`-etiketter, värde/enhet som separata kolumner eller skrivning till hop-fält.

Vad som ändrades:

- `apps/web/src/fields/catalog.ts`: `attributesForType` följer nu `attributes_for_type` i `crates/model/src/path.rs`: typens egna attribut först, därefter varje grupp i varje tillåten struktur (saknad lista = alla, tom lista = inga), därefter `structure.classes` vars grupp matchar och även `group.classes` om den finns. Fält från grupp eller klass får gruppens visningsnamn som `source`; typens egna fält får ingen källa. Länkade fält behåller ett hopp och är skrivskyddade.
- `apps/web/src/fields/qualifiers.ts`: `FieldDef` har ett valfritt `source`.
- `apps/web/src/fields/fields-mode.tsx`: källan används som radens underrubrik när ingen annan valunderrubrik gäller, och ingår i sökunderlaget (både vid filtrering och efter aktivering).
- `apps/web/src/fields/catalog-taxonomy.test.ts` och `apps/web/src/fields/fields-mode-source.test.tsx` (nya) enligt kriterium 6.
- `docs/status.md`: den här statusraden. Inga guideändringar i den här skivan.

Bevis (lokalt i worktreen, utan demo- eller produktionsskrivningar):

- `pnpm --filter ./apps/web exec tsc --noEmit` exit 0.
- `pnpm --filter ./apps/web exec vitest run` gav **168 filer / 991 tester** gröna, inklusive de nya `catalog-taxonomy.test.ts` och `fields-mode-source.test.tsx` samt befintliga `field-picker.test.tsx`, `catalog-system.test.ts` och `language-toggle.test.tsx`.
- `python3 scripts/check-english.py` exit 0. `sha256sum apps/web/src/data-model.tsx` är oförändrad.
- Ingen e2e-körning gjordes lokalt; kriterium 1–4 täcks av enhets- och komponenttesterna samt demo-definitionerna. Ingen demo-mutation, ingen deploy, ingen PR och ingen merge.


## Rad 51c — värde och enhet som separata kolumner (mergad som #316, `b4d4d62`)

Grenen `junior/51c-value-unit-columns` utgår från `origin/main` `0513ee9` (#314, rad 51b). Den är **mergad till `main` som PR #316 (squash `b4d4d62`)**. Rad 51b är mergad som PR #314 (squash `0513ee9`) och live på demon med buildId `0513ee9`. Rad 51a är mergad som PR #310 (squash `5949cb1`), rättningen som PR #313 (squash `8367722`) och båda är live.

Den här skivan låter `Select fields` erbjuda värde och enhet som två egna kolumner för måttfält (nummer med enhetsfamilj), samtidigt som den kombinerade kolumnen och dess visningsenhet finns kvar.

Acceptanskriterierna (Braian Test grindar bara på dessa):

1. **Värde och enhet kan vara separata kolumner.** På Product i seed/demoträdet för livsmedel kan ett måttfält läggas till som `Fat content (value)` och `Fat content (unit)`. Båda kan vara synliga samtidigt, även efter omladdning. Sökvägarna är `fat_content.value` och `fat_content.unit`, samma text som `GET /v1/types/{id}/attribute-paths` listar. Värdekolumnen visar bara värdet och enhetskolumnen bara enhetskoden.
2. **Kombinerade kolumnen och visningsenheten fungerar fortfarande.** `Fat content` utan ändelse finns kvar och visar värde och enhet tillsammans (till exempel `35 g`). En visningsenhet på den kolumnen konverterar det visade värdet och gömmer eller ersätter inte värde- och enhetskolumnerna.
3. **Sökning och källhint fungerar.** Ett gruppkällt måttfält går fortfarande att hitta på gruppnamnet, och värde- och enhetskolumnerna syns som `(value)` / `(unit)`.
4. **Länkade/hop-fält är skrivskyddade.** Om ett hop-fält har en enhetsfamilj kan dess värde/enhet listas ett hopp bort, men de förblir skrivskyddade. Inga skrivningar till länkade/hop-fält läggs till.
5. **Guidesidorna är uppdaterade i samma gren.** `docs/guide/workspaces-and-panels.md` beskriver att ett måttfält kan läggas till som kombinerad kolumn och/eller som separata värde- och enhetskolumner, och att en visningsenhet på den kombinerade kolumnen bara ändrar hur värdet visas. Gruppnamnen är `Dairy & eggs` och `Coffee & tea`.
6. **Automatiska tester täcker kriterium 1–3**, inklusive katalog/sökvägstest mot fixture och Product i `crates/server/demo/definitions.json`, samt picker/cell-test där båda kolumnerna kan vara på och visningskonverteringen på hela kolumnen är oförändrad. Befintliga Select fields-, hide-, Reset-, taxonomi- och kvalificerartester är fortsatt gröna.
7. **Endast engelska, skyddade filer orörda.** Ingen ändring av `data-model.tsx`, `product_suppliers`-etiketter eller skrivning till hop/länkade fält.

Vad som ändrades:

- `apps/web/src/fields/catalog.ts`: ett måttfält (`shape: 'unit'`) får två syskonfält med id `{key}.value` och `{key}.unit`, namnen `{name} (value)` / `{name} (unit)` och källan från föräldern. Samma gäller fält ett hopp bort, som fortsatt är skrivskyddade.
- `apps/web/src/fields/columns.ts`: en lagrad kolumns sökväg behåller `.value` / `.unit` när katalogen har ett sådant löv, annars faller den tillbaka på den gamla kvalificerar-delningen (`.code`, `.label`, `.min`, `.max`).
- `apps/web/src/panes.tsx`: kolumnrubriken och återuppbyggnaden från personliga kolumnval använder samma sökvägsuppslag, så båda kolumnerna finns kvar efter omladdning.
- `apps/web/src/path-cell.ts`: den kombinerade måttkolumnen läser det indexerade värdet och enhetsfältet och visar dem tillsammans (`35 g`) när ingen visningsenhet är vald. `.value` läser värdet och `.unit` enhetskoden.
- `crates/server/demo/definitions.json`, `crates/server/demo/objects.json` och `crates/server/src/seed.rs`: `fat_content` blir ett måttfält i massfamiljen, och demo-/seedvärden anger enheten `g`.
- Tester: `apps/web/src/fields/catalog-value-unit.test.ts`, `apps/web/src/fields/fields-mode-value-unit.test.tsx`, `apps/web/src/value-unit-columns.test.tsx` och utökade `apps/web/src/path-cell.test.tsx` samt `apps/web/src/cell-edit.test.ts`; ett kort e2e-fall i `apps/web/e2e/field-picker.spec.ts` slår på Fat content som kolumn.
- `docs/guide/workspaces-and-panels.md` och `docs/guide/command-palette-and-shortcuts.md`: Select fields-avsnittet beskriver värde- och enhetskolumnerna och de exakta gruppnamnen.

Ärlig avgränsning: att redigera en separat värde- eller enhetscell inline skulle behöva skriva ett måttobjekt med både värde och enhet, vilket är en större skrivväg än den här skivan. De separata kolumnerna är därför visningskolumner och inline-redigering för dem är avstängd; måttfältets redigering i övrigt är oförändrad. Vid den lokala bevisningen gjordes ingen deploy; grenen är senare mergad som PR #316 (squash `b4d4d62`).

Bevis (lokalt i worktreen, utan demo- eller produktionsskrivningar):

- `pnpm --filter ./apps/web exec tsc --noEmit` exit 0.
- `pnpm --filter ./apps/web exec vitest run` gav **171 filer / 1001 tester** gröna, inklusive de nya `catalog-value-unit.test.ts`, `fields-mode-value-unit.test.tsx` och `value-unit-columns.test.tsx` samt befintliga Select fields-, hide-, Reset-, taxonomi- och kvalificerartester.
- `python3 scripts/check-english.py` exit 0. `sha256sum apps/web/src/data-model.tsx` är `2d3459c60dd7473f2af3c0ff15cf1fd3295b5bc1da9da0e1046905de35babcaa`, oförändrad.
- Det korta e2e-fallet i `field-picker.spec.ts` är typkontrollerat men inte kört lokalt; hela e2e-sviten kördes inte. Ingen demo-mutation eller deploy gjordes från grenen; den är senare mergad som PR #316 (squash `b4d4d62`).

## Rad 77 — snabbare CI: färska e2e-vikter och åtta shards (mergad som #312, `bcc7e2b`)

Grenen `junior/77-faster-ci` är **mergad till `main` som PR #312 (squash `bcc7e2bed0fffc6e3ea510f47ec34311bd3722f8`) och live på demon med buildId `bcc7e2b`**. Test godkände raden 2026-11-12. Den exakta gröna toppen som pinades vid mergen var `3400e88b834da3fd906413c6293c05e5ee9bae33`. Arbetet rörde bara CI, testskript och docs; ingen produktkod. Rad 61 / #309 / `0aaf71f` och rad 61b / #311 / `f8d0cb6` är mergade och live.


Acceptanskriterierna från briefen (uppfyllda):

1. **Median tid till grönt minskar minst 15 %.** Baslinjen är de tio senaste gröna `push`-körningarna på `main`: median **9m20s (560s)**. Målet är **≤ 7m56s (476s)** på en full körning, mätt som `updated_at - run_started_at`.
2. **Alla jobb gröna under samma namn.** `rust`, `phase-1`, `bins`, `web`, `licenses`, `e2e`-shards och `stack`; `load` när `mode=full`. Fortfarande gratis `ubuntu-latest`.
3. **Samma testtäckning.** Ingen spec, inget testfall och ingen kontroll tas bort eller stängs av. Alla 93 registrerade e2e-specar körs exakt en gång per full/web-körning.
4. **Path-filtren intakta.** `skip`, `web` och `full` i `scripts/ci-changes.sh` är oförändrade; push till `main` kör fortfarande `mode=full` för att fylla cache.
5. **Inga nya secrets eller inställningar.** Inga secrets, variabler, miljöer eller repo-inställningar tillkom; ingen tredjeparts-cache kräver credentials.
6. **Docs i samma PR, demo orörd.** `docs/dev.md` har en CI-sektion, mätningen ligger i `docs/measurements/2026-11-12-ci-wall-clock.md`, och `data-model.tsx` samt `product_suppliers`-etiketterna är orörda. Ingen guide-sida lades till.

Vad som ändrades i #312:

- `.github/workflows/ci.yml`: e2e-matrisen går från sex till åtta shards (`0..7`) och `BRAIAN_E2E_SHARDS` är `8`. Inga jobbnamn, behov, path-filter eller secrets ändrades.
- `scripts/e2e.mjs`: första kalibreringen av `measuredSeconds` 2026-11-12 delade varje shards totaltid i de tio gröna baslinjekörningarna proportionellt mot gamla vikter. Tre gröna fulla PR-körningar (965/966/967) gav median **8m07s (487s)**, 11 s över målet 7m56s, för att shard 7 bar under-viktade tunga filer (`column-move-race` 6 s mot 1,7–1,8 min, `layout` 15 s mot 1,1–1,3 min). En andra kalibrering sätter vikterna till `ceil` av faktiska per-fil-tider från körning 967 (alla shards) och max mot 966 för shard 7. Packaren, `reseedSeconds` (4 s) och åtta shards är oförändrade. Före PR:en var fallback för en spec utan vikt **12 s per test** (`tests * 12 + reseedSeconds` på `8367722`); #312 sänkte den till **4 s per test**. Det är inte så att fallback redan var 4 s före ändringen.
- `docs/dev.md`, `docs/measurements/2026-11-12-ci-wall-clock.md` och den här sektionen beskriver nu mergen och efter-tabellen.

Bevis (lokalt, utan databas eller compose, plus GitHub API):

- Första packningen: `BRAIAN_E2E_PLAN=1 BRAIAN_E2E_SHARDS=8` gav åtta shards, 93 unika filer, inga dubbletter, prediktion 267–268 s. Efter-körningarna 965 (6m17s), 966 (8m39s) och 967 (8m07s) var alla `mode=full` och gröna under samma jobbnamn; 964 failade på en `field-picker`-flake och räknas inte. Den packningen mergades inte.
- Andra packningen: `BRAIAN_E2E_PLAN=1 BRAIAN_E2E_SHARDS=8` gav åtta shards, 93 unika filer, inga dubbletter, prediktion 251–259 s. Efter-körningarna är PR 970 på `5a74d8b` **7m10s (430s)** och PR 972 på `3400e88` **6m20s (380s)**, båda `mode=full` (`load` success). Median **6m45s (405s)**, under målet 7m56s. Push till `main` 973 på `bcc7e2b` var **6m23s (383s)**, `mode=full` och grön.
- `sha256sum apps/web/src/data-model.tsx` = `2d3459c60dd7473f2af3c0ff15cf1fd3295b5bc1da9da0e1046905de35babcaa`.

Ärlig avgränsning: den första efter-medianen missade målet, så den packningen mergades inte. Den andra kalibreringen uppfyllde ≤ 7m56s och är den som mergades. Baslinjen 9m20s kommer från push-körningar, så den rättvisa jämförelsen är push 973 mot 9m20s (**−31,6 %**). PR mot PR är **15,4 %** under en median på 7m59s (479s) från de tio senaste gröna PR-körningarna i 947–968 som inte är docs/landing-only och inte 77:s egna 965–967; detaljerna står i mätfilen. Prediktionen 251–259 s / ~5m30s vägg träffade inte (faktisk Playwright-spridning 194–319 s, vägg 6m20s–7m10s). `sccache` lämnades utanför. Ingen automatisk omkalibrering av vikter och ingen kortare autodeploy-poll byggdes i #312. Ingen skrivning gjordes mot demo, `/opt/braian`, `/var/www/braian`, Caddy eller Track A (51a-sektionerna i den här filen lämnades orörda).


## Rad 51a-uppföljning — Reset to default i maximerad panel (mergad som #313, `8367722`)

Rad 51a är mergad till `main` som PR #310 (squash `5949cb1`) och live på demon med buildId `5949cb1`. Test underkände kriterium 2 i en maximerad panel: Ctrl+K visade `Reset to default`, men körningen gjorde inget. `zoomView` sätter bara `doc.zoom`; `doc.focus` kan ligga kvar på en dold syskonvy som Detail. `publishFrame` remappar fokus till zoomtabellen, men paletten skickade rå `doc.focus` till kommandot, så `ui.reset_columns` träffade Detail i stället för Products: ingen DELETE och den dolda kolumnen kom inte tillbaka.

Uppföljningen ligger i grenen `junior/51a-reset-maximized`, utgår från `origin/main` `5949cb1` (#310) och är **mergad till `main` som PR #313 (squash `8367722`) och live på demon med buildId `8367722`**. Kriterium 1 och 3–7 från 51a är oförändrade och fortsatt uppfyllda.

- `apps/web/src/palette.tsx`: Ctrl+K-kommandot `columns:reset` skickar nu den publicerade fokusvyn (`readUiContext().focused`, redan remappad till zoomtabellen) i stället för palettens råa `focusViewId` (`doc.focus`). Kolumnmenyn är oförändrad och skickar fortfarande sin egen `view.id`.
- `apps/web/src/palette-column-reset.test.tsx` (ny): publicerar en ram där fokus är Products (som `publishFrame` gör när `doc.zoom` är satt) medan paletten får `doc.focus` = Detail, kör `Reset to default` och kräver att `ui.reset_columns` får Products, inte Detail.
- `apps/web/e2e/column-prefs-multitab.spec.ts`: nytt fall seedar Brand dold, sätter dokumentfokus på Detail, maximerar Products, kör Ctrl+K → `Reset to default`, kräver DELETE 204, att Brand syns direkt och att standardkolumner plus `document: null` finns kvar efter omladdning. Layouten återställs efter testet.
- `docs/status.md`: den här statusraden. Inga guideändringar; de befintliga guiderna beskriver redan kommandot.

Bevis (lokalt i worktreen, utan demo- eller produktionsskrivningar):

- `pnpm --filter ./apps/web exec tsc --noEmit` exit 0.
- `pnpm --filter ./apps/web exec vitest run` gav **166 filer / 981 tester** gröna, inklusive den nya `palette-column-reset.test.tsx` och de befintliga reset-, hide/show- och Select fields-testerna.
- `python3 scripts/check-english.py` exit 0. `sha256sum apps/web/src/data-model.tsx` är oförändrad.
- Den utökade `column-prefs-multitab.spec.ts` är typkontrollerad men inte körd lokalt i den här rundan; den befintliga reset-specen är utökad, inte ersatt.

## Rad 51a — Reset to default för personliga kolumnval (mergad som #310, `5949cb1`)

Grenen `junior/51a-reset-to-default` är **mergad till `main` som PR #310 (squash `5949cb1`) och live på demon med buildId `5949cb1`**. Test godkände kriterium 1 och 3–7 men underkände kriterium 2 i en maximerad panel; rättningen är uppföljningen ovan, som **är mergad som PR #313 (squash `8367722`) och live på demon med buildId `8367722`**. Detta är den första skivan av Notion-rad 51 (välja fält per vy). Hide column, Select fields, en hop av länkade fält (skrivskyddade) och personliga `column-prefs` v2 finns redan på main. HTTP `DELETE /v1/views/{view_id}/column-prefs` fanns redan och raderar bara anroparens egen rad. Senare skivor som låg utanför den PR:en: **51b** taxonomi-/gruppfält i fältväljaren (nu mergad som #314, `0513ee9`) och **51c** värde- och enhetskolumner för måttfält (egen gren, inte mergad). Skrivning till länkade/hop-fält är utanför omfattningen.

Acceptanskriterierna (Braian Test grindar bara på dessa):

1. **Reset to default tar bort den personliga överstyrningen.** Efter dölja, visa, ordna om eller lägga till ett fält återställer kommandot vyn till typens standardkolumner (`defaultColumnIdsForType` + systemkolumner) genom `DELETE /v1/views/{view_id}/column-prefs` för den inloggade användaren, inte genom att skriva ett dokument som råkar se ut som standard. Efter omladdning syns fortfarande standardkolumnerna.
2. **Samma kommando i kolumnmenyn och Ctrl+K.** Det finns i kolumnhuvudets/vyns snabbmeny (`Shift+F10` eller context-menu-tangenten på ett huvud) och i Ctrl+K, avgränsat till den fokuserade objekttabellen. Den engelska etiketten är exakt `Reset to default`.
3. **Kommandot visas bara när en överstyrning finns.** Utan personligt prefs-dokument är det dolt. Ett anrop utan överstyrning ska inte ge fel (HTTP DELETE och agentoperationen är no-op med 204/200).
4. **Agenten kan nollställa bara anroparens egna prefs.** Kommandot finns i registret som `delete_view_column_prefs` och är anropbart som de befintliga get/put-operationerna. Det är en personlig inställning, inte ett delat vy-förslag, och kan inte radera en annan användares prefs.
5. **Guiden är uppdaterad i samma gren.** `docs/guide/workspaces-and-panels.md` (avsnittet “What is saved, and for whom”) och `docs/guide/command-palette-and-shortcuts.md` beskriver att personlig kolumnordning och synlighet nollställs till vyns standard med `Reset to default` från menyn eller Ctrl+K. `deleting-and-restore.md` och landningsfiler är orörda.
6. **Tester täcker återställning och omladdning.** Efter dölja/omordning återställer Reset standard-id:n, och en omladdning visar fortfarande standard. Befintligt hide/show/Select fields-beteende förblir grönt.
7. **Engelska bara, skyddade filer orörda.** Ingen ändring av taxonomikatalogen, värde/enhet-kolumndelar, skrivning till hop-fält, `apps/web/src/data-model.tsx` (`sha256 2d3459c60dd7473f2af3c0ff15cf1fd3295b5bc1da9da0e1046905de35babcaa`) eller `product_suppliers`-etiketter.

Vad som ändrades:

- `apps/web/src/column-prefs.ts` och `column-prefs-mutation.ts`: `deleteColumnPrefs`, `columnPrefsHasOverride` och `resetColumnPrefs` som gör DELETE, sätter cachen till `document: null` och invaliderar query-nyckeln.
- `apps/web/src/panes.tsx`: `ui.reset_columns` målar standardkolumnerna, riktar in snapshoten så att ingen lookalike-PUT skrivs, och publicerar överstyrningsflaggan till menyn.
- `apps/web/src/command-registry.ts`, `palette.tsx`, `shell.tsx`, `ui-context.ts` och `i18n.ts`: kommandot `columns:reset` med etiketten `Reset to default`, i kolumnmenyn och Ctrl+K bara när en överstyrning finns.
- `crates/api/src/column_prefs.rs` och `platform.rs`: agentoperationen `delete_view_column_prefs` (alltid anroparens egen rad). Den är undantagen från det generella agent-delete-skyddet eftersom den bara tar bort anroparens egen UI-rad.
- Guiden som i kriterium 5.

Bevis (lokalt före PR, plus CI 13/13 grön på `4027c8e` och på `66ebf9c` före merge av `f8d0cb6`):

- `pnpm --filter ./apps/web typecheck` och `pnpm --filter ./apps/web exec vitest run` (163 filer / 971 tester) gröna, inklusive `command-registry-column-reset.test.ts`, utökad `column-prefs-mutation.test.ts` och `field-picker.test.tsx` (DELETE, ingen lookalike-PUT, standard efter omladdning).
- E2E `apps/web/e2e/column-prefs-multitab.spec.ts` täcker Ctrl+K-reset och att standard överlever omladdning; den kördes i CI.
- `cargo fmt --check`, `cargo check -p braian-api`, `cargo clippy -p braian-api --all-targets -- -D warnings`, `cargo test -p braian-api --test column_prefs` (10 tester mot en tillfällig `postgres:18`-container som togs bort) och `cargo test -p braian-api --lib platform::tests` (25 tester).
- `sha256sum apps/web/src/data-model.tsx` oförändrad. Ingen demo-mutation, ingen deploy, ingen ändring av `/opt/braian` eller `/var/www/braian`.

## Rad 61 — skapa och redigera selection genom det delade utkastet (mergad som #309, `0aaf71f`)

Grenen `junior/61-selection-draft` utgick från `origin/main` `c8fb0af` och är **mergad till `main` som PR #309 (squash `0aaf71f54e1fdc1a5ff854b684a47cc8422527f5`)** samt live på demon med buildId `0aaf71f`. Test godkände kriterium 1, 2, 3, 5 och 6 men underkände kriterium 4; rättningen är 61b nedan, som är **mergad till `main` som PR #311 (squash `f8d0cb6`) och live på demon med buildId `f8d0cb6`**. Detta är Test-avvisningen av #154 / #158, inte en ny rad 154 eller 158: skapa och redigera en selection gjordes i en fristående dialog som skrev `POST`/`PUT` direkt i stället för i `Selections`-vyn och dess `Detail` med det delade utkastet från rad 212.

Acceptanskriterierna från `brief.md` (Braian Test grindar bara på dessa):

1. **Skapa skriver inget före Save.** `Ctrl+K` → `New selection` eller `New selection` i `Selections`-vyn öppnar `Selections` och dess `Detail`, inte en fristående dialog. Namn, `Type`, `Kind` och, för `Dynamic`, filterfrågan kan sättas. `Discard` och `Escape` skriver inget; `Save` i det delade utkastfältet skapar selectionen, som sedan syns i listan och som filterchip.
2. **Redigera använder samma utkast.** Namn och, för `Dynamic`, filterfrågan ändras i `Detail`. `Kind` och objekttyp är låsta som förut. Inget skrivs före `Save` (`PUT` bara på `Save`), och `Discard` återställer föregående namn och fråga.
3. **Save filter as selection förfyller fortfarande.** `Ctrl+K` → `Save filter as selection` öppnar samma `Detail` med `Kind = Dynamic` och vyfiltret ifyllt, men skriver inget före `Save`; `Discard` skriver inget.
4. **Delete, fallback och manuella selectioner fungerar som förut.** Delete bekräftar användning, vyer faller tillbaka till `All …`, och en manuell selection skapas utan att den dynamiska frågan blandas in. Test fann ingen fungerande hand-fyllningsväg; 61b rättar den guiden ärligt.
5. **Dynamisk fråga räknas om.** Efter `Save` visar selectionen de objekt som matchar frågan nu, och en sparad ändrad fråga visar den nya mängden. Detta täcks av isolerade tester med egna selectioner, inte seeddata.
6. **Guide, tester, engelska, skyddade filer.** Endast den befintliga `Saved selections`-sektionen i `docs/guide/data-sources.md` uppdateras. Isolerade tester täcker kriterium 1–5; de gamla `dynamic-selection`, `edit-selection-click`- och `new-selection-dialog`-specarna är uppdaterade eller omdöpta så de inte kräver den gamla dialogen som sparar direkt. `apps/web/src/data-model.tsx` (`sha256 2d3459c60dd7473f2af3c0ff15cf1fd3295b5bc1da9da0e1046905de35babcaa`) och `product_suppliers`-etiketterna är orörda. Ingen demo-mutation, ingen PR, ingen merge och ingen deploy.

Vad som ändrades:

- `apps/web/src/selection-draft.ts` (ny): en liten global utkaststore för skapa/redigera. Den håller namn, typ, kind, fråga och den sparade manuella frågan, och har `startNewSelection`, `startEditSelection`, `updateSelectionDraft` och `discardSelectionDraft`.
- `apps/web/src/assortments.tsx`: den fristående `NewSelectionDialog` som `POST`ade/`PUT`ade i `save()` är borta. `SelectionDraftDetail` renderas i `Selections`-vyns `Detail` och använder `ObjectDraftBar` (`review-and-save`, `discard-draft`) som objekt- och modelutkasten. `SelectionHost` startar utkastet från `NEW_SELECTION_EVENT`/`EDIT_SELECTION_EVENT` och fokuserar `Selections`-vyn via `braian-open-draft`. `Escape` kastar utkastet. Skrivning sker bara i Save, och för redigering skickas `PUT` med `id`. Delete-dialogen, `All …`-fallbacken och den manuella frågan är oförändrade.
- `docs/guide/data-sources.md`: `Saved selections` beskriver nu `Selections`-vyn/`Detail`, det delade utkastfältets `Save`/`Discard`, att typ och kind är låsta vid redigering, att `Save filter as selection` förfyller ett dynamiskt utkast, samt att delete bekräftar användning och faller tillbaka till `All …`. Ingen ny guidesida och ingen ny `index.md`.
- `apps/web/src/selection-draft.test.tsx` (ny): isolerade tester för kriterium 1–4: skapa skriver inget före Save och listas efter, `Discard`/`Escape` skriver inget, redigering `PUT`:ar bara på Save och har låst typ/kind, filterförfyllnad väntar på Save, manuell selection tar ingen dynamisk fråga, och delete-preview listar användning.
- `apps/web/src/selection-recalculate.test.tsx` (ny): kriterium 5. En egen dynamisk selection öppnas, dess fråga ändras och sparas, och `Detail` kör den nya frågan mot sökningen i stället för att visa den gamla träffmängden.
- `apps/web/e2e/new-selection-draft.spec.ts` (omdöpt från `new-selection-dialog.spec.ts`), `apps/web/e2e/edit-selection-click.spec.ts` och `apps/web/e2e/dynamic-selections.spec.ts`: använder `selection-detail`, `review-and-save` och `discard-draft` i stället för den gamla dialogen, `Save selection` och `Cancel`; `scripts/e2e.mjs` pekar på det nya specnamnet. Den gamla close-X-coverage är ersatt av `Discard`/`Escape`.

Bevis (endast `docker run --rm`, inga databaser behövdes):

- `pnpm --dir apps/web exec vitest run` gav **164 filer / 971 tester** gröna, inklusive de fem nya selectionstesterna.
- `pnpm --dir apps/web exec tsc --noEmit` exit 0; `python3 scripts/check-english.py` exit 0.
- `sha256sum apps/web/src/data-model.tsx` = `2d3459c60dd7473f2af3c0ff15cf1fd3295b5bc1da9da0e1046905de35babcaa`; `product_suppliers`-etiketterna är orörda.
- Ärlig avgränsning: ingen isolerad compose eller Playwright-körning gjordes, eftersom kriterium 1–5 kunde täckas med jsdom-tester och befintliga Rust-tester för sparande, låst kind/typ och delete-fallback. De uppdaterade E2E-specarna är typkontrollerade och registrerade men inte körda mot demo. Ingen skrivning gjordes mot demo, `/opt/braian`, `/var/www/braian`, Caddy eller Track A; ingen PR öppnades och inget mergades eller deployades.

## Rad 61b-uppföljning — delete-fallback, tom manuell, användningstext och guide (mergad som #311, `f8d0cb6`)

Grenen `junior/61b-selection-fixes` utgick från `origin/main` `0aaf71f` (#309, rad 61) och är **mergad till `main` som PR #311 (squash `f8d0cb6`) samt live på demon med buildId `f8d0cb6`**. Den rättar Test-avvisningen av `0aaf71f` på kriterium 4: efter delete av den aktiva filterchippen låg tabellen kvar på den gamla frågan (24 rader i stället för alla 407), en tom `Manual`-selection visade alla objekt i stället för noll, delete-dialogen sa `Not used anywhere.` trots att chippen var aktiv, och guiden lovade en hand-fyllningsväg som inte fanns.

Acceptanskriterierna för den här rundan (Braian Test grindar bara på dessa):

1. **Skapa skriver inget före Save.** Oförändrat från 61: `Ctrl+K` → `New selection` och `New selection` i `Selections`-vyn öppnar `Selections`/`Detail`, inte en dialog som sparar direkt. `Discard` och `Escape` skriver inget; `Save` skapar selectionen.
2. **Redigera använder samma utkast.** Oförändrat från 61: `Edit selection` öppnar samma `Detail`, `Kind` och `Type` är låsta, `Discard` återställer namn och fråga och endast `Save` skriver.
3. **Save filter as selection förfyller och går via utkastet.** Oförändrat från 61: kommandot öppnar ett `Dynamic`-utkast med vyfiltret ifyllt och skriver inget före `Save`.
4. **Delete-fallback, tom manuell, användningstext och hand-fyllning.** (a) Delete av den aktiva filterchippen väljer `All` direkt och visar alla objekt av typen; ingen `POST /v1/views` behövs. (b) En tom `Manual`-selection matchar noll objekt i `assortment-open`, som chip och i sökningen. (c) Delete-dialogen säger att listan bara omfattar sparade vyer, jobb och webhooks, inte en aktiv filterchip. (d) Hand-fyllning av enskilda objekt är uttryckligen utanför den här rundan; guiden lovar den inte längre och beskriver i stället att en manuell selection tar med sig de grupp- och etikettfilter som är aktiva när den skapas, samt att en tom manuell selection inte matchar något.
5. **Dynamisk fråga räknas om.** Oförändrat från 61 och fortsatt täckt av isolerat test.
6. **Guide, tester, engelska, skyddade filer.** `docs/guide/data-sources.md` `Saved selections` är uppdaterad på plats utan ny guidesida. Isolerade tester täcker (a)–(c) och regressionsfallen 1, 2, 3 och 5. `apps/web/src/data-model.tsx` (`sha256 2d3459c60dd7473f2af3c0ff15cf1fd3295b5bc1da9da0e1046905de35babcaa`) och `product_suppliers`-etiketterna är orörda.

Vad som ändrades:

- `apps/web/src/assortment-filter.ts`: `EMPTY_MANUAL_FILTER` och `isEmptyManualQuery` gör en manuell selection utan grupp och etiketter till ett filter som matchar noll objekt (`id:=__braian_empty_manual__`), i stället för att `assortmentSearchFilter` bara lämnade typen kvar och därmed matchade allt.
- `apps/web/src/panes.tsx`: `ObjectTable`/`TableFilters` håller reda på vilken selection som är applicerad. När listan inte längre innehåller den valda selectionen (till exempel efter delete) nollställs selection-, grupp-, etikett- och snabbfiltret, så `All` blir vald direkt. Tom manuell appliceras som nollmatchningsfiltret, och snabbfiltrets etikett visar inte den interna markören.
- `apps/web/src/i18n.ts`: `noSelectionUsage` säger `Not used by a saved view, job, or webhook.` i stället för `Not used anywhere.`
- `docs/guide/data-sources.md`: `Saved selections` beskriver delete-fallbacken till `All`, att en tom manuell selection matchar noll, vilka användningar delete-listan omfattar, och att det inte finns någon separat hand-fyllningsväljare ännu.
- `apps/web/src/assortment-filter.test.ts`, `apps/web/src/selection-draft.test.tsx` och `apps/web/src/selections.test.tsx`: nya isolerade tester för tom manuell (både förhandsvisning och chip/sök), delete av aktiv chip med `All`-fallback och den ärliga användningstexten. Befintliga tester för kriterium 1, 2, 3 och 5 är oförändrade och fortsatt gröna.

Bevis (endast `docker run --rm`, ingen databas behövdes):

- `pnpm --dir apps/web exec vitest run` gav **164 filer / 975 tester** gröna, inklusive de nya selectionstesterna.
- `pnpm --dir apps/web exec tsc --noEmit` exit 0; `python3 scripts/check-english.py` exit 0.
- `sha256sum apps/web/src/data-model.tsx` = `2d3459c60dd7473f2af3c0ff15cf1fd3295b5bc1da9da0e1046905de35babcaa`; `product_suppliers`-etiketterna är orörda.
- Ärlig avgränsning: ingen isolerad compose, databas eller Playwright-körning gjordes. Befintliga E2E-specar är oförändrade; den nya chip-fallbacken är täckt av jsdom-testet i `selections.test.tsx`, inte av en demokörning. Ingen skrivning gjordes mot demo, `/opt/braian`, `/var/www/braian`, Caddy eller Track A. PR #311 öppnades och mergades efter denna körning.

## Rad 196-uppföljning — länkfel och Replace använder aktuellt utkast

Rad 196-uppföljningen är mergad till `main` som PR #307 (squash `c8fb0af26d50f1dcb36d67742387448df3b29e1a`) och live på demon med buildId `c8fb0af`. Test har godkänt den. Grenen `junior/196-link-field-replace` utgick från `origin/main` `45ea113` (#305). Detta är Test-avvisningen av #223 / `fc24906`, inte en ny rad 223: efter en kardinalitetskonflikt återanvände `replace()` de gamla värdena i `conflict.request.values`, Replace-knappen gick att använda efter att Sort order ändrats till ett ogiltigt värde, och statusfoten kunde visa `Save failed: 422` för en konflikt som dialogen redan förklarat.

Acceptanskriterierna från `brief.md` (Braian Test grindar bara på dessa):

1. **Ogiltig Sort order stannar i dialogen.** Ett icke-numeriskt värde visar `Enter a number.` vid fältet (`link-field-error-sort_order`), Sort order är ett nummerfält, dialogen stannar öppen och ingen länk skrivs.
2. **Kardinalitet förklaras och Replace flyttar länken.** En artikel som redan har en produkt får en begriplig ett-länk-förklaring och `Replace link`; Replace flyttar länken till den valda produkten.
3. **Första giltiga länken fungerar.** Numerisk Sort order sparas som förut och toasten behåller Undo.
4. **Replace validerar aktuellt utkast.** Efter konflikten gör ett ogiltigt värde att Replace är avstängt och fältfelet syns; ett giltigt värde skriver **utkastets** värden, inte de sparade `conflict.request.values`.
5. **Ingen rå footer för hanterad konflikt.** Statusfoten visar inte `Save failed: 422` när dialogen tagit över konflikten; riktiga ohanterade skrivfel visas fortfarande.
6. **Guide, tester och skyddade filer.** Endast den befintliga sektionen “Add and remove links” i `docs/guide/object-types-and-relations.md` uppdateras, utan ny guidesida. Isolerade tester täcker kriterium 1, 2, 4 och 5 och kriterium 3 är fortsatt grönt. `apps/web/src/data-model.tsx` är orörd (`sha256 2d3459c60dd7473f2af3c0ff15cf1fd3295b5bc1da9da0e1046905de35babcaa`) och `product_suppliers`-etiketterna är orörda.

Vad som ändrades:

- `apps/web/src/link-create-dialog.tsx`: `replace()` räknar om `linkFieldErrors` mot det aktuella utkastet, skriver inget när fältet är ogiltigt, och bygger `values` med `linkFieldValues(choice.fields, draft)` i stället för `conflict.request.values`. Replace-knappen är avstängd så länge utkastet eller ett fältfel är ogiltigt. `onReplaced` får den aktuella requesten.
- `apps/web/src/write-status.ts` och `apps/web/src/link-create-dialog.tsx`: ny `acknowledgeWriteError(status)` tar bort just den hanterade skrivningen från statusfoten, men lämnar en annan eller nyare felkod kvar. Dialogen anropar den när den visar kardinalitetskonflikten eller mappar serverfältfel.
- `apps/web/src/link-create-dialog.test.tsx`: nya tester för att Replace är avstängt vid ogiltigt utkast, att det giltiga Replace-anropet skickar `{sort_order: {value: '7'}}` i stället för det gamla `5`, och att en hanterad 422 inte blir `Save failed` i foten medan en ohanterad 500 fortfarande visas. Det befintliga testet för första länk, kardinalitet och Replace är kvar.
- `apps/web/src/write-status.test.ts`: enhetstest för att en hanterad felkod rensas utan att en annan kod göms.
- `docs/guide/object-types-and-relations.md`: sektionen “Add and remove links” beskriver nu fältfelet vid fältet, att Sort order är ett nummer, att Replace erbjuds vid ett-länk-konflikt, att Replace är avstängt medan utkastet är ogiltigt, att det sparar värdena på skärmen och att konflikten inte lämnar en rå spara-fel-rad i statusfoten.
- `apps/web/e2e/row196-demo-link-errors.spec.ts`: förberedd men **inte registrerad** i `scripts/e2e.mjs` och **inte körd** mot `https://demo.braian.io`. Den använder egna `DEMO196-*`-objekt för kriterium 1–5 och städar dem.

Bevis (endast `docker run --rm`, inga databaser behövdes för enhetstesten):

- `pnpm --dir apps/web exec vitest run src/link-create-dialog.test.tsx src/write-status.test.ts src/link-add.test.tsx src/link-write.test.ts src/link-section.test.tsx` gav 5 filer / 32 tester gröna.
- Hela vitest-sviten: **162 filer / 966 tester** gröna.
- `pnpm --dir apps/web exec tsc --noEmit` exit 0; `python3 scripts/check-english.py` exit 0.
- Ärlig avgränsning: ingen isolerad compose, databas eller Playwright-körning gjordes; webbläsarbeviset för kriterium 1–5 ligger i den oregistrerade demo-specen och ska köras av koordinatorn efter merge. Ingen skrivning gjordes mot demo, `/opt/braian`, `/var/www/braian`, Caddy, Track A eller någon annan rad.

## Rad 216b — rättade antal och återställningsfel efter Test på e70184f

Grenen `junior/216b-delete-fixes` utgår från `origin/main` `e70184f` (#301), har ordinary-mergat `5f2402e` (row 225, #303) och `7eaee05` (row 225b, #304) och är **inte mergad, deployad eller accepterad**. Den rättar Test-avvisningen: antalet objekt räknade kaskadlänkar som objekt, singular saknades och samma rad visades två gånger; efter Trash Restore visade Detail och Graph fortfarande "The graph could not be loaded. Validation stopped the save.", även efter F5.

De sex acceptanskriterierna från `brief.md` (Braian Test grindar bara på dessa):

1. **K5 Restore.** En återställd produkt av samma form som Testfallet (länkad till två artiklar, där en artikel raderats tidigare i en annan batch) öppnas i Detail och Graph utan fel, även efter F5. Samma fel syns inte i Products Detail direkt efter raderingen. Efter restore är produkten 200 och den live länk som raderades i samma händelse 200; länken och artikeln som raderades i den tidigare batchen är 410, och Trash säger fortfarande Restore.
2. **K2 Antal.** `Removes 1 object and N links` (singular när N är 1). Kaskadlänkar räknas som länkar, inte som objekt. Raden visas en gång och pluralen är korrekt.
3. **K3 Flera val.** Valda objekt plus unika live-länkar; en delad länk räknas en gång och en länk som A har till ART1 ger minst 1 länk.
4. **K1, K4 och K7 håller.** Fyra ytor, samma `DeleteObjectsHost`, `dry_run` för antal, Cancel fokuserad, Escape/overlay skriver inget, `DELETE /v1/objects/{id}` per id, rader borta från tabeller och sök, och Delete-tangenten öppnar inte dialogen medan en editor, ett textfält eller quick-filtret har fokus.
5. **Guide.** Efter ordinary-merge av `origin/main` `5f2402e` (#303) och `7eaee05` (#304) uppdateras den befintliga `docs/guide/deleting-and-restore.md` så att den beskriver de rättade antalen och restore-beteendet (en mening, `Removes 1 object and N links` med rätt singular/plural, länkobjekt räknas som länkar, unika live-länkar vid flerval, ärligt raderat tillstånd i Detail/Graph, återställt objekt öppnas även efter F5). 225b:s tillfälliga demonot om att räkningar/Restore rättas i 216b tas bort, så sidan som autodeployas från main stämmer med den rättade produkten vid merge. Ingen ny `docs/guide/deleting.md`.
6. **Tester och skyddade filer.** Isolerade regressionstester för K5 och K2/K3; engelsk copy; `apps/web/src/data-model.tsx` (`sha256 2d3459c60dd7473f2af3c0ff15cf1fd3295b5bc1da9da0e1046905de35babcaa`) och `product_suppliers`-etiketterna orörda. Ingen demo-mutation, ingen PR, ingen merge.

Vad som ändrades:

- `crates/api/src/objects.rs`: `DELETE /v1/objects/{id}?dry_run=true` räknar bara det valda objektet som objekt (`objects = 1`); kaskadlänkar rapporteras enbart som `links`. Serverns mening byggs med rätt singular/plural och `detail` är tom, så klienten inte upprepar raden.
- `apps/web/src/delete-objects.ts`: klienten bygger alltid meningen själv från valda objekt och unika live-länkar. Länkobjekt räknas aldrig som objekt, en delad länk räknas en gång, och singular/plural följer antalet. För ett enskilt objekt används serverns länkantal bara om objektets `links` inte kunde läsas.
- `apps/web/src/delete-objects-dialog.tsx`: detaljrader som upprepar meningen filtreras bort, så antalsraden aldrig visas två gånger.
- `crates/api/src/problem.rs`: problem-svar får `Cache-Control: no-store`. En cachad 410 på ett objekt kunde annars serveras av webbläsaren även efter Trash Restore och F5, vilket var det egentliga "graph could not be loaded"-felet i Test.
- `apps/web/src/panes.tsx`: en 410 från objektläsningen visas som ett ärligt "This object is deleted / Restore it from Trash"-tillstånd i Detail och Graph, inte som graf- eller valideringsfel. Riktiga fel visar fortfarande felbannern.
- `apps/web/src/i18n.ts`: engelsk copy `objectDeleted` och `objectDeletedHint`.
- Enheter: `delete-objects.test.ts` (7) täcker singular, servermening som räknat länkobjekt som objekt, fallback till dry-run, delad länk, unika länkar och valt länkobjekt; `delete-objects-dialog.test.tsx` (3) visar meningen en gång. Hela vitest-sviten: **162 filer / 963 tester** gröna. `pnpm --dir apps/web exec tsc --noEmit` och `scripts/check-english.py` exit 0.
- Rust: `crates/api/tests/http.rs` har ett nytt K5-test (produkt med två artikellänkar, en artikel raderad i en tidigare batch; Detail/Graph/GET efter restore, 410 för den tidigare batchen) och det befintliga restore-testet kontrollerar nu `objects = 1`, rätt mening, tom `detail` och `no-store` på 410. Hela API-sviten **55/55** grön; `crates/store/tests/soft_delete.rs` **7/7** grön; `cargo fmt --all --check` och `cargo clippy -p braian-api -p braian-store --all-targets -- -D warnings` exit 0.
- E2E: ny `apps/web/e2e/row216b-delete-fixes.spec.ts` (registrerad i `scripts/e2e.mjs`, `measuredSeconds: 120`) med K5 (detalj/graph efter delete och efter restore + F5, HTTP 200/200/410/410, Trash Restore kvar) och K2/K3 (ett objekt + en länk, flera val med en unik länk, ingen dubbel rad). Den befintliga `row216-delete-object.spec.ts` är uppdaterad till `Removes 2 objects and 1 link` och båda specarna är **2/2 + 2/2** gröna i isolerad compose `row216c` (Postgres 25463, Typesense 28163, API/web 29463/29464).
- `docs/guide/deleting-and-restore.md`: den befintliga sidan från #303 uppdateras så att antalsraden, flervalets unika live-länkar och restore efter F5 stämmer med den rättade koden. Ingen ny `docs/guide/deleting.md`. Index och graph-sidan orörda.
- Post-merge demo: `apps/web/e2e/row216-demo-delete.spec.ts` är uppdaterad för K1–K5 och K7 med egna `DEMO216B-*`-objekt men är fortfarande **inte registrerad** och **inte körd** mot `https://demo.braian.io` i den här uppgiften.
- Ärlig avgränsning: K5-fixen ligger i lastvägen (410 som ärligt raderad state plus `no-store`), inte i att dölja felbannern; riktiga graf- och valideringsfel visas oförändrat. Ingen full `cargo test --workspace` kördes; de berörda API- och store-sviterna samt clippy/fmt kördes. Inga skrivningar gjordes mot demo, `/opt/braian`, `/var/www/braian`, Caddy eller Track A.

## Rad 224 — landningssidan beskriver produkten på main, och docs/guide finns

Grenen `junior/224-landing-update` utgick från `origin/main` `e70184f8f9d8901f34c4db2b5c737e55a63509b4` (#301, rad 216). Arbetet låg i worktreen `/home/administrator/dev/wt-224-landing-20261111-2303`; ingen egen PR öppnades för grenen, men innehållet nådde `main` genom rad 225 (#303). Demon rördes inte.

Acceptanskriterierna från `brief.md` (Braian Test grindar bara på dessa):

1. **Kopian stämmer med produkten.** `apps/landing` beskriver arbetsytor och paneler, objekttyper och relationer, datakällor/Select source (#300), Ctrl+K-paletten, grafen, raderingsflödet från #301, feedback och self-hosting. Varje påstående är kontrollerat mot koden eller mot `docs/guide` i samma gren.
2. **Inaktuella påståenden borta.** "It can do exactly what you can, nothing more" är ersatt: agenten kan inte radera objekt eller länkar, inte acceptera sina egna förslag och inte köra merge. "Nothing is saved until you press Save" är ersatt: mänskliga celländringar är utkast, men en mänsklig objektradering skrivs direkt efter bekräftelse. Även "Every command shows its shortcut", "Ctrl+K reaches all of them", "sit side by side" och nio fasta arbetsytor är omskrivna till det som gäller.
3. **Trackaton, sitemap och robots är byte-identiska.** `apps/landing/index.html` (queue-stubben och `track.js`-taggen), `apps/landing/public/sitemap.xml` och `apps/landing/public/robots.txt` är orörda. `git diff origin/main --` de tre sökvägarna är tom (0 byte). `apps/landing/scripts/check-frozen.mjs` (ny, `pnpm --dir apps/landing check:frozen`) pinnar sha256 för Trackaton-utsnittet, sitemap och robots och exit 0.
4. **docs/guide skrivs i samma gren och landningen bygger på den.** Nya sidor: `index.md`, `getting-started.md`, `workspaces-and-panels.md`, `object-types-and-relations.md`, `data-sources.md`, `command-palette-and-shortcuts.md`, `deleting-and-restore.md` (den korta raderingsnoten som #216 sköt upp), `graph.md`, `feedback.md` och `self-hosting.md`. De sex första använder de stabila slugs som row 225 väntas använda. Ingen `/docs`-renderer lades till och inga `/docs`-URL:er lades i sitemap.
5. **Engelska, skyddade filer, ingen deploy.** Landnings- och guidekopian är engelsk; `scripts/check-english.py` exit 0. `apps/web/src/data-model.tsx` och `product_suppliers`-etiketterna är orörda. `pnpm --dir apps/landing typecheck` och `pnpm --dir apps/landing build` (med prerender-kontrollerna) exit 0. Inga skrivningar under `/var/www/braian`, `/opt/braian` eller någon VPS-webroot; ingen demodatamutation.
6. **En PR-redo gren.** Endast ordinär commit och `git push -u origin junior/224-landing-update` när allt är grönt; ingen amend, force, rebase, reset eller `--no-verify`. `REVIEW.md`, `pr-body.md` och `result.md` ligger i scratch-katalogen.

Vad som ändrades:

- `apps/landing/src/content.ts`: nav och sektioner är Workspaces, Model, Sources, Graph, Agent, Delete, Feedback, Architecture, Performance, Open source. Nya sektioner för arbetsytor/paneler, typer/relationer, datakällor, graf, radering/restore och feedback. Agent-, arkitektur- och open source-copyn är rättad. `docsUrl` pekade då på `docs/guide` i repot; rad 225b ändrade den till `https://braian.io/docs/`.
- `apps/landing/src/App.tsx`: renderar de nya sektionerna med samma DisclosureList/sheet-komponenter som resten av sidan. Inga nya beroenden.
- `apps/landing/scripts/check-frozen.mjs` + `check:frozen` i `apps/landing/package.json`: hash-kontroll av de frysta artefakterna.
- `docs/guide/*`: tio korta sidor enligt ovan. Guiden beskriver bland annat att en vy kan följa typ, länkad rad eller strukturnod; att trädvalet är exakt placerad grupp och att nodvalet inte återställs från URL:en vid reload; att grafens API ger ett hopp per anrop och att scenen stannar vid 400 noder; att feedback bara finns för admin när en webhook är konfigurerad; samt att agenten saknar raderingsverktyg.
- `docs/status.md`: denna rad.

Bevis (inga databaser eller containrar behövdes):

- `pnpm --dir apps/landing typecheck` exit 0.
- `pnpm --dir apps/landing build` exit 0; prerender-kontrollerna (CTA, prestandafotnot, minst 10 kollapsade kort, "Moving between them is instant", ingen "chatbot") passerade.
- `node apps/landing/scripts/check-frozen.mjs` exit 0.
- `python3 scripts/check-english.py` exit 0.
- `git diff origin/main -- apps/landing/index.html apps/landing/public/sitemap.xml apps/landing/public/robots.txt` gav 0 byte.
- Ingen compose startades, ingen databas lästes eller ändrades, ingen E2E och ingen Rust-testkörning gjordes (inte nödvändigt för copy/docs).
- Ärlig avgränsning: `docs/guide` är Markdown i repot och renderas inte av landningsappen; landningen länkar till katalogen på GitHub. Den äldre statusposten för rad 103 säger "inte mergad", men #300 ligger på main och det är den beteendet landningen beskriver. Rad 217–223 och Track A (row 225) rördes inte.

## Rad 225 — guiden publiceras som statisk HTML under /docs, med graph-sidan

Rad 225 är mergad till `main` som #303 (squash `5f2402e`) och publicerad på https://braian.io/docs/. Grenen `junior/225-docs-foundation` utgick från `origin/main` `59ba66f` (row 128g, #302) och ordinary-mergade `junior/224-landing-update` (`d0e9a56`, bas `e70184f`/#301), så att 224:s `docs/guide`-träd blev basen; 225 lade till den statiska `/docs`-publiceringen som 224 saknade och uppdaterade graph-sidan.

Vad som ändrades:

- `docs/guide/`: 224:s tio sidor behålls (index, getting-started, workspaces-and-panels, object-types-and-relations, data-sources, command-palette-and-shortcuts, deleting-and-restore, graph, feedback, self-hosting). 225:s kortare sex sidor är inte kopierade; deras konkreta användardetaljer är inflätade i 224:s sidor. Alla länkar i guiden pekar nu på byggda `/docs/...`-sidor eller GitHub-dokument.
- `docs/guide/graph.md`: skriven mot koden i `apps/web/src/graph-map.tsx`, `shared-context-menu.tsx` och `i18n.ts`: menyn öppnas intill noden; ett musklick flyttar tangentbordsfokus så nästa `Shift+F10` öppnar samma nod; Pin sitter kvar på kortet och växlar Pin/Unpin, och ett klick på en pinnad nod släpper pinnen; Fit skiljs från Re-layout; tom canvas och gruppnoder ger canvasmenyn Fit/Re-layout; Fit körs vid Re-layout och när full storlek öppnas, inte efter F5 eller när full storlek stängs. Ingen row 226-funktion beskrivs eller utlovas. Den gamla platshållaren "graph guide will follow" är borta; index länkar `/docs/graph`.
- `apps/landing/scripts/guide.mjs`: `GUIDE_PAGES` kräver nu alla tio sidor (inte de sex ursprungliga), bygger delad navigering och varje sida under `dist/docs`; länkkontrollen kräver att varje `/docs`-länk resolverar. En saknad sida får bygget att avbryta.
- `apps/landing/scripts/prerender.mjs` behåller ordningen: homepage-prerender och dess CTA-kontroller körs först, därefter `buildGuide`. `pnpm --dir apps/landing build` skriver `/docs`, `/docs/graph` och övriga åtta sidor.
- `apps/landing/public/sitemap.xml`: listar alla `/docs`-sidor (inklusive graph, deleting-and-restore, feedback, self-hosting) med avslutande snedstreck, så crawlers inte går via 308. Det är en medveten sitemapändring; `apps/landing/scripts/check-frozen.mjs` har uppdaterad sha256 för sitemap. Trackaton-scriptet i `apps/landing/index.html` och `robots.txt` är orörda (samma hash).

Bevis: `pnpm --dir apps/landing exec tsc --noEmit` exit 0; `pnpm --dir apps/landing build` exit 0 med `prerendered 10 guide pages under dist/docs` och homepage-kontrollerna intakta; `pnpm --dir apps/landing check:frozen` exit 0 efter sitemap-uppdateringen; `python3 scripts/check-english.py` exit 0. En saknad guidesida får bygget att falla (verifierat). Ingen compose, databas eller E2E behövdes. `apps/web/src/data-model.tsx` och produktbeteendet är orörda. Ärlig avgränsning: guiden beskriver nuvarande webbapp; den publiceras som statisk HTML av landningsbygget, inte av en separat docs-tjänst. 225 öppnades som PR #303 och mergades; uppgiften deployade inte själv, utan publiceringen på https://braian.io/docs/ följde av mergen.

## Rad 225b — docs-sanning efter Test-avslag på rad 225

Grenen `junior/225b-docs-truth` utgår från `origin/main` `5f2402e` (#303). Den rättar guiden mot demon på buildId `5f2402e` utan att ändra produktbeteende.

- `docs/guide/graph.md`: menyn beskrivs som intill noden utan avståndslöfte; Fit körs vid Re-layout och när full storlek öppnas, inte efter F5 eller när full storlek stängs; ett klick på en pinnad nod släpper pinnen; gruppnoder får canvasmenyn Fit/Re-layout; inget påstående att etiketter undviker varandra.
- `docs/guide/deleting-and-restore.md`: en kort not sade att räkningarna och Restore är under rättning i 216b, med demon `5f2402e` som exempel. Den noten tas bort i 216b när rättningen landar, så den inte autodeployas vidare.
- `apps/landing/src/content.ts`: `docsUrl` pekar på `https://braian.io/docs/`, så footerns Documentation-länk gör detsamma.
- `apps/landing/public/sitemap.xml` och `apps/landing/scripts/guide.mjs`: `/docs/<slug>/` med avslutande snedstreck i sitemap samt i canonical och `og:url`; index är kvar på `/docs/`. Endast sitemap-hashen i `check-frozen.mjs` är uppdaterad.

Bevis i `docker run --rm` med `node:22-bookworm`: `pnpm --dir apps/landing typecheck` exit 0; `pnpm --dir apps/landing check:frozen` exit 0; `pnpm --dir apps/landing build` exit 0 med `prerendered 10 guide pages under dist/docs`, och byggda sidor har canonical `https://braian.io/docs/graph/` (index `https://braian.io/docs/`). `python3 scripts/check-english.py` exit 0 i `python:3-slim`. `apps/landing/index.html`, `robots.txt` och GitHub-/demolänkarna är byte-identiska med `origin/main`; `apps/web/src/data-model.tsx` är orörd.

# Status 2026-11-09

## Rad 216 — radera ett objekt från fyra ytor, en dialog och återställ kaskadlänkar

Grenen `junior/216-delete-object` utgår från `origin/main` `41ce09fb8be0187d4e29b7b853ad2f50561baa11` (#300) och är **inte mergad, deployad eller accepterad**. Arbetet ligger i worktreen `/home/administrator/dev/wt-216-delete-20261110-1935`; ingen PR öppnades, ingen merge gjordes och demon rördes inte.

De sju acceptanskriterierna från `brief.md` (Braian Test grindar bara på dessa):

1. **Four entry points, one dialog, one API.** From a selected catalog object, Delete is available in (a) the row/cell right-click menu, (b) the Detail panel (a header/action on `[data-testid=object-detail]` and/or the Detail pane's View menu when Detail is the active view and an object is open — not in unrelated View menus), (c) the Ctrl+K palette, findable by typing "Delete", and (d) the Delete key on selected row(s) in an object table when no cell editor or text input is focused. All four open the same confirm dialog and, after confirm, write through the existing `DELETE /v1/objects/{id}` (one request per selected id). No new draft/Review/Save flow.
2. **Confirm dialog: counts, Cancel focus, Escape cancels.** The dialog shows how many objects and links will disappear, from `?dry_run=1` (reuse the server `sentence` / `detail` when present). Cancel is focused by default. Escape or overlay dismiss cancels and writes nothing. The primary action is a danger **Delete**. Stable test ids (suggest `delete-object-dialog`, `delete-object-counts`, `confirm-delete-object`). English copy only.
3. **Multi-select.** Marked rows are deleted together after one confirm. Prefer unique object+link counts (a link touched by two selected objects is not counted twice). Sequential existing DELETEs after one confirm is the default; do not add a public bulk-delete endpoint unless sequential DELETE is genuinely insufficient. If a later id fails, stop, surface the error, and leave already-deleted rows in Trash (honest status.md note).
4. **Gone from tables and search.** After confirm, the deleted rows disappear from object tables and from search (existing indexer / Typesense `deleted:true` behaviour). Relevant React Query keys are invalidated (`objects`, `object`, search, trash, links).
5. **Trash Restore also restores same-event cascade links.** Restore / undelete of that object (`POST /v1/trash/object/{id}/undelete`) brings back the object **and** the link rows / link objects that were cascade-deleted in the same deletion event (prefer the shared `batch_id` and `{link_removed:true}`; migrate only if that is not enough). Links deleted separately earlier, or in a different batch, stay deleted. The Trash button label stays **Restore** (`copy.trashRestore`); do not rename it to Undelete in the UI.
6. **Agents still cannot delete.** `DELETE /v1/objects/{id}` remains 403 `agent_cannot_delete` for agents/imports. Do not add an agent tool that deletes. Hide or no-op the UI command in an agent session if one exists; the API stays the source of truth.
7. **Delete is ignored while typing.** The Delete key does not fire this flow when the user is typing in an input, textarea, contenteditable, or when a cell editor is open (`isEditingCell`). Do not steal Delete/Backspace from the structure tree or import mapping.

Vad som ändrades:

- `crates/store/src/ops.rs`: `restore_object` läser objektets senaste `delete`-ändring, tar `batch_id` och hittar samma batchs `{link_removed:true}`-ändringar. Objektet återställs först; därefter återställs varje kaskadlänk som fortfarande är soft-deleted (version +1, `links.deleted_at = NULL`, ny `update`-ändring `{"undeleted":true}` så indexeraren lägger tillbaka den). Länkar som raderats separat eller i en annan batch har ingen sådan ändring och förblir raderade. Ingen migration behövdes. Samma transaktion gör att ett kardinalitets- eller nyckelkonflikt rullar tillbaka hela återställningen.
- `crates/api/src/objects.rs`: `DELETE /v1/objects/{id}` dokumenterar nu den redan existerande `dry_run`-parametern i OpenAPI, med `ConsequenceReport` som 200-svar. Ingen beteendeändring; agent/import ger fortfarande 403 `agent_cannot_delete`.
- `apps/web/src/delete-objects.ts` + `delete-objects-dialog.tsx`: en global händelsebuss och en enda `DeleteObjectsHost`. Dialogen hämtar `?dry_run=1` för varje valt id (och objektets live-länkar) och visar serverns `sentence`/`detail` för ett objekt. Flera objekt slås ihop via delade länkobjekt-id:n, så en länk som två markerade objekt delar räknas en gång. Cancel är autofokuserad; Escape och overlay stänger utan skrivning. Bekräfta kör sekventiella `DELETE /v1/objects/{id}`; vid första fel stannar loppet, felet visas och dialogen står kvar medan redan raderade objekt ligger i Trash. Efter lyckad körning invalideras `objects`, `object`, `search`, `trash` och `links`.
- `apps/web/src/command-registry.ts` + `row-context-menu.ts`: `object:delete` (danger, `Delete…`) finns i row- och cellmenyn via den delade registret. `apps/web/src/shell.tsx` registrerar körningen och monterar dialogen; i en agentsession är kommandot no-op.
- `apps/web/src/panes.tsx`: Delete-tangenten på en markerad rad (eller flera) öppnar dialogen, men bara efter `isEditingCell`-vakten, så input, textarea, contenteditable och öppen celleditor behåller tangenten. Detail-panelen har en `delete-object-detail`-åtgärd i headern; den döljs i agentsession. Strukturträdet och importmappningen har egna tangenthanterare och rörs inte.
- `apps/web/src/palette.tsx`: Ctrl+K får en `object:delete`-rad när en tabell har markerade rader eller Detail har ett öppet objekt, med engelsk subtitle och sökorden `delete`, `remove`, `trash`. Trash-knappen heter fortfarande **Restore** (`copy.trashRestore`).
- `apps/web/src/i18n.ts`: engelsk copy för dialogtitel, beskrivning, räknarstatus och fel. `scripts/check-english.py` exit 0.
- Enheter: ny `delete-objects.test.ts` (4) för serverrad, delad länk, valt länkobjekt och svarsläsning; ny `delete-objects-dialog.test.tsx` (3) för dry-run-räkning, Cancel-fokus, Escape utan skrivning, sekventiell multi-delete, invalidering och stopp vid fel; `command-registry-session.test.ts` (+2) för kommando och row-meny. Hela vitest-sviten: **162 filer / 958 tester** gröna.
- Rust: `crates/store/tests/soft_delete.rs` har ett nytt test (7/7 gröna i filen) där en kaskadlänk från samma radering återställs medan en länk som raderats i en tidigare batch förblir raderad. `crates/api/tests/http.rs` har ett nytt test för dry_run-siffror, agent-403 och `POST /v1/trash/object/{id}/undelete` som tar tillbaka både objektet och kaskadlänken. Hela API-sviten: **54/54** gröna.
- E2E: ny `apps/web/e2e/row216-delete-object.spec.ts` (registrerad i `scripts/e2e.mjs`, `measuredSeconds: 75`) med två tester: (1) row/cell-meny, Detail-headern, Ctrl+K "Delete" och Delete-tangenten öppnar samma dialog; Cancel fokuseras och Escape lämnar objektet orört. (2) två markerade produkter med en delad länk gav `Removes 3 objects and 1 links` efter en bekräftelse (rättat i 216b till `Removes 2 objects and 1 link`), raderna försvinner, sökningen ger noll träffar, och Trash **Restore** tar tillbaka objektet och länken medan det andra objektet (annan händelse) stannar i Trash. Båda testen städar egna fixtures.
- Post-merge demo: `apps/web/e2e/row216-demo-delete.spec.ts` är förberedd men **inte registrerad** i standardlistan och **inte körd** mot `https://demo.braian.io` i den här uppgiften.
- Bevis i isolerad compose `row216b` (Postgres 18 på `127.0.0.1:25461`, Typesense 30.2 på `127.0.0.1:28161`, syntetiska värden ur worktreens gitignorerade `.env`; inga Track A-portar, ingen `row103`/`row129e-keep`, ingen demo): Rust byggdes och testades i `docker run --rm` på nätverket `row216b_default` med named volume `row216b-cargo-home` (aldrig `~/.cargo`). `cargo clippy -p braian-store -p braian-api --all-targets -- -D warnings` exit 0; `cargo fmt --all --check` exit 0; `pnpm --dir apps/web typecheck` exit 0; `scripts/check-english.py` exit 0; hela vitest 162/958; nya E2E-specen 2/2 (37,0 s).
- Skärmbilder ligger i specens `test-results` och i uppgiftens scratch `shots/` (`row216-row-menu-dialog`, `row216-detail-dialog`, `row216-palette-dialog`, `row216-key-dialog`, `row216-multi-counts`, `row216-trash-restore`). `apps/web/src/data-model.tsx` är orörd (`sha256 2d3459c60dd7473f2af3c0ff15cf1fd3295b5bc1da9da0e1046905de35babcaa`). Inga `product_suppliers`-etiketter, demolabels, `/opt/braian`, Caddy, Track A-containrar eller demo-data rördes.
- Ärlig avgränsning: multi-select-räkningen använder `dry_run` per objekt och dedupliserar delade länkobjekt via objektets `links`-lista; en vald länkpost som inte är en tabellrad kan därför falla tillbaka på sin egen dry_run-rad. Ett fel mitt i en sekventiell multi-delete lämnar tidigare objekt i Trash, enligt kriteriet, och dialogen visar felet i stället för att stänga. Ingen publik bulk-endpoint lades till.

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
