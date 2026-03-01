# Raspberry Harvest Enterprise — Monorepo

Ten repo zawiera dwa niezależne projekty:

- **raspberry-harvest/** — System do planowania i zarządzania zbiorami malin (multi-tenant SaaS z prognozowaniem GDH)
- **dashboard/** — Dashboard application (nowy projekt)

Każdy projekt ma własny `package.json`, testy, linting i build. Są w pełni niezależne.

## Struktura

```
raspberry-harvest/     # Projekt raspberry-harvest (Next.js + Prisma + NextAuth)
dashboard/             # Projekt dashboard (Next.js)
.github/workflows/     # CI — oddzielne joby dla każdego projektu
CLAUDE.md              # Ten plik
```

## Praca z projektami

Zawsze najpierw wejdź do katalogu projektu:

```bash
cd raspberry-harvest   # lub cd dashboard
npm install
npm run dev
npm run test
npm run lint
npm run build
```

Projekty działają na różnych portach:
- raspberry-harvest: port 3000 (default)
- dashboard: port 3001

## Conventions (oba projekty)

- TypeScript strict mode — no `any` types
- Zod for API input validation
- `@/` path alias maps to `./src/*`
- Component files: PascalCase
- Tests: Vitest, colocated as `*.test.ts` / `*.test.tsx`
- Run `npm run test` in project dir before committing
- Polish comments are acceptable in domain-specific code

---

## Raspberry Harvest — Szczegóły

### Tech Stack
- Next.js 16 (App Router) + React 19 + TypeScript 5
- PostgreSQL via Neon serverless + Prisma 6 ORM
- Auth: NextAuth.js v4 (credentials, JWT)
- UI: Tailwind CSS 4 + shadcn/ui + Radix UI + Recharts
- Zod 4, TanStack React Query 5, Vitest

### Multi-Tenancy
Every data query MUST be scoped by tenantId. Never expose data across tenants.

### API Routes
- Route Handlers in `app/api/**/route.ts`
- Auth check via `getServerSession(authOptions)`
- Validate input with Zod schemas

### Database
- Prisma client singleton in `src/lib/prisma.ts`
- Neon serverless adapter
- `@@map()` for snake_case table names

### Domain Concepts
- GDH (Growing Degree Hours): heat units above ~6°C for predicting harvest
- Production Curves: weekly/daily yield patterns per variety
- Seasons: Summer (first crop), Autumn (second crop)
- Plant Material Types: Wintered in tunnel, Long Canes, Tray Plants

### Environment Variables (raspberry-harvest)
- DATABASE_URL — PostgreSQL connection string (Neon)
- NEXTAUTH_SECRET — JWT signing secret

### Commands
```bash
cd raspberry-harvest
npm run seed             # Seed database
npx prisma migrate dev   # Run migrations
npx prisma studio        # DB GUI
```

---

## Dashboard — Szczegóły

### Tech Stack
- Next.js 16 (App Router) + React 19 + TypeScript 5
- UI: Tailwind CSS 4 + shadcn/ui + Radix UI + Recharts
- Zod 4, TanStack React Query 5, Vitest

### Commands
```bash
cd dashboard
npm install
npm run dev    # port 3001
npm run build
npm run test
npm run lint
```

---

# currentDate
Today's date is 2026-03-01.
