/**
 * @deprecated FASE 16 — reemplazada por AnalisisGraderLandingPage.
 * Conservada solo para no romper lazy-imports existentes en App.tsx.
 */
import { Navigate } from 'react-router-dom'

export function AnalisisGraderWizardPage() {
  return <Navigate to="/analisis-grader" replace />
}
