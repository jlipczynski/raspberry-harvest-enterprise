# Kontekst projektu — Raspberry Harvest Enterprise

> Ten plik aktualizuj po każdej sesji roboczej.
> Na początku rozmowy z Claude — wklej jego zawartość.

## Ostatnio zrobione

- Workers module: status tracking (new, pending, confirmed, rejected), sortowanie, filtrowanie, dane kontaktowe, przypisanie rekrutera
- Rola RECRUITER — dostęp tylko do strony workers
- GDH tracking zintegrowany ze stroną Plantacja (nie osobna strona)
- Progi GDH pobierane z API /api/varieties per odmiana
- Wykres GDH z linią realną i predykcją tunelową
- Korekta temperatury tunelu (suwak ΔT)
- **Ręczne nadpisanie liczby doniczek (`potsOverride`)** — pole w schema, API (POST/PATCH section), frontend (formularz z placeholderem auto-wartości, przycisk "wyczyść", pomarańczowe wyróżnienie nadpisanych wartości, kaskada przez cały łańcuch obliczeń)
- **Rewrite CLAUDE.md** — pełna dokumentacja projektu na podstawie faktycznego kodu (struktura plików, 17 modeli Prisma, wszystkie API routes, GDH engine, konwencje)

## Aktualny stan — co działa

- Multi-tenant auth (NextAuth v4, JWT, 3 role: MANAGER/RECRUITER/SUPER_ADMIN)
- Dashboard ze stronami: Plantacja, Planning, Varieties, Weather & GDH, Templates, Workers, Reports, Settings, Admin Panel
- Zarządzanie odmianami (Variety) z progami GDH (wintered/LC/autumn), krzywymi zbiorów, waste%, II kategoria%
- Import temperatury z PDF/CSV/TXT (Testo loggery, standard CSV)
- Krzywe zbiorów (HarvestCurve, ProductionCurveTemplate z importem XLSX)
- GDH engine: dane realne + model inercji tunelowej + prognoza 16d (Open-Meteo) + 150d (klimatologia P10/P50/P90 + anomalia ECMWF)
- Prognoza zbiorów: 3 warstwy (oryginalna z GDH, skalowana, aktualna z MaxCrop)
- Workers: rekrutacja, tier'y zatrudnienia, statusy, kontakty
- Raport Kacperek: tygodniowy/dzienny plan zbiorów z odchyleniami
- PDF export: raport GDH (jsPDF)
- CI/CD: GitHub Actions (lint → test → build) → Vercel

## W trakcie / niedokończone

- [ ] (uzupełnij co zostało w połowie)

## Do zrobienia

- [ ] (uzupełnij backlog)

## Ważne decyzje techniczne

- GDH base temp (T_baza): pochodzi z ustawień odmiany/sekcji w bazie danych (`section.baseTemp ?? variety.baseTemp`), nie jest stałą w kodzie
- GDH upper temp: 26°C (heat stress cap)
- Tunnel inertia: α=0.3, dynamic offset z radiacji: min(28, promieniowanie × 28/800), lub static +4°C
- Progi GDH zawsze z bazy — nigdy hardcode w kodzie
- WeatherData: nigdy nie nadpisywać istniejących rekordów, tylko dopisywać nowe daty
- tenantId: każde zapytanie DB musi być scopowane
- Typy materiału roślinnego (enum w kodzie): `SMALL_POT` | `ROOT` | `LONGCANE` | `PLUG`
- `potsOverride`: jeśli != null && > 0 → nadpisuje `metersLength × potsPerMeter`, kaskada przez shoots → yields
- Frontend: strony używają `"use client"` + `useState`/`useEffect`/`fetch()` (nie TanStack Query hooks)

## Znane problemy / rzeczy do uważania

- ESLint errors w `varieties/page.tsx` (`.join` on `never` type, brakujące pola `gdhSummer`/`gdhAutumn` w typie)
- `next.config.ts`: deprecated `eslint` key (warning przy build)
- `middleware.ts`: convention deprecated, Next.js sugeruje "proxy" zamiast "middleware"
- Build wymaga dostępu do Google Fonts (Geist) — offline build failuje na fontach
- `src/app/api/workers/route.ts.bak` — plik backup, do usunięcia

## Stack

- Next.js 16.1.6, React 19, TypeScript 5 strict
- PostgreSQL (Neon) + Prisma 6 (db push, bez migracji)
- NextAuth v4 (credentials, JWT, bcryptjs)
- shadcn/ui (New York) + Radix UI + Lucide icons
- Recharts 3, TanStack Query 5, Zod 4, date-fns 4
- jsPDF + jspdf-autotable (generowanie PDF), pdf-parse (czytanie PDF), xlsx (import Excel)
- Vitest 4 (54 testy), GitHub Actions (CI/CD), Vercel (hosting)

## Linki

- Repo: https://github.com/jlipczynski/raspberry-harvest-enterprise
- Produkcja: https://raspberry-harvest-enterprise.vercel.app (sprawdź aktualny URL)
- Neon DB: https://console.neon.tech

## Backlog — sesja 11.03.2026

### Do naprawy
1. Błąd zapisu szablonu — "Błąd zapisu szablonu" przy tworzeniu z zaznaczonych krzywych (API /api/templates)
2. Duplikaty w Danych historycznych — te same sekcje wielokrotnie (Blok A10-19 × 3)
3. Dziwny kształt wykresu w Danych historycznych — zbadać dane źródłowe
4. Brak sensownej edycji krzywej historycznej — przemyśleć UX

### Do zrobienia
5. Import 2024 z MaxCrop — więcej danych historycznych
6. Opisać flow: szablon → planowanie → wybór krzywej → prognoza
7. Zainstalować zaktualizowany skill (plik .skill wygenerowany dziś)

### Dziś zrobione ✅
- Vercel deployuje (fix: prisma db push --accept-data-loss)
- Bug yield naprawiony (?? zamiast ||)
- Strona "Krzywe zbiorów" z dwoma zakładkami
- Token GitHub skonfigurowany globalnie
