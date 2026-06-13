# Agent „MaxCrop → System" — specyfikacja

## Cel
Codziennie automatycznie: zaloguj się do MaxCropa przez przeglądarkę, pobierz raport(y)
zbiorów (Excel), przetwórz je i wrzuć do systemu jako krzywe zbiorów
(`HarvestCurve` — kg na dzień per obszar). Zero ręcznego ściągania i wgrywania pliku.

## Punkt wyjścia (jak działa to dziś)
Dziś ręcznie: logowanie do MaxCropa → ściągnięcie Excela → wgranie w
`/dashboard/templates` → zakładka „Dane historyczne". System parsuje plik
(kolumny **data**, **obszar**, **waga rzeczywista**) i wysyła do endpointu
`POST /api/harvest-curves`. Agent automatyzuje pierwsze trzy kroki.

## Założenia (potwierdzone)
- **Dostęp do MaxCropa:** logowanie na stronę + ręczne pobranie Excela →
  agent musi **sterować przeglądarką** (zaloguj, kliknij eksport, pobierz plik).
- **Brak captcha, logowanie dozwolone** → sterowanie przeglądarką w pełni wykonalne.
- **Brak eksportu mailem** → jedyna droga to sterowanie przeglądarką.
- **Format Excela stały** → parser piszemy raz, jest stabilny.
- **Dane:** tylko zbiory (kg/dzień/obszar) → trafiają do `HarvestCurve`.
- **Częstotliwość:** automatycznie raz dziennie.
- **Wiele raportów:** docelowo kilka raportów dziennie. Start z jednym, potem dokładamy.

## Z czego agent się składa (4 klocki)

### 1. Logowanie i pobieranie z MaxCropa (sterowanie przeglądarką)
- Narzędzie: **Playwright** (headless — przeglądarka bez okna, w tle).
- Kroki: otwórz stronę logowania → wpisz login i hasło (z env, nie z kodu) →
  przejdź do raportu zbiorów → ustaw zakres dat (od początku sezonu do dziś) →
  kliknij eksport → pobierz plik `.xls/.xlsx`.

### 2. Parser Excela
- Logika już istnieje — dziś w `historical-data-tab.tsx` (szuka kolumn
  „data"/„date", „obszar"/„area", „waga rzecz"). Trzeba ją **wyciągnąć do
  osobnego, współdzielonego modułu**, żeby agent też z niej korzystał.
- Wynik per obszar: krzywa dzienna (kg/dzień), tygodniowa (%), suma kg,
  tydzień startu, data startu.

### 3. Wrzucenie do systemu
- Wyślij do `POST /api/harvest-curves` (lub wpis bezpośrednio przez Prisma).
- **Duplikaty nie powstaną:** endpoint robi upsert po parze
  **(nazwa obszaru, rok)**. Codzienny import tego samego sezonu **aktualizuje**
  te same krzywe, nie tworzy nowych. Pasuje do MaxCropa (eksport całego sezonu).

### 4. Harmonogram (codzienny start)
- System ma już cron (prognoza zapisuje się codziennie ~6:00). Agent dokłada się
  do tej samej infrastruktury — np. uruchom o 6:30.

## Wiele raportów — zaczynamy od jednego
Zamiast jednego raportu na sztywno, agent dostaje **listę raportów** — każdy jako „przepis":

```
raport = {
  nazwa:         "Zbiory — suma"
  krokiEksportu: jak w MaxCropie dojść do raportu i go pobrać
  parser:        którego parsera użyć (na start: jeden wspólny)
  cel:           gdzie wrzucić (HarvestCurve)
}
```

Agent przechodzi po liście i robi to samo dla każdego raportu. **Start: 1 wpis.**
Dokładanie kolejnego = dopisanie jednego „przepisu", bez przepisywania agenta.
Do zweryfikowania przy kolejnych raportach: czy mają te same kolumny (jeśli tak —
jeden parser; jeśli nie — osobny parser w polu `parser`).

## Przepływ jednego uruchomienia
1. **6:30 rano** — cron budzi agenta.
2. Agent odpala przeglądarkę w tle, loguje się do MaxCropa.
3. Pobiera Excel (sezon do dziś) — dla każdego raportu z listy.
4. Parsuje → krzywe per obszar.
5. Wysyła do importu → krzywe aktualizują się w systemie.
6. Zapisuje log („zaimportowano X obszarów, Y kg") albo alert przy błędzie.

## Dwie rzeczy do dobudowania w systemie (dziś ich nie ma)
1. **Uwierzytelnienie agenta.** Dziś import działa tylko z zalogowanej przeglądarki
   (ciasteczko sesji). Agent nie ma sesji → trzeba dodać **klucz API** (sekretny
   token w env), który endpoint sprawdza.
2. **(Opcjonalnie) auto-dopasowanie obszar → sekcja.** Dziś po imporcie ręcznie
   wskazujesz, który obszar to która sekcja. Można dodać auto-dopasowanie po nazwie
   (jest już podobny mechanizm dla temperatur: `matchBlockToSections`).

## Bezpieczeństwo (zgodnie z zasadą „zero hardcodu")
- Login i hasło do MaxCropa **tylko** w env (`MAXCROP_USER`, `MAXCROP_PASS`) —
  nigdy w kodzie, nigdy w gitcie.
- Klucz API agenta też w env.

## Ryzyka
- Sterowanie przeglądarką jest **kruche**: gdy MaxCrop zmieni wygląd strony,
  agent może przestać działać → potrzebne monitorowanie/alert przy błędzie.
- Pierwszy raport: główna suma zbiorów (kg per obszar per dzień) — podstawa danych 2025.

## Co trzeba zbudować — lista (kolejność)
1. Wydzielić parser Excela do wspólnego modułu (dziś w komponencie frontendu).
2. Dodać klucz API do endpointu importu.
3. Moduł logowania + pobierania z MaxCropa (Playwright).
4. Lista raportów (start: 1 wpis) + pętla po niej.
5. Połączyć: pobierz → parsuj → importuj.
6. Cron dzienny + logi/alerty.
7. (Opcjonalnie) auto-dopasowanie obszar → sekcja.
