import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Shim de process completo para paquetes legacy
      process: 'process/browser',
    },
  },

  define: {
    // Evita crashes por lecturas a process.env en el navegador
    'process.env': {},
    // Algunos paquetes esperan global
    global: 'window',
  },

  // 🔴 CLAVE PARA SALIR DEL BUCLE
  build: {
    sourcemap: true,
  },
})
