/**
 * Uniformly subsample an array to at most maxPoints entries.
 * Always includes the first and last element to preserve the latest data point.
 * Uses a Set to prevent duplicate indices; result is in original order.
 */
export function subsampleData<T>(rawData: T[], maxPoints = 120): T[] {
  if (rawData.length === 0) return []
  if (maxPoints <= 0) return []
  if (maxPoints === 1) return [rawData[rawData.length - 1]!]
  if (rawData.length <= maxPoints) return rawData

  const indices = new Set<number>([0, rawData.length - 1])
  for (let i = 1; i < maxPoints - 1; i++) {
    const idx = Math.round((i / (maxPoints - 1)) * (rawData.length - 1))
    indices.add(idx)
  }
  return [...indices].sort((a, b) => a - b).map((i) => rawData[i]!)
}
