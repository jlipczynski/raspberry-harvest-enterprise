import { describe, it, expect } from "vitest";
import { parseTemperatureCsv } from "./csv-temperature-parser";
import { matchBlockToSections } from "./pdf-temperature-parser";

const TESTO_DATA = `26.02.2026 7:21:00;-17;26.02.2026 7:36:00;-08;26.02.2026 7:51:00;-02;26.02.2026 8:06:00;07;26.02.2026 8:21:00;19;26.02.2026 8:36:00;26;26.02.2026 8:51:00;35;26.02.2026 9:06:00;52;26.02.2026 9:21:00;68;26.02.2026 9:36:00;82;26.02.2026 9:51:00;105;26.02.2026 10:06:00;118;26.02.2026 10:21:00;128;26.02.2026 10:36:00;140;26.02.2026 10:51:00;134;Przekrój całkowity;29;Minimum łącznie;-30;Maksimum łącznie;140;< Podstawowe informacje >Wersja aplikacji;Nazwa programu pomiarowego;Data pomiaru;Komentarz;27.10.16.86672;Rejestrator danych;26.02.2026 10:51:00;;< Przedsiębiorstwo >Miejscowość;Państwo;Dane klienta;adres e-mail;Nazwa;Nazwisko technika;Tel.;ulica;Faks;Adres strony www;64-834;Polska;;marlena.drab@grlipczynski.pl;GR Lipczyński;Marlena Drab;502983218;Wyszynki;;;< Klient >Miejscowość;Państwo;Dane klienta;adres e-mail;Nazwa;Nazwisko technika;Tel.;ulica;;;;;;;;;< Urządzenia >Nazwa;Numer seryjny;Wersja firmware;Wielkości pomiarowe;0572 1742;85520813;1.0.8;Temperatura;< Punkt pomiarowy >Nazwa;Numer urządzenia;Typ urządzenia;Producent urządzenia;Numer seryjny urządzenia;Data produkcji;Notatki;;;;;;;;< Parametry pomiarowe >Tryb pomiaru;Cykl pomiarowy;Title;Czas rozpoczęcia;Koniec;Czas trwania;Czasowy;15 min 0 sek.;Tunel 4B;25.02.2026 8:51:00;26.02.2026 10:51:00;1 d 2 godz. 0 min 0 sek.;< Konfiguracja alarmu >Parametr/Czujnik;Górna wartość alarmowa;Górna wartość ostrzegawcza;Dolna wartość alarmowa;Temperatura 813 [°C];70;;-30;< Naruszenia limitów >Parametr/Czujnik;Pierwsze naruszenie limitu/Data/Czas;Ostatnie naruszenie limitu/Data/Czas;Ilość naruszeń limitów;Temperatura 813 [°C];-;-;0;< Wycinki graficzne >Nazwa< Zdjęcia >Nazwa`;

describe("parseTemperatureCsv - Testo format", () => {
  it("extracts block name from Testo Title field", () => {
    const result = parseTemperatureCsv(TESTO_DATA, "export.csv");
    expect(result.blockName).toBe("Tunel 4B");
  });

  it("parses all 15 readings from Testo data", () => {
    const result = parseTemperatureCsv(TESTO_DATA, "export.csv");
    expect(result.readings).toHaveLength(15);
  });

  it("divides Testo values by 10 to get °C", () => {
    const result = parseTemperatureCsv(TESTO_DATA, "export.csv");
    expect(result.readings[0].temperature).toBe(-1.7);
    expect(result.readings[1].temperature).toBe(-0.8);
    expect(result.readings[2].temperature).toBe(-0.2);
    expect(result.readings[3].temperature).toBe(0.7);
    expect(result.readings[13].temperature).toBe(14.0);
    expect(result.readings[14].temperature).toBe(13.4);
  });

  it("parses Testo timestamps correctly", () => {
    const result = parseTemperatureCsv(TESTO_DATA, "export.csv");
    const first = result.readings[0];
    expect(first.timestamp.getFullYear()).toBe(2026);
    expect(first.timestamp.getMonth()).toBe(1); // Feb = 1
    expect(first.timestamp.getDate()).toBe(26);
    expect(first.timestamp.getHours()).toBe(7);
    expect(first.timestamp.getMinutes()).toBe(21);
  });

  it("sorts readings chronologically", () => {
    const result = parseTemperatureCsv(TESTO_DATA, "export.csv");
    for (let i = 1; i < result.readings.length; i++) {
      expect(result.readings[i].timestamp.getTime()).toBeGreaterThanOrEqual(
        result.readings[i - 1].timestamp.getTime()
      );
    }
  });
});

describe("parseTemperatureCsv - standard CSV", () => {
  it("parses semicolon-delimited CSV with header", () => {
    const csv = `Data;Czas;Temperatura
01.02.2025;14:30;22.5
01.02.2025;15:00;23.1
02.02.2025;08:00;18.3`;
    const result = parseTemperatureCsv(csv, "9C.csv");
    expect(result.blockName).toBe("9C");
    expect(result.readings).toHaveLength(3);
    expect(result.readings[0].temperature).toBe(22.5);
  });

  it("parses comma-delimited CSV", () => {
    const csv = `date,time,temperature
2025-01-15,08:00,15.5
2025-01-15,12:00,20.3`;
    const result = parseTemperatureCsv(csv, "12A_data.csv");
    expect(result.blockName).toBe("12A");
    expect(result.readings).toHaveLength(2);
  });

  it("parses combined datetime column", () => {
    const csv = `timestamp;temp
01.02.2025 14:30;22.5
01.02.2025 15:00;-3.2`;
    const result = parseTemperatureCsv(csv, "5B.csv");
    expect(result.readings).toHaveLength(2);
    expect(result.readings[1].temperature).toBe(-3.2);
  });

  it("extracts block name from filename", () => {
    const csv = `date;temp\n01.02.2025 14:30;22.5`;
    expect(parseTemperatureCsv(csv, "9C.csv").blockName).toBe("9C");
    expect(parseTemperatureCsv(csv, "Blok_12A_export.csv").blockName).toBe("12A");
    expect(parseTemperatureCsv(csv, "temp_4B.csv").blockName).toBe("4B");
  });

  it("returns empty readings for empty content", () => {
    const result = parseTemperatureCsv("", "test.csv");
    expect(result.readings).toHaveLength(0);
  });
});

describe("matchBlockToSections - Testo title matching", () => {
  const blocks = [
    { id: "b1", name: "4B", sections: [{ id: "s1", name: "Sekcja 1" }] },
    { id: "b2", name: "9C", sections: [{ id: "s2", name: "Sekcja 2" }] },
  ];

  it("matches 'Tunel 4B' to block '4B' (target contains block name)", () => {
    const matches = matchBlockToSections("Tunel 4B", blocks);
    expect(matches).toHaveLength(1);
    expect(matches[0].sectionId).toBe("s1");
  });

  it("still matches exact block name", () => {
    const matches = matchBlockToSections("4B", blocks);
    expect(matches).toHaveLength(1);
    expect(matches[0].sectionId).toBe("s1");
  });

  it("matches case-insensitively", () => {
    const matches = matchBlockToSections("tunel 4b", blocks);
    expect(matches).toHaveLength(1);
  });
});
