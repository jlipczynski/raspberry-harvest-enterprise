Raspberry Harvest Enterprise
⛔ ABSOLUTNE ZAKAZY — NIGDY nie łam tych zasad

NIGDY nie modyfikuj .github/workflows/
NIGDY nie twórz nowych branchy — zawsze git push origin main bezpośrednio
NIGDY nie pushuj na branch — tylko git push origin main
NIGDY nie naprawiaj CI/CD bez wyraźnego polecenia
NIGDY nie mów "Gotowe" jeśli nie scommitowałeś i nie pushowałeś — to kłamstwo które marnuje czas użytkownika
NIGDY nie twórz PR — użytkownik tego nie chce
Jeśli masz błąd 403 przy push — powiedz użytkownikowi, nie twórz branchy
NIGDY nie dodawaj .claude/worktrees/ do git — jest w .gitignore
NIGDY nie kłam o wykonaniu zadania — jeśli zadanie nie zostało wykonane, powiedz wprost
NIGDY nie modyfikuj pliku jeśli brief mówi go zastąpić — zastąp CAŁY plik nowym kodem

✅ OBOWIĄZKOWA SEKWENCJA PO KAŻDYM ZADANIU
Po każdej zmianie kodu wykonaj DOKŁADNIE te komendy w tej kolejności:
bashnpm run build           # musi przejść — jeśli nie, napraw błędy przed commitem
git add -A
git commit -m "opis zmian"
git push origin main    # ZAWSZE na main, nigdy na branch
Weryfikacja po commicie: uruchom git log --oneline -3 i sprawdź czy przy ostatnim commicie jest (origin/main). Jeśli nie ma — push nie przeszedł, spróbuj ponownie.
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
Coding Conventions

TypeScript strict mode — no any types
@/ path alias
export const dynamic = 'force-dynamic' na wszystkich route handlers
Polish UI text throughout
Dates: date-fns

Environment Variables

DATABASE_URL — PostgreSQL (Neon)
NEXTAUTH_SECRET — JWT secret

Git Workflow
⚠️ Claude Code Desktop używa git worktrees
.claude/worktrees/ jest w .gitignore — NIGDY go nie commituj.
Po każdej sesji Claude Code sprawdź:
bashgit log --oneline -3
Jeśli przy ostatnim commicie NIE ma (origin/main) — zmerguj ręcznie:
bashcd /Users/janlipczynski/Desktop/raspberry-harvest-enterprise
git pull origin main
git merge claude/[nazwa-worktree] --no-ff -m "opis zmian"
git push origin main
Nazwę worktree widać na dole okna Claude Code.

## Workflow Git — obowiązkowe kroki
1. Zawsze na początku: git fetch origin && git checkout main && git pull origin main
2. Po zakończeniu: commituj i pushuj na branch
3. Utwórz PR przez GitHub CLI:
   gh pr create --title "<opis zadania>" --body "" --base main
4. Podaj numer PR w podsumowaniu — nigdy nie mów użytkownikowi żeby mergował ręcznie
5. Nigdy nie pushuj na main bezpośrednio (403)
6. gh jest dostępne — PR tworzy się przez: gh pr create --title "<opis>" --body "" --base main

## ⚠️ GIT — ABSOLUTNE ZASADY
- ZAWSZE pracuj bezpośrednio na branchu `main`
- NIGDY nie twórz worktrees ani nowych branchy
- Przed rozpoczęciem: `git checkout main && git pull origin main`
- Commituj bezpośrednio na main: `git add -A && git commit && git push origin main`
- NIGDY nie używaj `git worktree`
