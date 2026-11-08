# Läsbara URL:er

Indexrutten (`/`) speglar arbetsyta, vy, katalog och valt objekt i sökparametrar. Samma synk som rad 136 (PR #200) ligger kvar: arbetsyta, vy och objekt ger ett steg i historiken, katalog byts med replace, omladdning och bakåt/framåt läser parametrarna, och en vy som redan är öppen öppnas inte om. Filter, sortering och markering i en tabell ligger kvar i vyn, inte i URL:en. Objektet i URL:en är raden Detail visar.

Skrivningar till URL:en utgår alltid från det senaste tillståndet. Om två ändringar hinner före att adressen uppdaterats ersätts den väntande posten i stället för att en ny historikpost läggs på. En ändring som kommer av att en nyckel eller kollisionssuffix lösts upp ersätts också, inte pushas. Ett asynkront uppslag som blir klart efter att valet bytts ignoreras.

Interna id:n i API och databas är oförändrade. Parametrarna är bara den adress webbläsaren visar.

## Grammatik

| Param | Betydelse | Token |
| --- | --- | --- |
| `ws` | arbetsyta | slug av visningsnamnet |
| `view` | fokuserad vy | slug av vyns titel |
| `catalog` | arbetsytans katalog | slug av katalogens namn |
| `object` | valt objekt | objektets nyckel (SKU), eller `~` plus kort id när nyckeln saknas |

Slugregeln behåller Unicode-bokstäver och siffror. Texten NFKC-normaliseras och blir gemener; varje annat tecken (mellanslag, skiljetecken, symbol) blir `_`, och `_` i ändarna tas bort. `Data model` blir `data_model`. `A  B` blir `a__b`. `Café` blir `café`, `Ελληνικά` blir `ελληνικά` och `商品 目录` blir `商品_目录`.

Ett namn som inte har någon bokstav eller siffra får ingen tom slug. Det får `~` plus det kortaste unika hex-suffixet av id:t, samma suffix som vid en krock. Parametern utelämnas alltså inte längre.

Objektnyckeln slugifieras inte. Den läggs i söksträngen och kodas av routern (`ART/Å& +` blir percent-encoding). Nyckeln läses från typens nyckelattribut, samma sträng som `objects.key`. Ett `~` som finns i själva nyckeln skrivs som `~~`, så att ett ensamt `~` följt av hex bara kan vara vårt kollisionssuffix. En nyckel `SKU~000000bb` blir alltså `SKU~~000000bb` i URL:en.

Objekt utan nyckel (till exempel länkrader) får `~` plus det kortaste unika id-suffixet i katalogens nyckellösa omfång, till exempel `~000000cc`. Suffixet är det slumpmässiga slutet av uuid:t, inte tidsstämpel-prefixet som UUIDv7 delar mellan rader skapade i samma minut. Delar flera nyckellösa rader samma 8 tecken förlängs suffixet (12, 16, sedan 32) tills det är unikt, så två länkar aldrig får samma oanvändbara adress. Adressen slås upp mot `GET /v1/objects?id_suffix=...` i katalogens omfång, så en omladdning behåller valet. Länkraden har länktypen, inte tabellens typ, så suffixfrågan skickar ingen typ.

Exempel:

```text
/?ws=products&view=products&catalog=master_catalog&object=ART-REGEL-45
/?ws=data_model&view=structure&catalog=master_catalog
/?ws=url_twin~000000bb&view=detail&catalog=master_catalog&object=SAME~000000cc
/?ws=products&view=detail&catalog=master_catalog&object=~000000dd
```

## Krockar

Inom en katalog och en typ är nyckeln unik. Där räcker den nakna nyckeln, och vyn (eller listan Detail följer) ger typen.

När flera rader i samma omfång får samma slug eller samma nyckel får det lägsta id:t den nakna token. Övriga får `~` och det kortaste unika hex-suffixet av id:t (8, 12, 16, sedan 32 tecken). Suffixet är bara med när det behövs för den aktuella raden. En gammal suffix-adress, eller adressen före ett byte av namn eller nyckel, öppnas inte.

Ett `~` i en nyckel escapas som `~~`. Därför kan en nyckel som själv ser ut som `nyckel~<hex>` inte förväxlas med en annan rads kollisionssuffix. Den osträckade formen `nyckel~<hex>` läses som nyckeln `nyckel` plus suffix och öppnar bara den raden, om den finns. En gammal adress med oescapad nyckel öppnas inte.

Nyckellösa rader har inget namn att krocka på. Deras `~`-token använder alltid det kortaste unika suffixet bland de nyckellösa raderna i katalogen. Bara den exakta token vi skulle skriva nu accepteras; den delade 8-teckenssvansen är ingen adress när suffixet har förlängts.

## Vad som inte får en adress

- Ett uuid i `ws`, `view`, `catalog` eller `object` slås inte upp. Det är en okänd adress och ignoreras.
- Ett namn utan bokstav eller siffra får ett `~`-suffix av id:t i stället för en tom slug.
- Ett länkobjekt har `objects.key` null och inget nyckelattribut. Det får `~` plus sitt kortaste unika id-suffix bland de nyckellösa raderna, så att en omladdning återställer samma rad.

Uppslag av nyckel går mot `GET /v1/objects` (Postgres, exakt träff efter en contains-fråga), i katalogens och typens omfång. Ett nyckellöst objekt slås upp på id-suffix i katalogen (`id_suffix`); den vanliga listan utelämnar länkrader, men suffixfrågan läser dem direkt ur Postgres. Uppslaget frågar på den delade 8-teckenssvansen så att hela krockgruppen finns med och det förlängda suffixet kan räknas om; bara den exakta nuvarande token accepteras. Typen utelämnas eftersom en länkrad har länktypen, inte tabellens typ. Listan kapas efter 8 sidor à 500 träffar. Om svaret fortfarande är avklippt gissar vi inte. Saknad, borttagen eller osedd rad öppnas inte. Namnet är ingen behörighet; listan är den katalog och de arbetsytor sessionen redan får se.

Byter man namn eller nyckel byts URL:en till den nya token när skalet har läst om raden. Ingen aliaslista sparas.
