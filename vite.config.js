import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Hardening: los console.log / console.debug se eliminan del build de
  // producción (en dev siguen). Evita que queden datos de clientes o del
  // comprobante en la consola del navegador. console.warn / console.error
  // se conservan para diagnosticar.
  esbuild: {
    pure: ['console.log', 'console.debug'],
  },
})
