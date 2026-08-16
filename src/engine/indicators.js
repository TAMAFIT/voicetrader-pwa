export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function sma(arr, len, idx) {
  if (idx < len - 1) return null;
  let sum = 0;
  for (let i = idx - len + 1; i <= idx; i++) sum += arr[i].c;
  return sum / len;
}

export function rsi(arr, len, idx) {
  if (idx < len) return 50;
  let gains = 0, losses = 0;
  for (let i = idx - len + 1; i <= idx; i++) {
    const delta = arr[i].c - arr[i - 1].c;
    if (delta >= 0) gains += delta;
    else losses -= delta;
  }
  if (losses === 0) return 80;
  const rs = (gains / len) / (losses / len);
  return 100 - (100 / (1 + rs));
}

export function atrPct(arr, len, idx) {
  if (idx < len) return 0;
  let sum = 0;
  for (let i = idx - len + 1; i <= idx; i++) {
    const prevClose = arr[i - 1].c;
    const tr = Math.max(
      arr[i].h - arr[i].l,
      Math.abs(arr[i].h - prevClose),
      Math.abs(arr[i].l - prevClose),
    );
    sum += tr / prevClose;
  }
  return (sum / len) * 100;
}
