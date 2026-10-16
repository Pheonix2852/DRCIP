import { LegalDocument } from '../components/homepage/LegalDocument'

const POINTS = [
  'No advertising or tracking cookies are set.',
  'Session data is stored transiently in browser localStorage and authenticated via JWT.',
  'No data is shared with third-party vendors or LLM services without explicit consent.',
  'Users may request account deletion via the profile settings page.',
] as const

export function PrivacyPage() {
  return (
    <LegalDocument
      title="Privacy Policy"
      intro="This platform does not collect or store personally identifiable information beyond what is required for account functionality."
      points={POINTS}
      updated="2024"
    />
  )
}
