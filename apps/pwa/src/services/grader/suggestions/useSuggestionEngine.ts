import { useMemo, useState } from 'react'
import type { GraderPhysicalConfig, GraderDailySummary } from '../types'
import type { PointZeroSuggestion } from './types'
import { suggestFishBaseLength } from './suggestFishBaseLength'
import { suggestFishBaseWidth } from './suggestFishBaseWidth'
import { suggestPocketCount } from './suggestPocketCount'
import { suggestResetFreshness } from './suggestResetFreshness'
import { suggestHistoricalCadence } from './suggestHistoricalCadence'

interface Params {
  physicalConfig: GraderPhysicalConfig
  setPhysicalConfig: (fn: (p: GraderPhysicalConfig) => GraderPhysicalConfig) => void
  medianWeightG: number | null
  medianSource: 'excel' | 'manual' | 'historical' | null
  lengthToSpacingRatio: number
  overlapping: boolean
  cadencePiecesPerMin: number
  cadenceSource: 'excel' | 'historical' | 'theoretical'
  historicalSummaries: GraderDailySummary[]
}

export function useSuggestionEngine({
  physicalConfig,
  setPhysicalConfig,
  medianWeightG,
  medianSource,
  lengthToSpacingRatio,
  overlapping,
  cadencePiecesPerMin,
  cadenceSource,
  historicalSummaries,
}: Params) {
  const [ignoredIds, setIgnoredIds] = useState<Set<string>>(new Set())

  const suggestions = useMemo((): PointZeroSuggestion[] => {
    const ignore = (id: string) =>
      setIgnoredIds((prev) => new Set([...prev, id]))

    const addIgnore = (s: PointZeroSuggestion | null): PointZeroSuggestion | null => {
      if (!s) return null
      return { ...s, ignoreFn: () => ignore(s.id) }
    }

    return [
      addIgnore(suggestFishBaseLength({ physicalConfig, medianWeightG, medianSource, setPhysicalConfig, ignoredIds })),
      addIgnore(suggestFishBaseWidth({ physicalConfig, setPhysicalConfig, ignoredIds })),
      addIgnore(suggestPocketCount({
        physicalConfig, lengthToSpacingRatio, overlapping,
        cadencePiecesPerMin, cadenceSource, setPhysicalConfig, ignoredIds,
      })),
      addIgnore(suggestResetFreshness({ physicalConfig, ignoredIds })),
      addIgnore(suggestHistoricalCadence({
        summaries: historicalSummaries,
        currentCadence: cadencePiecesPerMin,
        ignoredIds,
      })),
    ].filter((s): s is PointZeroSuggestion => s !== null)
  }, [
    physicalConfig, medianWeightG, medianSource, setPhysicalConfig,
    lengthToSpacingRatio, overlapping, cadencePiecesPerMin, cadenceSource,
    historicalSummaries, ignoredIds,
  ])

  return { suggestions }
}
