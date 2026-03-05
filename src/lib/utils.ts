import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Parse a UTC datetime string from the database (e.g. "2026-03-05 04:33:22")
 * into a proper Date object. SQLite datetime('now') stores UTC without a Z suffix,
 * so we must append 'Z' to tell JavaScript it's UTC.
 */
export function parseUTCDate(dateStr: string): Date {
  // "2026-03-05 04:33:22" → "2026-03-05T04:33:22Z"
  return new Date(dateStr.replace(" ", "T") + "Z");
}

/**
 * Format a UTC datetime string to local time display.
 * E.g. "2026-03-05 04:33:22" → "2026-03-05 12:33:22" (in UTC+8)
 */
export function formatLocalTime(dateStr: string): string {
  const d = parseUTCDate(dateStr);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
