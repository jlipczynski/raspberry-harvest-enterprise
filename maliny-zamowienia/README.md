# Maliny: Zamówienia

Aplikacja webowa (mobile-first) do zbierania i obsługi zamówień na maliny —
**II gatunek (przetwory)** oraz **Premium (I klasa)**. Zastępuje arkusz Excel:
wspólna baza klientów, lista zamówień z datami dostaw, automatyczne
podsumowania per data, historia dostaw i widok do druku.

Stack: **Next.js 14 (App Router) + TypeScript + Supabase (Postgres) + Tailwind CSS**, hosting na **Vercel**.

---

## 1. Zmienne środowiskowe

Skopiuj `.env.example` do `.env.local` i uzupełnij:

```
NEXT_PUBLIC_SUPABASE_URL=        # Supabase → Settings → API → Project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=   # Supabase → Settings → API → anon public
SUPABASE_SERVICE_ROLE_KEY=       # Supabase → Settings → API → service_role (TAJNE!)
APP_PASSWORD=                    # jedno hasło do całej aplikacji
```

> `SUPABASE_SERVICE_ROLE_KEY` jest tajny — używany tylko po stronie serwera
> (route handlers). Nigdy nie trafia do przeglądarki.

---

## 2. Baza danych (Supabase)

1. Utwórz projekt na [supabase.com](https://supabase.com).
2. W panelu: **SQL Editor** → wklej zawartość `supabase/migrations/0001_init.sql` → **Run**.
   Tworzy tabele `customers`, `deliveries`, `orders`, `settings` oraz wstawia ceny startowe.
3. Zaimportuj klientów: **SQL Editor** → wklej zawartość `supabase/seed_customers.sql` → **Run**.
4. Weryfikacja:
   ```sql
   select count(*) from customers;   -- powinno być 690
   select * from settings;           -- price_second, price_premium
   ```

> Alternatywnie, jeśli masz Supabase CLI i połączenie do bazy:
> `psql "$DATABASE_URL" -f supabase/migrations/0001_init.sql`
> `psql "$DATABASE_URL" -f supabase/seed_customers.sql`

---

## 3. Uruchomienie lokalne

```bash
cd maliny-zamowienia
npm install
npm run dev        # http://localhost:3000
```

Inne skrypty: `npm run build`, `npm run start`, `npm run typecheck`, `npm run lint`.

---

## 4. Deploy na Vercel

1. **New Project** → wskaż to repo.
2. **Root Directory:** `maliny-zamowienia` (ważne — projekt jest w podkatalogu).
3. Dodaj zmienne środowiskowe (sekcja 1) w **Settings → Environment Variables**.
4. Deploy. Po wdrożeniu podaj URL produkcyjny.

---

## 5. Ekrany

| Ścieżka | Opis |
|---------|------|
| `/` | Pulpit — najbliższa dostawa, skróty, lista otwartych dostaw |
| `/zamowienia` | Główny ekran roboczy — zamówienia wybranej dostawy, dodawanie/edycja |
| `/dostawy` | Lista dostaw, nowa dostawa, otwórz/drukuj/zamknij |
| `/historia` | Wszystkie dostawy + szczegóły + RAZEM (sezon) |
| `/klienci` | Baza klientów — szukaj, dodaj, edytuj, usuń |
| `/druk/[deliveryId]` | Widok do druku (A4 pionowo, `window.print()`) |
| `/ustawienia` | Ceny (z `settings`) + wylogowanie |
| `/login` | Logowanie hasłem |

---

## 6. Zasady domenowe (ważne)

- **Zero cen na sztywno.** Kwota = `kg_second × price_second + kg_premium × price_premium`,
  ceny zawsze z tabeli `settings`. Kwoty **nie są** zapisywane w bazie — liczone na bieżąco.
- **MVP — brak zamrażania kwot historycznych:** zmiana ceny w `/ustawienia` przeliczy
  również kwoty zamkniętych dostaw. Akceptowalne na tym etapie.
- **Telefon:** normalizowany do 9 cyfr (bez spacji), wyświetlany jako `501 599 072`,
  klikalny jako `tel:+48…`. Ułatwia przyszłą integrację SMS.
- **Waluta:** `1 234 zł` (pełne złote, separator tysięcy).

---

## 7. Autoryzacja (MVP)

Wybrano **prostą ochronę hasłem** (env `APP_PASSWORD`):
- `/login` → `POST /api/login` sprawdza hasło i ustawia podpisany cookie (`httpOnly`).
- `middleware.ts` chroni wszystkie ścieżki poza `/login` i `/api/login`.
- Wylogowanie: `/ustawienia` → „Wyloguj się".

> Bez `APP_PASSWORD` aplikacja jest niezabezpieczona (tryb dev). Na produkcji **ustaw** `APP_PASSWORD`.

---

## 8. API

| Metoda | Ścieżka | Opis |
|--------|---------|------|
| GET/POST | `/api/customers` | lista (z liczbą zamówień) / nowy |
| PATCH/DELETE | `/api/customers/[id]` | edycja / usuń (blokada gdy ma zamówienia) |
| GET/POST | `/api/deliveries` | lista / nowa |
| GET/PATCH/DELETE | `/api/deliveries/[id]` | szczegóły / status,notatka / usuń |
| GET | `/api/deliveries/[id]/orders` | zamówienia dostawy + ceny + podsumowanie |
| POST | `/api/orders` | nowe zamówienie |
| PATCH/DELETE | `/api/orders/[id]` | edycja / usuń |
| GET/PATCH | `/api/settings` | ceny |
| GET | `/api/summary` | podsumowania wszystkich dostaw |
| GET/POST | `/api/notify` | placeholder SMS (501 — przyszła iteracja) |

---

## 9. Przyszłość (nie zaimplementowane)

- **SMS do klientów** (przypomnienia o dostawie) przez SMSAPI.pl / SerwerSMS.pl.
  Numery są już znormalizowane do 9 cyfr. Endpoint `/api/notify` zwraca `501` jako placeholder.
