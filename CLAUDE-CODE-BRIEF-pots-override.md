# BRIEF: Ręczne nadpisanie liczby doniczek w sekcji plantacji

## Kontekst projektu
- **Stack:** Next.js 16, Prisma 6, PostgreSQL (Neon), TypeScript
- **Repo:** `~/Desktop/APLIKACJE/raspberry-harvest-enterprise` (Mac mini) lub `~/Desktop/raspberry-harvest-enterprise` (MacBook)
- **Kluczowe pliki:**
  - `prisma/schema.prisma` — model Section
  - `src/app/dashboard/plantation/page.tsx` — frontend plantacji
  - `src/app/api/plantation/route.ts` — API CRUD

## Problem
Obecnie liczba doniczek jest ZAWSZE wyliczana automatycznie:
```
doniczki = metersLength × potsPerMeter
pędy = doniczki × shootsPerPot
zbiory lato = pędy × yieldSummerPerShoot
zbiory jesień = pędy × yieldAutumnPerShoot
```

W praktyce liczba doniczek może się różnić od kalkulacji (ubytki, dosadzenia, nierówne rozstawienie). Użytkownik potrzebuje możliwości ręcznego wpisania rzeczywistej liczby doniczek, która NADPISZE kalkulację i przepłynie przez cały łańcuch obliczeń.

## Co zrobić

### 1. Schema — dodaj pole `potsOverride` do modelu Section

```prisma
model Section {
  // ... istniejące pola ...
  metersLength          Float
  potsPerMeter          Float
  shootsPerPot          Float
  potsOverride          Int?      // ręczne nadpisanie liczby doniczek (null = kalkulacja automatyczna)
  // ... reszta bez zmian ...
}
```

Po zmianie: `npx prisma db push && npx prisma generate`

### 2. API — `src/app/api/plantation/route.ts`

W POST i PUT dla sekcji — dodaj `potsOverride` do danych:
```typescript
potsOverride: body.section.potsOverride !== undefined && body.section.potsOverride !== null && body.section.potsOverride !== ''
  ? parseInt(body.section.potsOverride)
  : null
```

W GET — pole i tak przyjdzie z Prisma automatycznie.

### 3. Frontend — `src/app/dashboard/plantation/page.tsx`

#### 3a. Interface Section — dodaj pole:
```typescript
interface Section {
  // ... istniejące ...
  potsOverride?: number | null;
}
```

#### 3b. sectionForm state — dodaj pole:
```typescript
const [sectionForm, setSectionForm] = useState({
  // ... istniejące ...
  potsOverride: '' as string | number,
})
```

#### 3c. KRYTYCZNA ZMIANA — funkcja `calcStats(s)`:
Obecna logika (linia ~41):
```typescript
const pots = s.metersLength * s.potsPerMeter
const shoots = pots * s.shootsPerPot
```

Zmień na:
```typescript
const pots = (s.potsOverride != null && s.potsOverride > 0) ? s.potsOverride : s.metersLength * s.potsPerMeter
const shoots = pots * s.shootsPerPot
```

#### 3d. KRYTYCZNA ZMIANA — podgląd `pv` (linia ~77):
Obecna logika:
```typescript
const pv = (() => { const pots = sectionForm.metersLength * sectionForm.potsPerMeter; ...
```

Zmień na:
```typescript
const pv = (() => {
  const potsCalc = sectionForm.metersLength * sectionForm.potsPerMeter;
  const potsOvr = sectionForm.potsOverride !== '' && sectionForm.potsOverride !== null && Number(sectionForm.potsOverride) > 0 ? Number(sectionForm.potsOverride) : null;
  const pots = potsOvr ?? potsCalc;
  const shoots = pots * sectionForm.shootsPerPot;
  ...
})()
```

#### 3e. UI — dodaj pole ręcznego nadpisania w formularzu edycji sekcji

Znajdź wiersz z "Doniczek/m" i "Pędów/don." (linia ~135-136). POD nim (lub obok podglądu "Doniczki: X / Pędy: Y" na linii ~146) dodaj pole:

```tsx
<div className="mt-2 flex items-center gap-3">
  <Label className="text-xs whitespace-nowrap">Doniczek (ręcznie):</Label>
  <Input
    type="number"
    step="1"
    placeholder={String(Math.round(sectionForm.metersLength * sectionForm.potsPerMeter))}
    value={sectionForm.potsOverride}
    onChange={e => setSectionForm({...sectionForm, potsOverride: e.target.value === '' ? '' : +e.target.value})}
    className="w-32"
  />
  {sectionForm.potsOverride !== '' && sectionForm.potsOverride !== null && Number(sectionForm.potsOverride) > 0 && (
    <button
      onClick={() => setSectionForm({...sectionForm, potsOverride: ''})}
      className="text-xs text-red-500 hover:text-red-700"
    >
      ✕ Wyczyść (wróć do auto)
    </button>
  )}
</div>
```

Placeholder powinien pokazywać automatycznie wyliczoną wartość, żeby użytkownik widział co nadpisuje.

#### 3f. Podgląd doniczek — zaznacz wizualnie że wartość jest nadpisana

W wierszu podglądu (linia ~146) zmień wyświetlanie:
```tsx
<div>
  <span className="text-gray-400">Doniczki:</span>{' '}
  <strong className={potsOvr ? 'text-orange-600' : ''}>
    {pv.pots.toLocaleString('pl-PL')}
  </strong>
  {potsOvr && <span className="text-[10px] text-orange-500 ml-1">✏️ ręcznie</span>}
</div>
```

Tak samo w liście sekcji (linia ~155) — jeśli `section.potsOverride` jest ustawione, pokaż liczbę w kolorze pomarańczowym.

#### 3g. resetSection i startEditSection — obsłuż nowe pole:
- `resetSection`: dodaj `potsOverride: ''`
- `startEditSection`: dodaj `potsOverride: s.potsOverride ?? ''`

### 4. Logika biznesowa — podsumowanie

```
JEŚLI potsOverride != null && potsOverride > 0:
  doniczki = potsOverride          ← ręczna wartość
INACZEJ:
  doniczki = metersLength × potsPerMeter   ← automatyczna kalkulacja

pędy = doniczki × shootsPerPot      ← bez zmian, zawsze z doniczek
zbiory_lato = pędy × yieldSummerPerShoot  ← kaskada
zbiory_jesień = pędy × yieldAutumnPerShoot ← kaskada
```

To MUSI działać spójnie w:
- `calcStats()` — obliczenia dla istniejących sekcji
- `pv` — podgląd w formularzu edycji
- podgląd na kartach bloków (sumy)
- podsumowanie na górze strony (totals)

### 5. Czego NIE zmieniać
- Pola `metersLength`, `potsPerMeter`, `shootsPerPot` zostają — to dane referencyjne
- Żadne inne modele się nie zmieniają
- Żadne inne strony nie wymagają zmian
- Nie usuwaj importu `requireTenantId` z API — izolacja tenantów musi zostać

### 6. Po zmianach
```bash
npx prisma db push
npx prisma generate
npx next build
git add -A && git commit -m "feat: manual pot override in plantation sections"
git push origin main
npx vercel --prod
```

### 7. Test
1. Otwórz Plantacja → edytuj sekcję
2. Pole "Doniczek (ręcznie)" powinno być puste (placeholder = auto wartość)
3. Wpisz inną liczbę → podgląd Doniczki/Pędy/Zbiory powinien się przeliczyć
4. Zapisz → na liście sekcji wartość powinna być pomarańczowa z "✏️ ręcznie"
5. Wyczyść pole → powinno wrócić do automatycznej kalkulacji
6. Sprawdź czy sumy bloków i totale na górze strony też się przeliczają
