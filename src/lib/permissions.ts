import type { Profile } from '../types/models'

export function isAdmin(profile: Profile | null) {
  return profile?.role === 'admin'
}

export function canMutateRecords(profile: Profile | null) {
  return isAdmin(profile)
}

export function canCreateOperationalRecords(profile: Profile | null) {
  return profile?.role === 'admin' || profile?.role === 'employee'
}
