import { createContext } from 'react'

// El contexto va en su propio módulo (sin JSX) por la convención del repo y
// para que el fast refresh de Vite funcione, igual que role.js / useRole.js.
export const PermisosContext = createContext(null)
