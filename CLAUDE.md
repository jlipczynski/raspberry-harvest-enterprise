# Raspberry Harvest Enterprise

System do planowania i zarządzania zbiorami malin — multi-tenant SaaS z prognozowaniem na podstawie GDH (Growing Degree Hours).

## Quick Reference

npm install          # Install dependencies (runs prisma generate via postinstall)
npm run dev          # Start dev server (Next.js)
npm run build        # Build for production (prisma generate && next build)
npm run lint         # Run ESLint
npm run test         # Run unit/integration tests (Vitest)
npm run test:watch   # Run tests in watch mode
npm run seed         # Seed database (npx tsx prisma/seed.ts)
npx prisma migrate dev  # Run database migrations
npx prisma studio       # Open Prisma Studio (DB GUI)

## Tech Stack

- Framework: Next.js 16 (App Router) + React 19 + TypeScript 5
- Database: PostgreSQL via Neon serverless + Prisma 6 ORM
- Auth: NextAuth.js v4 (credentials provider, JWT strategy)
- UI: Tailwind CSS 4 + shadcn/ui (New York style) + Radix UI + Recharts
- Validation: Zod 4
- State: TanStack React Query 5
- Testing: Vitest
- CI/CD: GitHub Actions (lint → test → build)

## Architecture & Patterns

### Multi-Tenancy
Every data query MUST be scoped by tenantId. The tenant is resolved from the user's session. Never expose data across tenants.

### API Routes
- All API routes use Next.js Route Handlers (app/api/**/route.ts)
- Auth check via getServerSession(authOptions) at the start of every route
- Return NextResponse.json() with appropriate status codes
- Validate input with Zod schemas

### Database
- Prisma client singleton in src/lib/prisma.ts
- Uses Neon serverless adapter for edge compatibility
- Schema uses @@map() for snake_case table names
- Relations use onDelete: Cascade where appropriate

### Frontend
- React Server Components by default, "use client" only when needed
- Data fetching via TanStack React Query (useQuery/useMutation)
- shadcn/ui components in src/components/ui/ — add new ones via npx shadcn@latest add <component>
- Path alias: @/* maps to ./src/*

### Domain Concepts
- GDH (Growing Degree Hours): Accumulated heat units above base temperature (~6°C) used to predict flowering and fruit readiness
- Production Curves: Weekly/daily yield distribution patterns per variety and season
- Seasons: Summer (first crop) and Autumn (second crop)
- Plant Material Types: Wintered in tunnel, Long Canes (LC), Tray Plants

## Coding Conventions

- TypeScript strict mode — no any types, use proper typing
- Use Zod for all API input validation
- Use @/ path alias for imports (e.g., @/lib/prisma)
- Component files: PascalCase (e.g., FeedbackButton.tsx)
- API route files: route.ts inside descriptive directory structure
- All dates use date-fns for formatting/manipulation
- Polish comments are acceptable in domain-specific code (GDH, harvest logic)

## Environment Variables

Required:
- DATABASE_URL — PostgreSQL connection string (Neon)
- NEXTAUTH_SECRET — JWT signing secret

## Testing

- Tests use Vitest with @testing-library/react for component tests
- Test files: colocated with source as *.test.ts or *.test.tsx
- Run npm run test before committing
- Mock Prisma client and NextAuth session in tests
- Focus tests on: API route handlers, utility functions (especially forecast-calculator.ts), Zod schemas

## Git Workflow

- Branch from main for all changes
- CI runs automatically on push and PR: lint → test → build
- Keep commits focused and descriptive
- Do not commit .env* files or secrets
