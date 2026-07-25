import { text } from "./values.js";

export function todayKey() {
  return dateKey(new Date());
}

export function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDays(dateValue, days) {
  const [year, month, day] = normalizeDate(dateValue).split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return dateKey(date);
}

export function normalizeDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(text(value)) ? text(value) : todayKey();
}

export function normalizeOptionalDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(text(value)) ? text(value) : "";
}
