# Läsbara URL:er

Indexrutten (`/`) speglar arbetsyta, vy, katalog och valt objekt i sökparametrar. Samma synk som rad 136 (PR #200) ligger kvar: arbetsyta, vy och objekt ger ett steg i historiken, katalog byts med replace, omladdning och bakåt/framåt läser parametrarna, och en vy som redan är öppen öppnas inte om. Filter, sortering och markering i en tabell ligger kvar i vyn, inte i URL:en. Objektet i URL:en är raden Detail visar.

Interna id:n i API och databas är oförändrade. Parametrarna är bara den adress webbläsaren visar.

## Grammatik

| Param | Betydelse | Token |
| --- | --- | --- |
| `ws` | arbetsyta | slug av visningsnamnet |
| `view` | fokuserad vy | slug av vyns titel |
| `catalog` | arbetsytans katalog | slug av katalogens namn |
| `object` | valt objekt | objektets nyckel (SKU), oförändrad |

Slugregeln är densamma som `slug_key` i `crates/model/src/link.rs`: ASCII-bokstäver och siffror blir gemener, varje annat tecken (mellanslag, skiljetecken, icke-ASCII) blir `_`, och `_` i ändarna tas bort. `Data model` blir `data_model`. `A  B` blir `a__b`. `Öl` blir `l`.

Objektnyckeln slugifieras inte. Den läggs i söksträngen och kodas av routern (`ART/Å& +` blir percent-encoding). Nyckeln läses från typens nyckelattribut, samma sträng som `objects.key`.

Exempel:

```text
/?ws=products&view=products&catalog=master_catalog&object=ART-REGEL-45
/?ws=data_model&view=structure&catalog=master_catalog
/?ws=url_twin~000000bb&view=detail&catalog=master_catalog&object=SAME~000000cc
```

## Krockar

Inom en katalog och en typ är nyckeln unik. Där räcker den nakna nyckeln, och vyn (eller listan Detail följer) ger typen.

När flera rader i samma omfång får samma slug eller samma nyckel får det lägsta id:t den nakna token. Övriga får `~` och det kortaste unika hex-suffixet av id:t (8, 12, 16, sedan 32 tecken). Suffixet är bara med när det behövs för den aktuella raden. En gammal suffix-adress, eller adressen före ett byte av namn eller nyckel, öppnas inte.

En token som kan läsas både som en hel nyckel och som nyckel plus suffix, och de två läsningarna pekar på olika rader, öppnas inte.

## Vad som inte får en adress

- Ett uuid i `ws`, `view`, `catalog` eller `object` slås inte upp. Det är en okänd adress och ignoreras.
- Ett namn utan ASCII-bokstav eller siffra får ingen slug. Parametern utelämnas.
- Ett länkobjekt har `objects.key` null och inget nyckelattribut. Det får ingen `object`-parameter. Att välja det i gränssnittet fungerar; en omladdning återställer inte just den länkraden via URL.

Uppslag av nyckel går mot `GET /v1/objects` (Postgres, exakt träff efter en contains-fråga), i katalogens och typens omfång. Listan kapas efter 8 sidor à 500 träffar. Om svaret fortfarande är avklippt gissar vi inte. Saknad, borttagen eller osedd rad öppnas inte. Namnet är ingen behörighet; listan är den katalog och de arbetsytor sessionen redan får se.

Byter man namn eller nyckel byts URL:en till den nya token när skalet har läst om raden. Ingen aliaslista sparas.
