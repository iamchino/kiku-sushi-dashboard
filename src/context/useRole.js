import { useContext } from 'react'
import { RoleContext } from './role'

export function useRole() {
  return useContext(RoleContext)
}
