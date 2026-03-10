# CONTEXT — Raspberry Harvest Enterprise

Plik kontekstowy do szybkiego onboardingu w nowej sesji Claude Code.
Wklej `cat CONTEXT.md` na początku rozmowy.

## Stan projektu

**Wersja:** 0.1.0 (beta)
**Ostatnia aktualizacja:** 2026-03-10

### Ostatnio zrobione
- [x] Ręczne nadpisanie liczby doniczek (`potsOverride`) — schema, API (POST/PATCH), frontend (formularz, podgląd, lista sekcji, sumy)
- [x] Rewrite CLAUDE.md — pełna dokumentacja projektu na podstawie faktycznego kodu

### W trakcie
<!-- Uzupełnij czym aktualnie się zajmujesz -->

### Do zrobienia
<!-- Uzupełnij swoimi planami/pomysłami, np.:
- [ ] Import zbiorów z MaxCrop (CSV/XLSX)
- [ ] Wykresy prognoz na stronie Planning
- [ ] Powiadomienia SMS/WhatsApp dla pracowników
- [ ] Eksport raportów do PDF z wykresami
-->

## Kluczowe pliki (szybki dostęp)

| Co | Gdzie |
|----|-------|
| Schema DB | `prisma/schema.prisma` (17 modeli) |
| Plantacja — frontend | `src/app/dashboard/plantation/page.tsx` |
| Plantacja — API | `src/app/api/plantation/` (route.ts, section/, block/) |
| GDH engine | `src/app/api/gdh/route.ts` (400+ linii) |
| Forecast lib | `src/lib/harvest-forecast.ts` |
| GDH calculator | `src/lib/forecast-calculator.ts` |
| Parsery temp. | `src/lib/csv-temperature-parser.ts`, `pdf-temperature-parser.ts` |
| Planning page | `src/app/dashboard/planning/page.tsx` |
| Varieties page | `src/app/dashboard/varieties/page.tsx` |
| Workers page | `src/app/dashboard/workers/page.tsx` |
| Templates page | `src/app/dashboard/templates/page.tsx` |
| Auth config | `src/lib/auth.ts` |
| Tenant helper | `src/lib/tenant.ts` |
| Init/seed data | `src/app/api/init/route.ts`, `prisma/seed.ts` |

## Architektura w skrócie

- **Multi-tenant SaaS** — każdy query musi mieć `tenantId`
- **Stack:** Next.js 16 + React 19 + Prisma 6 + Neon PostgreSQL + NextAuth v4
- **Frontend:** `"use client"` pages z `fetch()` do API routes (nie React Query hooks)
- **GDH:** base=4.5°C, upper=26°C, tunnel inertia model (α=0.3)
- **Prognoza:** 3 warstwy (oryginalna z GDH, skalowana do danych, aktualna z MaxCrop)
- **Role:** MANAGER (pełny dostęp), RECRUITER (tylko pracownicy), SUPER_ADMIN (+admin panel)

## Komendy

```bash
npm run dev          # Dev server
npm run test         # Testy (54 testy, Vitest)
npm run build        # Build produkcyjny
npx prisma db push   # Push schema do DB
npx prisma studio    # GUI do bazy
```

## Znane problemy / dług techniczny
<!-- Uzupełnij, np.:
- ESLint warnings w varieties/page.tsx (join on never type)
- next.config.ts: deprecated eslint key
- middleware.ts: "middleware" convention deprecated, use "proxy"
-->
