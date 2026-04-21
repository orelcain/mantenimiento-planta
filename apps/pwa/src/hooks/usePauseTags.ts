import { useState, useEffect, useCallback } from 'react'
import { listPauseTags } from '@/services/grader/graderPauseTags.service'
import { GRADER_PAUSE_TAGS } from '@/services/grader/graderPauseTags'
import type { GraderPauseTag } from '@/services/grader/graderPauseTags'

interface UsePauseTagsResult {
  tags: GraderPauseTag[]
  loading: boolean
  reload: () => void
}

/**
 * Carga los tags desde Firestore (`graderPauseTags`).
 * Si la colección está vacía (no se ha hecho seed), usa el fallback hardcoded.
 */
export function usePauseTags(): UsePauseTagsResult {
  const [tags, setTags] = useState<GraderPauseTag[]>(GRADER_PAUSE_TAGS)
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    listPauseTags()
      .then(fetched => setTags(fetched.length > 0 ? fetched : GRADER_PAUSE_TAGS))
      .catch(() => setTags(GRADER_PAUSE_TAGS))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  return { tags, loading, reload: load }
}
