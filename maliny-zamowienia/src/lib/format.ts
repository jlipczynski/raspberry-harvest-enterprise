import { format, parseISO } from "date-fns";
import { pl } from "date-fns/locale";

const plNum = new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 0 });
const plKg = new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 });

/** Kwota w złotych, np. 1234 → "1 234 zł". Zaokrąglana do pełnych złotych. */
export function formatPLN(amount: number): string {
  return `${plNum.format(Math.round(amount))} zł`;
}

/** Waga, np. 12.5 → "12,5 kg". */
export function formatKg(kg: number): string {
  return `${plKg.format(kg)} kg`;
}

/** Tylko liczba kg bez jednostki (np. do tabel). */
export function formatKgNum(kg: number): string {
  return plKg.format(kg);
}

/** Zostaw tylko cyfry; jeśli numer ma 9+ cyfr, weź ostatnie 9 (bez kierunkowego). */
export function normalizePhone(input: string | null | undefined): string {
  if (!input) return "";
  const digits = input.replace(/\D/g, "");
  return digits.length > 9 ? digits.slice(-9) : digits;
}

/** 9 cyfr → "501 599 072". Inne długości zwracane bez zmian. */
export function formatPhone(phone: string | null | undefined): string {
  const d = normalizePhone(phone);
  if (d.length === 9) return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 9)}`;
  return phone ?? "";
}

/** Link tel: z prefiksem +48 dla 9-cyfrowych numerów. */
export function telHref(phone: string | null | undefined): string {
  const d = normalizePhone(phone);
  if (!d) return "";
  return d.length === 9 ? `tel:+48${d}` : `tel:${d}`;
}

function toDate(value: string | Date): Date {
  return typeof value === "string" ? parseISO(value) : value;
}

/** np. "8 czerwca 2026". */
export function formatDate(value: string | Date): string {
  return format(toDate(value), "d MMMM yyyy", { locale: pl });
}

/** Krótko, np. "08.06.2026". */
export function formatDateShort(value: string | Date): string {
  return format(toDate(value), "dd.MM.yyyy", { locale: pl });
}

/** Dzień tygodnia po polsku z wielkiej litery, np. "Poniedziałek". */
export function weekday(value: string | Date): string {
  const d = format(toDate(value), "EEEE", { locale: pl });
  return d.charAt(0).toUpperCase() + d.slice(1);
}

export function fullName(
  c: { first_name?: string | null; last_name?: string | null } | null | undefined
): string {
  if (!c) return "—";
  return `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "—";
}
