# Raspberry Harvest Enterprise

## ⛔ ABSOLUTNE ZAKAZY
- NIGDY nie modyfikuj .github/workflows/
- NIGDY nie twórz nowych branchy — zawsze commit na main
- NIGDY nie naprawiaj CI/CD bez wyraźnego polecenia

System do planowania i zarządzania zbiorami malin — multi-tenant SaaS z prognozowaniem na podstawie GDH (Growing Degree Hours).

## Quick Reference

```bash
npm install          # Install dependencies (runs prisma generate via postinstall)
npm run dev          # Start dev server (Next.js)
npm run build        # Build: prisma generate → db push → migrate-maxcrop-data → next build
npm run lint         # Run ESLint
npm run test         # Run unit/integration tests (Vitest)
npm run test:watch   # Run tests in watch mode
npm run seed         # Seed database (npx tsx prisma/seed.ts)
npx prisma db push   # Push schema to database (no migrations)
npx prisma studio    # Open Prisma Studio (DB GUI)
```

## Tech Stack

- **Framework:** Next.js 16.1.6 (App Router) + React 19 + TypeScript 5
- **Database:** PostgreSQL via Neon serverless (`@neondatabase/serverless`) + Prisma 6 ORM (`@prisma/adapter-neon`)
- **Auth:** NextAuth.js v4 (credentials provider, JWT strategy, bcryptjs)
- **UI:** Tailwind CSS 4 + shadcn/ui (New York style) + Radix UI + Lucide icons
- **Charts:** Recharts 3
- **Validation:** Zod 4
- **State:** TanStack React Query 5
- **PDF:** pdf-parse (reading), jsPDF + jspdf-autotable (generating)
- **Excel:** xlsx (parsing XLSX imports)
- **Dates:** date-fns 4
- **Testing:** Vitest 4 + @testing-library/react + jsdom
- **CI/CD:** GitHub Actions (lint → test → build)

## Project Structure

```
src/
├── app/
│   ├── api/                          # Route Handlers (backend)
│   │   ├── auth/[...nextauth]/       # NextAuth handler
│   │   ├── admin/users/              # User management (SUPER_ADMIN only)
│   │   ├── feedback/                 # User feedback (GET admin, POST all)
│   │   ├── farm/[id]/               # Farm details (GET, PATCH)
│   │   ├── gdh/                      # GDH calculations + forecast (complex, 400+ lines)
│   │   ├── harvest-curves/           # Harvest curve data (GET, POST)
│   │   ├── harvest-forecast/[sectionId]/ # Per-section forecast (GET)
│   │   ├── harvest-seasons/          # Commercial start dates (GET, POST)
│   │   ├── harvests/                 # Daily harvest records (GET, POST)
│   │   ├── init/                     # DB initialization with sample data (POST, GET)
│   │   ├── plantation/               # Main plantation data (GET, POST)
│   │   │   ├── block/[id]/          # Block update/delete
│   │   │   ├── section/             # Section create
│   │   │   │   └── [id]/            # Section update/delete
│   │   │   │       └── temperatures/ # Temperature readings (GET paginated, DELETE)
│   │   │   └── temperature-upload/  # PDF/CSV/TXT file upload
│   │   ├── templates/                # Production curve templates (CRUD)
│   │   │   └── [id]/
│   │   ├── varieties/                # Variety catalog (CRUD)
│   │   │   └── [id]/
│   │   ├── weather/                  # Weather data (GET)
│   │   │   └── fetch-historical/    # Open-Meteo API import (POST)
│   │   └── workers/                  # Worker management (CRUD)
│   │       └── [id]/
│   ├── dashboard/
│   │   ├── layout.tsx               # Sidebar nav, role-based menu
│   │   ├── page.tsx                 # Dashboard home (stats, capacity)
│   │   ├── admin/page.tsx           # User management + feedback viewer
│   │   ├── planning/
│   │   │   ├── page.tsx             # Forecast scenarios (P10/P50/P90), PDF export
│   │   │   └── kacperek/page.tsx    # Weekly/daily harvest report for farm manager
│   │   ├── plantation/
│   │   │   ├── page.tsx             # Block/section CRUD, temp upload
│   │   │   ├── gdh-module.tsx       # Interactive GDH line chart (Recharts)
│   │   │   ├── gdh-matrix.tsx       # GDH weekly matrix (color-coded phases)
│   │   │   └── gdh-report-pdf.ts    # PDF report generator (jsPDF)
│   │   ├── reports/page.tsx         # TXT report generation & download
│   │   ├── settings/page.tsx        # Farm config, historical weather import, data export
│   │   ├── templates/page.tsx       # Production curve templates (XLSX import, chart)
│   │   ├── varieties/page.tsx       # Variety catalog with harvest curves
│   │   ├── weather/
│   │   │   ├── page.tsx             # Weather dashboard + GDH progress
│   │   │   └── gdh-progress.tsx     # Reusable GDH progress cards
│   │   └── workers/page.tsx         # Worker recruitment + staffing tiers
│   ├── login/page.tsx               # Email/password login form
│   ├── layout.tsx                   # Root layout (fonts, providers)
│   ├── page.tsx                     # Redirects to /login
│   ├── providers.tsx                # NextAuth SessionProvider
│   └── globals.css                  # Tailwind imports
├── components/
│   ├── ui/                          # shadcn/ui components
│   │   ├── avatar.tsx
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── dropdown-menu.tsx
│   │   ├── input.tsx
│   │   ├── label.tsx
│   │   ├── separator.tsx
│   │   ├── sheet.tsx
│   │   ├── sidebar.tsx
│   │   ├── skeleton.tsx
│   │   └── tooltip.tsx
│   └── FeedbackButton.tsx           # Floating feedback widget (categories: bug, ux, krzywe, dane, pomysl)
├── hooks/
│   └── use-mobile.ts               # Responsive breakpoint (768px)
├── lib/
│   ├── auth.ts                      # NextAuth config (credentials, JWT, roles)
│   ├── prisma.ts                    # Prisma client singleton
│   ├── tenant.ts                    # getTenantId() / requireTenantId()
│   ├── utils.ts                     # cn() classname utility
│   ├── temperature-utils.ts         # Block↔section matching (Testo logger names)
│   ├── csv-temperature-parser.ts    # CSV/TXT temperature parser (Testo, standard)
│   ├── pdf-temperature-parser.ts    # PDF temperature extraction
│   ├── forecast-calculator.ts       # GDH engine, template matching, curve adjustment
│   └── harvest-forecast.ts          # 3-layer forecast (original, scaled, actual)
├── middleware.ts                    # Role-based route protection
└── tests (colocated):
    ├── lib/forecast-calculator.test.ts
    ├── lib/csv-temperature-parser.test.ts
    └── lib/pdf-temperature-parser.test.ts
prisma/
├── schema.prisma                    # 17 models
├── seed.ts                          # Creates tenant + admin user
└── migrate-maxcrop-data.ts          # Applies real 2025 MaxCrop yields to varieties/sections
```

## Database Models (Prisma)

17 models with `@@map()` for snake_case table names:

| Model | Purpose |
|-------|---------|
| **Tenant** | Multi-tenancy root |
| **User** | Auth (email, passwordHash, role: MANAGER/RECRUITER/SUPER_ADMIN) |
| **Farm** | Location (lat/lon), seasonStartDate, owns blocks/workers/weather |
| **Block** | Group of sections (tunnel), name, optional areaHa |
| **Variety** | Raspberry variety: yields, GDH thresholds (wintered/LC/autumn), harvest curves, picking efficiency, waste% |
| **Section** | Growing area: metersLength, potsPerMeter, shootsPerPot, potsOverride (manual), yields, GDH, plantingDate, winteredInTunnel |
| **HarvestCurve** | Historical production data (year, season, weekly %, daily kg, startDate) |
| **WeeklyOverride** | Per-section overrides for picking efficiency by week/year |
| **WeatherData** | Daily outdoor temps (min/max/avg) + GDH, per farm, unique by date |
| **HistoricalGdh** | Baseline GDH by day-of-year for forecasting |
| **Worker** | Staff: passport, availability, efficiency kg/h, status, contact |
| **Harvest** | Daily harvest records (date, kg, season, isPreHarvest flag) |
| **HarvestSeason** | Tracks commercial start date + GDH predicted start per section/year/season |
| **ProductionCurveTemplate** | Historical curves for forecast: daily/weekly data, temps, GDH milestones |
| **SectionTemplateAssignment** | Maps sections to templates with adjustment % |
| **TemperatureReading** | Raw logger data (timestamp, temp °C, sourceFile) |
| **Feedback** | User feedback (message, category, page) |

Key relations: Farm → Block → Section → (Harvests, TemperatureReadings, HarvestCurves). Cascade deletes on Block→Section, Section→Harvest, etc.

## Architecture & Patterns

### Multi-Tenancy
Every data query MUST be scoped by `tenantId`. Resolved from user session via `requireTenantId()` in `src/lib/tenant.ts`. Varieties can be global (`tenantId: null`) or tenant-scoped.

### Authentication & Authorization
- NextAuth v4 with Credentials provider (email + bcryptjs password)
- JWT strategy with: `role`, `tenantId`, `tenantName`, `userId`
- Three roles: **MANAGER** (full access), **RECRUITER** (workers only), **SUPER_ADMIN** (+ admin panel)
- Middleware (`src/middleware.ts`) enforces role-based route restrictions

### API Routes
- All routes in `app/api/**/route.ts` with `export const dynamic = 'force-dynamic'`
- Auth check via `getServerSession(authOptions)` at route start
- Return `NextResponse.json()` with appropriate status codes
- Tenant scoping via `requireTenantId()`

### Frontend
- Most pages are `"use client"` with direct `fetch()` calls to API routes
- `TanStack React Query` available but pages primarily use `useState` + `useEffect` + manual fetch
- shadcn/ui components in `src/components/ui/` — add via `npx shadcn@latest add <component>`
- Path alias: `@/*` maps to `./src/*`

### GDH Calculation Engine (`/api/gdh/route.ts`)
The most complex API route (400+ lines):
1. **Real data**: Temperature readings from Testo loggers → daily GDH
2. **Tunnel inertia model**: `T_tunnel(t) = α×(T_out + offset) + (1-α)×T_tunnel(t-1)` where α=0.3
3. **16-day forecast**: Open-Meteo hourly data with radiation → tunnel temps
4. **150-day forecast**: Historical climatology percentiles (P10/P50/P90) + ECMWF seasonal anomaly
5. **Constants**: base=4.5°C, upper=26°C (heat stress cap)

### Pot Count Calculation
```
IF potsOverride != null && potsOverride > 0:
  pots = potsOverride                    (manual override)
ELSE:
  pots = metersLength × potsPerMeter     (automatic)

shoots = pots × shootsPerPot
yieldSummer = shoots × yieldSummerPerShoot
yieldAutumn = shoots × yieldAutumnPerShoot
```

### Forecast System (`src/lib/harvest-forecast.ts`)
Three-layer approach:
1. **Original**: GDH + variety harvest curve → weekly distribution
2. **Scaled**: Auto-fitted to actual harvest data
3. **Actual**: Imported from MaxCrop records

## Domain Concepts

- **GDH (Growing Degree Hours)**: Accumulated heat units above base temperature (4.5°C, capped at 26°C). `gdhDaily = max(0, min(tempAvg, 26) - 4.5) × 24`. Used to predict flowering and fruit readiness.
- **Harvest Curves**: Weekly % distribution of total yield per variety and season (e.g., `[0.5, 1.8, 2.5, 8.3, 18.2, ...]`).
- **Seasons**: Summer (first crop, ~weeks 18-30) and Autumn (second crop, ~weeks 33-45).
- **Plant Material Types**: `SMALL_POT` (Doniczka), `ROOT` (Korzeń), `LONGCANE`, `PLUG`.
- **Wintered in Tunnel**: GDH accumulation starts from January 1st (instead of planting date).
- **Production Curve Templates**: Historical MaxCrop data used for forecast calibration.
- **Staffing Tiers**: Personnel requirements by daily harvest volume (pickers, QC, weighing, infrastructure).

## Coding Conventions

- TypeScript strict mode — no `any` types
- `@/` path alias for imports (e.g., `@/lib/prisma`)
- Component files: PascalCase (e.g., `FeedbackButton.tsx`)
- API route files: `route.ts` inside descriptive directory structure
- Dates: `date-fns` for formatting/manipulation
- Polish comments acceptable in domain-specific code (GDH, harvest logic)
- Polish UI text throughout (all user-facing strings in Polish)

## Environment Variables

Required:
- `DATABASE_URL` — PostgreSQL connection string (Neon)
- `NEXTAUTH_SECRET` — JWT signing secret

## Testing

- Vitest with `@testing-library/react` for component tests
- Test files colocated: `*.test.ts` / `*.test.tsx` in `src/lib/`
- Current tests: `forecast-calculator`, `csv-temperature-parser`, `pdf-temperature-parser` (54 tests total)
- Run `npm run test` before committing
- Mock Prisma client and NextAuth session in tests

## CI/CD

GitHub Actions (`.github/workflows/ci.yml`):
- Triggers: push to `main`, PRs to `main`
- Steps: checkout → Node 20 setup → `npm ci` → lint → test → build
- Build uses placeholder `DATABASE_URL` and `NEXTAUTH_SECRET`

## Git Workflow

- Branch from `main` for all changes
- CI runs automatically on push and PR
- Keep commits focused and descriptive
- Do not commit `.env*` files or secrets
