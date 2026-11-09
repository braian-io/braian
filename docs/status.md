# Status 2026-11-09

Bas: `origin/main` tip `549d2d3` (#271). Senaste migrering i repot: `V44__proposal_recoveries.sql` (#268).

## Rad 135 uppföljning — i den här PR:en (build-only)

Demo-omtesten efter #269 visade att tabellcellens 2px-ring är rätt, men att tangentbordsfokus fortfarande saknades på några ställen. Den här PR:en rättar bara den kvarvarande fokusringen; den är inte mergad, deployad eller accepterad.

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

## Rad 215 (mergad i #271) — i basen, inte den här PR:en

Rapporten gällde att kontrollerna i Edit selection inte svarade på klick i Articles-arbetsytans Selections-panel. På basen `4cd25f7` gick klickflödet igenom i Chromium, Firefox och WebKit, både från radmenyn och från högerklick, efter att urvalet tillämpats och med en stagad objekt-draft. Ingen pointer-interception eller överlägg kunde reproduceras.

Det som däremot gick att reproducera var fokus: dialogen öppnades från radmenyn med fokus kvar på radens "More actions"-knapp bakom modalen, och efter stängning hamnade fokus på `<body>`. Orsaken var att den delade `DialogContent` fångade opener i sin `useState` när komponenten monterades med skalet (långt före öppningen), och att `autoFocus` på namnfältet hann flytta fokus innan Radix `onOpenAutoFocus`. Nu fångas opener i `DialogContent` under render medan innehållet ännu inte är monterat, alltså innan ett `autoFocus`-fält hinner ta fokus (till skillnad från `onOpenAutoFocus`, som körs för sent), menyn fokuserar sin trigger innan kommandot öppnar dialogen, och namnfältet får fokus via Radix fokusomhändertagande. CI-regressionen där `create-dialog`-dialogen tappade opener-fokus efter stängning är åtgärdad; `create-dialog.spec.ts` går grönt (12/12) tillsammans med `edit-selection-click.spec.ts` (6/6). Efter Cancel, X och Escape återgår fokus till radens meny-knapp; inget överlägg ligger kvar och `body` har `pointer-events: auto`.

`e2e/edit-selection-click.spec.ts` (registrerad i `scripts/e2e.mjs`) täcker: öppna via faktisk meny, klicka namnfältet, byta namn på den seedade manuella Articles-selectionen Cheese, Save selection, synligt namn och API-läsning efter omladdning, Cancel/X/Escape utan oavsiktlig ändring, upprepad öppning, Type/Kind låsta i edit-läget, samt en stagad tabelldraft. Körningen är gjord i isolerade `--rm`-containrar mot syntetisk Postgres/Typesense. Mergad till `main` som #271 (`549d2d3`); inte deployad eller accepterad.

Braian går att starta lokalt och att klicka igenom på [demo.braian.io](https://demo.braian.io). Postgres är källan och ändringsloggen. Indexer, sök, auth, förslag och webbgränssnittet sitter på samma kedja. Flödet står i `docs/events.md`. Demokatalogen som `just dev` visar är bara seed: hjälteobjekt plus 240 syntetiska livsmedel (leverantörer, produkter och artiklar). Etiketter finns på sv/en/de och objektdata är engelska. Strukturen heter Food, leverantörer står utanför trädet och pekas ut med länkar. Tester skriver i databasen `braian_e2e` och sökaliaset `braian_e2e`, inte i demon.

Skalprovet (5 000 skrivningar i sekunden, 1 miljon och 10 miljoner objekt) är inte gjort. En virtuell tabell mot 100 013 objekt är mätt, se `docs/measurements/2026-10-25-table-100k.md`.


## Levererat sedan 2026-11-01 (verifierat via `git log` på main)

Sedan statusen 2026-11-01 (`8300319` / #145) har ungefär #146–#271 landat (126 commits på main, `git rev-list --count 8300319..549d2d3`; #265, som gav rad 170 läsbara URL:er, är mergad som `61c6e3c`, #270 som gav rad 107 kolumnflytt stannar i måltabellen är mergad som `a7e7d58`, och #271 som gav rad 215 Edit selection-fokus är mergad som `549d2d3`). Den här PR:en är bara rad 135-uppföljningen och är inte mergad, deployad eller accepterad. Många leveranser står på Att testa i Notion och väntar på Glenns genomgång.

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
