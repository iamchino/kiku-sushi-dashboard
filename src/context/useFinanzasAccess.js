import { useContext } from 'react'
import { FinanzasAccessContext } from './role'

export function useFinanzasAccess() {
  return useContext(FinanzasAccessContext)
}
