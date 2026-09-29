import { Role } from '@drcip/contracts'

export const ROLE_HOME: Record<Role, string> = {
  CITIZEN: '/report',
  FIELD_OFFICER: '/field',
  DISASTER_COORDINATOR: '/dashboard',
  ADMINISTRATOR: '/admin',
}
