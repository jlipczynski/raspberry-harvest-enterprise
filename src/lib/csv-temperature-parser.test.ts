import { describe, it, expect } from "vitest";
import { parseTemperatureCsv } from "./csv-temperature-parser";
import { matchBlockToSections } from "./temperature-utils";

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

  it("returns null blockName for timestamp-only filenames", () => {
    const csv = `date;temp\n01.02.2025 14:30;22.5`;
    const result = parseTemperatureCsv(csv, "2026-02-26-10-35-14.csv");
    expect(result.blockName).toBeNull();
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

  it("strips UTF-8 BOM", () => {
    const csv = `\uFEFFdate;temp\n01.02.2025 14:30;22.5`;
    const result = parseTemperatureCsv(csv, "5B.csv");
    expect(result.readings).toHaveLength(1);
  });
});

describe("matchBlockToSections - tunnel to section matching", () => {
  // Real-world structure: blocks are letters, sections have tunnel ranges
  const blocks = [
    {
      id: "b1",
      name: "B",
      sections: [
        { id: "s1", name: "B01-B05" },
        { id: "s2", name: "B06-B11" },
      ],
    },
    {
      id: "b2",
      name: "C",
      sections: [
        { id: "s3", name: "C01-C05" },
        { id: "s4", name: "C06-C11" },
      ],
    },
  ];

  it("matches 'Tunel 9C' to block C section C06-C11", () => {
    const matches = matchBlockToSections("Tunel 9C", blocks);
    expect(matches).toHaveLength(1);
    expect(matches[0].sectionId).toBe("s4");
    expect(matches[0].sectionName).toBe("C06-C11");
  });

  it("matches 'Tunel 4B' to block B section B01-B05", () => {
    const matches = matchBlockToSections("Tunel 4B", blocks);
    expect(matches).toHaveLength(1);
    expect(matches[0].sectionId).toBe("s1");
    expect(matches[0].sectionName).toBe("B01-B05");
  });

  it("matches 'Tunel 7B' to block B section B06-B11", () => {
    const matches = matchBlockToSections("Tunel 7B", blocks);
    expect(matches).toHaveLength(1);
    expect(matches[0].sectionId).toBe("s2");
  });

  it("matches '3C' (without 'Tunel' prefix) to block C section C01-C05", () => {
    const matches = matchBlockToSections("3C", blocks);
    expect(matches).toHaveLength(1);
    expect(matches[0].sectionId).toBe("s3");
  });

  it("matches case-insensitively", () => {
    const matches = matchBlockToSections("tunel 9c", blocks);
    expect(matches).toHaveLength(1);
    expect(matches[0].sectionId).toBe("s4");
  });

  it("falls back to all sections when tunnel number is out of any range", () => {
    const matches = matchBlockToSections("Tunel 99C", blocks);
    // 99 is not in range 1-5 or 6-11, fallback to all sections in C
    expect(matches).toHaveLength(2);
    expect(matches.map(m => m.sectionName).sort()).toEqual(["C01-C05", "C06-C11"]);
  });

  it("returns empty when block letter not found", () => {
    const matches = matchBlockToSections("Tunel 5Z", blocks);
    expect(matches).toHaveLength(0);
  });

  it("handles section names with spaces around dash", () => {
    const blocksWithSpaces = [
      {
        id: "b1",
        name: "A",
        sections: [{ id: "s1", name: "A01 - A06" }],
      },
    ];
    const matches = matchBlockToSections("Tunel 3A", blocksWithSpaces);
    expect(matches).toHaveLength(1);
    expect(matches[0].sectionId).toBe("s1");
  });

  it("handles section names without leading zeros", () => {
    const blocksNoZeros = [
      {
        id: "b1",
        name: "D",
        sections: [{ id: "s1", name: "D1-D5" }],
      },
    ];
    const matches = matchBlockToSections("Tunel 3D", blocksNoZeros);
    expect(matches).toHaveLength(1);
  });
});
