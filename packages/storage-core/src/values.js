export function text(value) {
  return String(value ?? "");
}

export function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}
