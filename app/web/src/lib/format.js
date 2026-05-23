export function formatDateTime(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("zh-TW", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export function formatMoney(value) {
  if (value === null || value === undefined) return "-";
  return new Intl.NumberFormat("zh-TW", {
    maximumFractionDigits: 0
  }).format(Number(value));
}
