import { LegalDocument } from '../components/homepage/LegalDocument'

const POINTS = [
  'Use of the platform is restricted to authorized personnel for disaster-response coordination.',
  'Users must not attempt to circumvent authentication, authorization, or access controls.',
  'AI/ML recommendations are advisory only; final operational decisions rest with the human coordinator.',
  'Media uploads are subject to size and duration limits (HD photo; HD video up to 30 seconds).',
  'Unauthorized reproduction or distribution of platform content is prohibited.',
] as const

export function TermsPage() {
  return (
    <LegalDocument
      title="Terms & Conditions"
      intro="These terms govern your use of the DRCIP disaster-response coordination platform."
      points={POINTS}
      updated="2024"
    />
  )
}
