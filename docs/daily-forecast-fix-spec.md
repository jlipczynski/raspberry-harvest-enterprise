# Poprawka: prognoza dzienna zbiorów — bez współczynników korekcji

## ⛔ ZASADA NADRZĘDNA (ustalona z Janem 17.06.2026)

**Żadnych współczynników „przyspieszania/zwalniania" ani korekcji uczonej z historii
w prognozie zbiorów — bez wyraźnej, uprzedniej zgody Jana co do podstawy.**

Powód: prognoza ma wynikać z krzywej zbioru (wytyczna) i realnej pogody (GDH),
a nie z domyślnego mnożnika, którego podstawy nie da się uzasadnić. Mnożnik korekcji
dodany 15.06.2026 (commity #146–#153) zawyżał prognozę i zostaje usunięty.

## Problem (stan obecny)

Ekran „Prognoza dzienna" (`/dashboard/harvest`) zawyża zbiory:
- Blok B: przewidziane ~538 kg/dzień przy realnych ~214 kg (przeszacowanie ~2,5×),
- „Razem 7 dni" ~8 178 kg.

Dwie przyczyny w kodzie:

1. **Korekcja z historii (`calcCorrectionFactor` w `src/lib/harvest-daily-forecast.ts`).**
   Liczy `cf = średnia(realne ÷ przewidziane)` z 7 dni, ucięte do [0,3 ; 3,0],
   i mnoży prognozę × cf. Na starcie zbiorów (małe mianowniki) dzienne ilorazy
   wybuchają w górę → średnia > 1 (np. 1,36×) → w szczycie domnaża i tak duże liczby.
   Błąd metody: uśrednia DZIENNE ilorazy zamiast porównać sumy. **Cały ten mechanizm
   zostaje usunięty (nie naprawiany).**

2. **Tygodnie traktowane jako płaskie kostki.** `weekKg/7` na każdy dzień, potem
   dzielone po GDH wewnątrz tygodnia. Brak płynnego trendu między tygodniami →
   schodek na granicy tygodni.

## Nowy model rozkładu dziennego (uzgodniony z Janem)

Trzy zasady, wszystkie BEZ korekcji z historii:

### 1. Krzywa rządzi wolumenem tygodnia (nienaruszalne)
`weekKg[w] = (krzywa%[w] / 100) × totalKg`, gdzie `totalKg = pędy × norma_kg_na_pęd`
(`pędy = potsOverride ?? metersLength × potsPerMeter`, `norma = section.yield ?? variety.yield`).
Brak krzywej / brak normy → pomiń sekcję (bez fallbacku, zgodnie z CLAUDE.md).

### 2. Płynny trend między tygodniami (interpolacja, znika schodek)
Zamiast płaskiej kostki `weekKg/7`, dzienna baza ma płynnie narastać/opadać
zgodnie z trendem krzywej (np. 12% → 15% to gładki wzrost dzień po dniu).
- Dzienna stawka tygodnia: `r[w] = weekKg[w] / 7`.
- Baza dzienna = interpolacja liniowa między sąsiednimi `r[w]` (rampa bez skoku
  na granicy tygodni), z zachowaniem średniej tygodnia = `r[w]`
  (czyli suma 7 dni nadal = `weekKg[w]`).

### 3. Modulacja GDH wewnątrz tygodnia (pogoda kroi tort, nie zmienia jego rozmiaru)
Cieplejszy dzień (wyższe GDH z prognozy) dostaje większy kawałek tygodniowych kg,
zimniejszy mniejszy — ale tydzień nadal sumuje się do `weekKg[w]`.

**Wzór łączący trend + pogodę, z zachowaniem wolumenu tygodnia:**
```
dayKg[d] = weekKg[w] × (baza[d] × gdh[d]) / Σ_po_tygodniu(baza[d] × gdh[d])
```
- `baza[d]` — dzienna baza z interpolacji trendu (krok 2),
- `gdh[d]` — GDH dnia z prognozy (ciepło = więcej, zimno = mniej),
- mianownik normalizuje tak, że suma tygodnia = `weekKg[w]` (krzywa zostaje wytyczną).

**Brzegi/wyjątki (bez zgadywania danych):**
- brak GDH dla dnia → użyj neutralnej wartości (średnia GDH tygodnia), nie zniekształcaj,
- brak prognozy w ogóle → zostaje sama baza z trendu (płaska modulacja),
- `totalKg ≤ 0` lub pusta krzywa → sekcja pomijana.

## Konkretne zmiany w plikach

### `src/lib/harvest-daily-forecast.ts`
- **Usuń** funkcję `calcCorrectionFactor` i pole `correctionFactor` z wyników.
- **Usuń** mnożenie `predicted * cf` (linia ~194) — prognoza bez współczynnika.
- **Zastąp** rozkład „płaska kostka + udział GDH" nowym: interpolacja trendu (krok 2)
  + modulacja GDH (krok 3, wzór wyżej).
- Sygnatura `calculateDailyForecast` traci parametr `corrections`.

### `src/app/api/harvest-forecast/daily/route.ts`
- **Usuń** sekcję „--- 4. Fetch correction factors ---" (zapytanie o `harvestPrediction.ratio`)
  i przekazywanie `corrections` do `calculateDailyForecast`.
- Reszta (fruitDate z GDH, krzywa odmiany, totalKg, forecastTemps) bez zmian.

### `src/app/dashboard/harvest/page.tsx`
- **Usuń** podtytuł „× korekcja z historii (X.XXx)" (linie ~589–591).
- Podtytuł zostaje: „predykcja na podstawie GDH z prognozy pogody × krzywa odmiany".

### `scripts/harvest-predict.ts`
- **Usuń** liczenie i stosowanie współczynnika korekcji (sekcje „--- 2 ---", `* cf`).
- **Zostaw** zapis `predictedKg` oraz dopisywanie `actualKg`/`ratio` — ale WYŁĄCZNIE
  do WYŚWIETLANIA dokładności (tabela „przewidziane vs realne" to przejrzystość, OK).
  `ratio` NIGDY nie wraca do liczenia prognozy.

## Decyzja do potwierdzenia przez Jana

Czy modulacja GDH ma działać **tylko wewnątrz tygodnia** (domyślnie — krzywa pozostaje
nienaruszalna co do wolumenu tygodnia), czy może też **lekko przesuwać** zbiory między
tygodniami (fala upałów ściąga część z przyszłego tygodnia na teraz)?
**Domyślnie: tylko wewnątrz tygodnia.** Zmiana na między-tygodniową dopiero po zgodzie Jana.

## Weryfikacja (WAŻNE — właściwa baza)

Poprawkę testować na **bazie produkcyjnej** (ta z komputera w domu / Vercel).
Baza wskazywana przez `.env` na komputerze zapasowym była rozjechana ze schematem
(brak kolumny `sections.baseTemp`, puste `ratio`) — nie nadaje się do weryfikacji.

Po zmianie sprawdzić na realnych danych: prognoza dzienna powinna zejść w stronę
realnych liczb (Blok B: ~214, nie ~538), a suma tygodnia ma odpowiadać krzywej.

## Czego NIE robić
- NIE przywracać żadnego współczynnika korekcji „w drugą stronę" — usuwamy, nie odwracamy.
- NIE dodawać fallbacku, który generuje dane bez krzywej.
- NIE zmieniać wolumenu tygodnia wynikającego z krzywej.
