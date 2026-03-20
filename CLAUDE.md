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
