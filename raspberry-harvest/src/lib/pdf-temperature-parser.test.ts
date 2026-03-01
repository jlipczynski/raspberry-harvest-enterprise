import { describe, it, expect } from "vitest";
import { parseTemperaturePdf, matchBlockToSections } from "./pdf-temperature-parser";

/**
 * Creates a minimal valid PDF buffer with the given title metadata and text lines.
 * Each line is rendered at a separate y-position so pdf-parse extracts them as separate lines.
 */
function createTestPdf(title: string, textLines: string[]): Buffer {
  const streamParts = ["BT /F1 10 Tf"];
  for (let i = 0; i < textLines.length; i++) {
    const escaped = textLines[i]
      .replace(/\\/g, "\\\\")
      .replace(/[()]/g, "\\$&");
    if (i === 0) streamParts.push(`50 700 Td (${escaped}) Tj`);
    else streamParts.push(`0 -15 Td (${escaped}) Tj`);
  }
  streamParts.push("ET");
  const stream = streamParts.join("\n");

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  offsets.push(pdf.length);
  pdf += "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n";
  offsets.push(pdf.length);
  pdf += "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n";
  offsets.push(pdf.length);
  pdf +=
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n";
  offsets.push(pdf.length);
  pdf += `4 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`;
  offsets.push(pdf.length);
  pdf +=
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n";
  offsets.push(pdf.length);
  pdf += `6 0 obj\n<< /Title (${title}) >>\nendobj\n`;
  const xrefOff = pdf.length;
  pdf += "xref\n0 7\n0000000000 65535 f \n";
  for (const off of offsets)
    pdf += String(off).padStart(10, "0") + " 00000 n \n";
  pdf += "trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\n";
  pdf += "startxref\n" + xrefOff + "\n%%EOF\n";
  return Buffer.from(pdf);
}

describe("parseTemperaturePdf", () => {
  it("extracts block name from PDF Title metadata", async () => {
    const pdf = createTestPdf("9C", ["01/02/2025 14:30 22.5"]);
    const result = await parseTemperaturePdf(pdf, "test.pdf");
    expect(result.blockName).toBe("9C");
  });

  it("parses DD/MM/YYYY date format", async () => {
    const pdf = createTestPdf("9C", [
      "01/02/2025 14:30 22.5",
      "01/02/2025 15:00 23.1",
      "02/02/2025 08:00 18.3",
    ]);
    const result = await parseTemperaturePdf(pdf, "test.pdf");
    expect(result.readings).toHaveLength(3);
    expect(result.readings[0].temperature).toBe(22.5);
    expect(result.readings[1].temperature).toBe(23.1);
    expect(result.readings[2].temperature).toBe(18.3);
  });

  it("parses DD.MM.YYYY date format", async () => {
    const pdf = createTestPdf("12A", [
      "01.02.2025 14:30 22.5",
      "01.02.2025 15:00 -3.2",
    ]);
    const result = await parseTemperaturePdf(pdf, "test.pdf");
    expect(result.blockName).toBe("12A");
    expect(result.readings).toHaveLength(2);
    expect(result.readings[1].temperature).toBe(-3.2);
  });

  it("parses YYYY-MM-DD date format with seconds", async () => {
    const pdf = createTestPdf("5B", [
      "2025-01-15 08:00:00 15.5",
      "2025-01-15 12:00:00 20.3",
    ]);
    const result = await parseTemperaturePdf(pdf, "test.pdf");
    expect(result.blockName).toBe("5B");
    expect(result.readings).toHaveLength(2);
  });

  it("falls back to text-based title extraction", async () => {
    const pdf = createTestPdf("", ["Nazwa: 7D", "01/02/2025 14:30 22.5"]);
    const result = await parseTemperaturePdf(pdf, "test.pdf");
    expect(result.blockName).toBe("7D");
    expect(result.readings).toHaveLength(1);
  });

  it("handles comma decimal separator", async () => {
    const pdf = createTestPdf("3A", [
      "15/01/2025 10:00 22,5",
      "15/01/2025 11:00 23,8",
    ]);
    const result = await parseTemperaturePdf(pdf, "test.pdf");
    expect(result.readings).toHaveLength(2);
    expect(result.readings[0].temperature).toBe(22.5);
    expect(result.readings[1].temperature).toBe(23.8);
  });

  it("sorts readings by timestamp", async () => {
    const pdf = createTestPdf("1A", [
      "15/01/2025 12:00 20.0",
      "15/01/2025 08:00 15.0",
      "15/01/2025 16:00 25.0",
    ]);
    const result = await parseTemperaturePdf(pdf, "test.pdf");
    expect(result.readings[0].temperature).toBe(15.0);
    expect(result.readings[1].temperature).toBe(20.0);
    expect(result.readings[2].temperature).toBe(25.0);
  });

  it("rejects temperatures outside valid range", async () => {
    const pdf = createTestPdf("1A", [
      "15/01/2025 12:00 80.0",
      "15/01/2025 13:00 -60.0",
      "15/01/2025 14:00 22.5",
    ]);
    const result = await parseTemperaturePdf(pdf, "test.pdf");
    expect(result.readings).toHaveLength(1);
    expect(result.readings[0].temperature).toBe(22.5);
  });

  it("returns null blockName when no title found", async () => {
    const pdf = createTestPdf("", ["some random text", "no data here"]);
    const result = await parseTemperaturePdf(pdf, "test.pdf");
    expect(result.blockName).toBeNull();
  });

  it("returns empty readings for non-temperature text", async () => {
    const pdf = createTestPdf("9C", ["Hello world", "No temperatures here"]);
    const result = await parseTemperaturePdf(pdf, "test.pdf");
    expect(result.readings).toHaveLength(0);
  });
});

describe("matchBlockToSections", () => {
  const blocks = [
    {
      id: "b1",
      name: "C",
      sections: [
        { id: "s1", name: "C01-C05" },
        { id: "s2", name: "C06-C11" },
      ],
    },
    {
      id: "b2",
      name: "A",
      sections: [{ id: "s3", name: "A01-A12" }],
    },
    {
      id: "b3",
      name: "B",
      sections: [{ id: "s4", name: "B01-B05" }],
    },
  ];

  it("matches tunnel number to correct section range", () => {
    const matches = matchBlockToSections("9C", blocks);
    expect(matches).toHaveLength(1);
    expect(matches[0].sectionId).toBe("s2");
    expect(matches[0].sectionName).toBe("C06-C11");
  });

  it("matches case-insensitively", () => {
    const matches = matchBlockToSections("9c", blocks);
    expect(matches).toHaveLength(1);
    expect(matches[0].sectionId).toBe("s2");
  });

  it("matches tunnel in block B", () => {
    const matches = matchBlockToSections("5B", blocks);
    expect(matches).toHaveLength(1);
    expect(matches[0].sectionId).toBe("s4");
  });

  it("returns empty for unknown block letter", () => {
    const matches = matchBlockToSections("99Z", blocks);
    expect(matches).toHaveLength(0);
  });
});
