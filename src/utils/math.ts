export interface StatsResult {
  min: number;
  max: number;
  avg: number;
  std: number;
  p75: number;
  p90: number;
  p95: number;
}

export function getPercentile(values: number[], pct: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const k = (sorted.length - 1) * (pct / 100);
  const i = Math.floor(k);
  const f = k - i;
  if (i + 1 < sorted.length) {
    return sorted[i] + f * (sorted[i + 1] - sorted[i]);
  }
  return sorted[i];
}

export function getStats(arr: number[]): StatsResult {
  if (!arr.length) return { min: 0, max: 0, avg: 0, std: 0, p75: 0, p90: 0, p95: 0 };
  const n = arr.length;
  const min = Math.min(...arr);
  const max = Math.max(...arr);
  const avg = arr.reduce((a, b) => a + b, 0) / n;
  
  // Calculate standard deviation
  const variance = arr.map(x => Math.pow(x - avg, 2)).reduce((a, b) => a + b, 0) / n;
  const std = Math.sqrt(variance);

  const p75 = getPercentile(arr, 75);
  const p90 = getPercentile(arr, 90);
  const p95 = getPercentile(arr, 95);
  
  return { min, max, avg, std, p75, p90, p95 };
}
