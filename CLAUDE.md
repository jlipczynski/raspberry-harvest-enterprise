Raspberry Harvest Enterprise
⛔ ABSOLUTNE ZAKAZY — NIGDY nie łam tych zasad

NIGDY nie modyfikuj .github/workflows/
NIGDY nie naprawiaj CI/CD bez wyraźnego polecenia
NIGDY nie mów "Gotowe" jeśli nie scommitowałeś i nie pushowałeś — to kłamstwo które marnuje czas użytkownika
NIGDY nie dodawaj .claude/worktrees/ do git — jest w .gitignore
NIGDY nie kłam o wykonaniu zadania — jeśli zadanie nie zostało wykonane, powiedz wprost
NIGDY nie modyfikuj pliku jeśli brief mówi go zastąpić — zastąp CAŁY plik nowym kodem
NIGDY nie pushuj na main bezpośrednio — dostaniesz 403. Zawsze przez PR.

✅ OBOWIĄZKOWA SEKWENCJA PO KAŻDYM ZADANIU — JAK WDROŻYĆ NA PRODUKCJĘ
1. Sprawdź typy: `npx tsc --noEmit` (npm run build nie działa w sandbox — brak DATABASE_URL i Google Fonts)
2. Commituj: `git add -A && git commit -m "opis zmian"`
3. Push na branch: `git push -u origin <nazwa-brancha>`
4. Utwórz PR: `gh pr create --title "..." --body "..." --base main --repo jlipczynski/raspberry-harvest-enterprise`
5. Od razu merguj: `gh pr merge <NR> --squash --repo jlipczynski/raspberry-harvest-enterprise`
6. Jeśli merge failuje ("not mergeable") → rebase na main i force push:
   ```
   git fetch origin main && git rebase origin/main
   git push -u origin <branch> --force-with-lease
   gh pr merge <NR> --squash --repo jlipczynski/raspberry-harvest-enterprise
   ```
7. Zweryfikuj: `gh pr view <NR> --repo jlipczynski/raspberry-harvest-enterprise --json state --jq '.state'` → powinno być "MERGED"
8. Podaj numer PR użytkownikowi
✅ ZASADY WYKONANIA ZADAŃ

Czytaj brief dokładnie — wykonuj DOKŁADNIE to co napisano, nie więcej, nie mniej
Jeden plik na raz — jeśli brief mówi "zmień X w pliku Y", zmieniaj tylko Y
Nie wymyślaj — jeśli czegoś nie rozumiesz, zapytaj zamiast zgadywać
Weryfikuj przed raportem — uruchom cat [zmieniony plik] | head -50 i sprawdź czy zmiany są tam gdzie powinny
Sprawdź schemat Prisma przed każdą zmianą modelu — używaj tylko istniejących pól z prisma/schema.prisma
Gdy brief mówi "zastąp cały kod" — użyj cat > plik << 'EOF' żeby zastąpić całość, nie edytuj fragmentami


System do planowania i zarządzania zbiorami malin — multi-tenant SaaS z prognozowaniem na podstawie GDH (Growing Degree Hours).
Quick Reference
bashnpm install
npm run dev
npm run build
npm run lint
npm run test
npx prisma db push
npx prisma studio
```

## Tech Stack

- **Framework:** Next.js 16.1.6 (App Router) + React 19 + TypeScript 5
- **Database:** PostgreSQL via Neon + Prisma 6
- **Auth:** NextAuth.js v4
- **UI:** Tailwind CSS 4 + shadcn/ui + Radix UI + Lucide icons
- **Charts:** Recharts 3
- **State:** TanStack React Query 5
- **Testing:** Vitest 4

## Project Structure
```
src/
├── app/
│   ├── api/
│   │   ├── harvest-curves/
│   │   │   ├── [id]/
│   │   │   ├── merge/               # Merge multiple HarvestCurves (POST)
│   │   │   ├── to-template/         # Convert area data → ProductionCurveTemplate (POST)
│   │   │   └── route.ts
│   │   ├── plantation/
│   │   │   └── section/[id]/
│   │   │       └── assignment/      # SectionTemplateAssignment (POST, DELETE)
│   │   ├── templates/               # ProductionCurveTemplate CRUD
│   │   └── ...
│   └── dashboard/
│       ├── templates/
│       │   ├── page.tsx             # Zakładki: Szablony + Dane historyczne
│       │   └── historical-data-tab.tsx
│       ├── planning/page.tsx
│       └── ...
prisma/
├── schema.prisma
├── seed.ts
└── migrate-maxcrop-data.ts
Architektura krzywych zbiorów
Dwa osobne byty — NIE mylić:
HarvestCurve = surowe dane historyczne z MaxCrop (per sekcja):

Import przez XLSX na /dashboard/templates → zakładka "Dane historyczne"
dailyCurve = kg per dzień (absolutne wartości)
Pola: isArchived Boolean @default(false), name String?, mergedFromIds String[]

ProductionCurveTemplate = szablon krzywej do planowania:

Tworzony z danych obszarów przez POST /api/harvest-curves/to-template
dailyCurve = % dzienne (NIE kilogramy!)
Pola: sourceAreaNames String[], sourceHarvestCurveIds String[]

Endpoint to-template przyjmuje (z frontendu):
typescript{
  name: string           // wymagane
  season: string         // 'summer' | 'autumn' — wymagane  
  dailyCurve: number[]   // % dzienne — wymagane
  weeklyCurve: number[]  // % tygodniowe
  totalKg: number
  productionYear: number
  startWeek: number
  sourceAreaNames: string[]
  varietyId?: string
  winteredInTunnel?: boolean
  plantSource?: string
  productionCycle?: number
}
Auto-detekcja granicy lato/jesień:
typescriptfunction detectSummerEnd(weeks: { week: number; kg: number }[]): number {
  const peak = Math.max(...weeks.map(w => w.kg))
  const peakIdx = weeks.findIndex(w => w.kg === peak)
  for (let i = peakIdx + 1; i < weeks.length; i++) {
    if (weeks[i].kg < peak * 0.2) return weeks[i - 1]?.week || 30
  }
  return weeks[weeks.length - 1]?.week || 30
}
```

## Database Models (Prisma)

| Model | Purpose |
|-------|---------|
| **Tenant** | Multi-tenancy root |
| **User** | Auth (role: MANAGER/RECRUITER/SUPER_ADMIN) |
| **Farm** | Location, seasonStartDate |
| **Block** | Group of sections |
| **Variety** | Odmiana: yields, GDH thresholds, harvest curves |
| **Section** | Jednostka: metersLength, potsPerMeter, shootsPerPot, potsOverride, plantingDate, winteredInTunnel, plantSource |
| **HarvestCurve** | Dane historyczne: year, season, dailyCurve (kg), totalKg, isArchived, name, mergedFromIds |
| **WeatherData** | Daily temps + GDH — NIGDY nie nadpisywać, tylko dopisywać |
| **ProductionCurveTemplate** | Szablony: dailyCurve (%), weeklyCurve (%), sourceAreaNames, sourceHarvestCurveIds |
| **SectionTemplateAssignment** | Section → Template mapping |
| **TemperatureReading** | Raw Testo logger data |

## Architecture & Patterns

### Multi-Tenancy
Każde zapytanie DB MUSI być scopowane przez `tenantId`. Używaj `requireTenantId()` z `src/lib/tenant.ts`.

### GDH Calculation
- Base: 4.5°C, upper cap: 26°C
- `gdhDaily = max(0, min(tempAvg, 26) - 4.5) × 24`
- Progi GDH zawsze z bazy — NIGDY hardcode

### Pot Count
```
pots = potsOverride > 0 ? potsOverride : metersLength × potsPerMeter
shoots = pots × shootsPerPot
yield = shoots × yieldPerShoot
## Znane pułapki i poprawki (z sesji marzec 2026)

### PATCH endpointy — bezpieczeństwo pól
- PATCH `/api/varieties/[id]` aktualizuje TYLKO pola obecne w request body
- Wzorzec: `if (field in body) data[field] = body[field] ?? null`
- BEZ tego wzorca: frontend nie wysyła gdhSummer/gdhAutumn → Prisma ustawia je na null → dane znikają

### POST endpointy — zachowanie wartości 0
- Używaj `field != null ? parseFloat(field)` zamiast `field ? parseFloat(field)`
- `0` jest falsy w JS → truthy check zamienia 0 na null

### GDH thresholds — nowy vs stary system
- **Stare pola (legacy, NIE UŻYWANE w UI):** `gdhSummer`, `gdhAutumn`
- **Nowe pola (aktywne):** `gdhWinteredFlower`, `gdhWinteredFruit`, `gdhLcFlower`, `gdhLcFruit`, `gdhAutumnFlower`, `gdhAutumnFruit`
- UI odmiany edytuje/wyświetla NOWE pola — nie wyświetlaj starych

### ProductionCurveTemplate — dual-season
- Jeden rekord zawiera OBA sezony: `dailyCurveSummer` + `dailyCurveAutumn`
- NIE dziel szablonów na summer/autumn w UI — wyświetlaj jedną listę
- Pole `season` jest derive'owane ale nie powinno być kryterium filtrowania

### Import temperatur (XLSX)
- `src/lib/xlsx-temperature-parser.ts` — parsuje XLSX, każdy arkusz = jeden tunel
- `extractBlockFromSheetName()` szuka wzorca T{cyfry}{litera} GDZIEKOLWIEK w nazwie (nie tylko exact match)
- Obsługuje: "T3C", "T3C_20-03-2026", "T3C dane", "Tunel 3C", "3C"
- `matchBlockToSections()` w `src/lib/temperature-utils.ts` mapuje kod tunelu → sekcje
- macOS file picker wymaga MIME types w `accept` (nie tylko rozszerzenia): dodaj `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`

## Coding Conventions

- TypeScript strict mode — no `any` types
- `@/` path alias
- `export const dynamic = 'force-dynamic'` na wszystkich route handlers
- Polish UI text throughout
- Dates: `date-fns`

## Environment Variables

- `DATABASE_URL` — PostgreSQL (Neon)
- `NEXTAUTH_SECRET` — JWT secret

## Git Workflow — SPRAWDZONE, DZIAŁAJĄCE KROKI

### Ważne info o środowisku
- git remote wskazuje na **lokalny proxy (127.0.0.1)**, nie na github.com
- Dlatego do `gh` CLI **ZAWSZE** dodawaj `--repo jlipczynski/raspberry-harvest-enterprise`
- Push bezpośrednio na main daje **403** — jedyna droga to PR
- `gh` CLI działa w tym środowisku (w przeciwieństwie do wcześniejszych sesji z problemami TLS)
- Jeśli `gh` failuje z TLS — fallback na `curl -sk` do `https://api.github.com`
- `npm run build` NIE DZIAŁA w sandbox (brak DATABASE_URL, Google Fonts blocked) — używaj `npx tsc --noEmit`
- Branch name jest przydzielany przez system (np. `claude/prisma-schema-curves-HsAqE`) — użyj go

### Workflow krok po kroku
1. Na starcie: `git fetch origin main && git checkout main && git pull origin main`
2. Przełącz na branch: `git checkout -b <branch-name>` lub `git checkout <branch-name>`
3. Zrób zmiany, sprawdź typy: `npx tsc --noEmit`
4. Commit: `git add -A && git commit -m "opis"`
5. Push: `git push -u origin <branch-name>`
6. PR: `gh pr create --title "..." --body "..." --base main --repo jlipczynski/raspberry-harvest-enterprise`
7. Merge: `gh pr merge <NR> --squash --repo jlipczynski/raspberry-harvest-enterprise`
8. Jeśli "not mergeable" → rebase i force push:
   ```
   git fetch origin main && git rebase origin/main
   git push -u origin <branch> --force-with-lease
   ```
   Potem ponów merge.
9. Weryfikacja: `gh pr view <NR> --repo ... --json state --jq '.state'` → "MERGED"

### Czego NIE robić
- NIE pushuj na main (403)
- NIE twórz worktrees
- NIE używaj `git worktree`
- NIE czekaj na użytkownika z mergem — merguj od razu

## Zasady pisania briefów i debugowania

### PRZED napisaniem briefu
1. Zawsze przeczytaj kod który ma być zmieniony:
   `cat src/app/[ścieżka]/plik.tsx`
   lub `sed -n '[start],[end]p' plik.tsx` dla konkretnych linii
2. Znajdź konkretną funkcję i linię która jest błędna
3. Pokaż Janowi co dokładnie jest nie tak i dlaczego
4. Dopiero potem pisz brief

### Brief musi zawierać
- Nazwę konkretnej funkcji do zmiany
- Obecny błędny kod (skopiowany z pliku)
- Nowy poprawny kod
- Nigdy ogólne opisy typu "napraw logikę X"

### Po każdym PR
- Zawsze: `git pull origin main`
- Zweryfikuj zmianę: `grep -n "kluczowa_funkcja" plik.tsx`
- Claude Code może kłamać że naprawił — zawsze weryfikuj kodem

### Kluczowe zasady domenowe
- `dailyCurve` w ProductionCurveTemplate = PROCENTY (0-100), nie kg
  Przy wyświetlaniu: `kg = (pct / 100) * totalKg`
- Podział lato/jesień przy zapisie TYLKO przez daty:
  - `commercialStartDate` = start lata (klikany przez użytkownika)
  - `commercialStartDateAutumn` = start jesieni (klikany przez użytkownika)
  - `detectSummerEnd` = tylko wizualna sugestia, NIGDY nie decyduje o zapisie
- Jeden szablon per blok — nie osobno lato i jesień

## ⛔ KRYTYCZNE ZASADY ARCHITEKTONICZNE — NIGDY NIE ŁAM

### 1. Data startu zbiorów pochodzi WYŁĄCZNIE z GDH (`fruitDate`)
`fruitDate` = data gdy skumulowane GDH sekcji osiągnie `fruitThreshold`.
Obliczana z: realnych pomiarów loggerów → prognoza 16-dniowa Open-Meteo → scenariusz klimatologiczny.

**NIGDY nie używaj jako punktu startowego zbiorów:**
- `startDateSummer` z ProductionCurveTemplate
- `startDateAutumn` z ProductionCurveTemplate
- żadnej innej daty z szablonu

**Szablon dostarcza WYŁĄCZNIE procenty rozkładu (0-100%).**
Punkt startowy procentów = zawsze `fruitDate`.

Weryfikacja po każdej zmianie w planning/page.tsx:
```bash
grep -n "new Date(summerStartDate)\|new Date(autumnStartDate)" src/app/dashboard/planning/page.tsx
# Wynik musi być PUSTY
```

### 2. Wolumen zbiorów pochodzi WYŁĄCZNIE z sekcji/odmiany
```
kg = poty × pędy × norma_kg_per_pęd
poty = potsOverride ?? (metersLength × potsPerMeter)
norma = section.yieldSummerPerShoot ?? variety.yieldSummerPerShoot
```
**NIGDY nie używaj `totalKgSummer` z szablonu jako wolumenu zbiorów.**
Szablon nie zna liczby doniczek ani pędów konkretnej sekcji.

### 3. ProductionCurveTemplate — co przechowuje, co nie
| Pole | Znaczenie | Używać do |
|------|-----------|-----------|
| `dailyCurveSummer` | % dzienne (0-100) | Rozkład kg w czasie |
| `weeklyCurveSummer` | % tygodniowe (0-100) | Rozkład kg w czasie |
| `totalKgSummer` | Historyczne kg z MaxCrop | NIE DO PLANOWANIA |
| `startDateSummer` | Data z historii 2024/2025 | NIE JAKO START ZBIORÓW |

### 4. Hierarchia krzywej zbiorów
```
1. SectionTemplateAssignment → weeklyCurveSummer/dailyCurveSummer
2. section.harvestCurveSummer
3. variety.harvestCurveSummer
4. BRAK krzywej → pokazuj ostrzeżenie, nie generuj danych
```
**NIGDY nie dodawaj fallbacku który generuje dane bez krzywej.**

### 5. Fallbacki — zasada zerowej tolerancji
**Jeśli brakuje kluczowych danych — pokaż błąd, nie generuj danych.**

❌ NIEDOPUSZCZALNE fallbacki:
- Płaska krzywa 10×10% gdy brak krzywej
- Użycie daty z szablonu gdy brak fruitDate
- Użycie totalKg z szablonu gdy brak normy sekcji

✅ POPRAWNA reakcja na brak danych:
- Komunikat "Uzupełnij datę wysadzenia"
- Komunikat "Brak krzywej zbiorów — wybierz szablon"
- Sekcja bez danych = brak wierszy w tabeli

### 6. Weryfikacja po każdej zmianie w planning/page.tsx
```bash
# 1. Brak użycia dat z szablonu jako punktu startowego
grep -n "new Date(summerStartDate)\|new Date(autumnStartDate)" src/app/dashboard/planning/page.tsx
# Wynik: PUSTY

# 2. filteredPlanData istnieje i ma logikę
grep -n "filteredPlanData" src/app/dashboard/planning/page.tsx
# Wynik: minimum 5 wystąpień

# 3. FLAT_CURVE nie istnieje
grep -n "FLAT_CURVE" src/app/dashboard/planning/page.tsx
# Wynik: PUSTY

# 4. Build przechodzi
npm run build
```

### 7. autumnShootDate — start jesieni
- `autumnShootDate` jest polem na modelu **Section** (nie Variety)
- Od tej daty system akumuluje GDH (23 000) do obliczenia owocowania jesiennego
- `autumnStartWeek` — USUNIĘTE z modelu Variety (było reliktem hardcoded tygodnia 33)
- Każda sekcja ma własną datę wypuszczenia pędów jesiennych

### 8. Dane testowe
- **NIGDY** nie wpisuj fejkowych danych do bazy przez Prisma, curl ani agenta
- Jeśli trzeba testować zapis — poproś Jana o wykonanie przez UI
- Konto testowe: `testowanie@ai.com` (seed: `npm run seed:test`)

### 9. Agent Chrome
- **NIGDY** nie używaj agenta Claude in Chrome gdy Jan pracuje w swoim oknie Chrome
- Agent Chrome tylko na koncie `testowanie@ai.com` i tylko za zgodą Jana

### 10. Weryfikacja po każdym PR
- `git pull origin main`
- `grep` konkretnej funkcji/zmiennej
- `npx tsc --noEmit`
- Claude Code często kłamie że naprawił — zawsze weryfikuj kodem

## ⛔ ZAKAZ HARDCODOWANIA WARTOŚCI DOMENOWYCH

NIGDY nie wpisuj na sztywno w kodzie:
- Temperatur bazowych (baseTemp) — zawsze z `section.baseTemp ?? v?.baseTemp`, brak = błąd
- Progów GDH (gdhWinteredFruit, gdhAutumnFruit, gdhLcFruit itp.) — zawsze z bazy, brak = pomiń sekcję
- Wydajności zbierania (pickingEfficiency) — zawsze z `v?.pickingEfficiency`, brak = pomiń sekcję
- Plonów per pęd (yieldSummerPerShoot, yieldAutumnPerShoot) — zawsze z bazy, brak = 0 (brak plonu)
- Tygodnia startu jesieni — pole `autumnStartWeek` usunięte, jesień liczy się z GDH od `autumnShootDate`
- Jakichkolwiek dat, ID, kwot, norm jako literałów w kodzie

JEDYNE dozwolone stałe w kodzie:
- `GDH_UPPER_TEMP = 26.0` — biologiczny cap, niezmienialny
- Stałe UI (kolory, teksty, etykiety)

JEŚLI wartość nie jest w bazie → pomiń sekcję lub zwróć błąd. NIGDY nie zgaduj domyślnej wartości.

PRZED KAŻDYM COMMITEM sprawdź:
```bash
grep -rn "?? [0-9]\||| [0-9]" src/app/api/ src/lib/
```
Każdy wynik to potencjalny błąd — uzasadnij każdy z nich.
