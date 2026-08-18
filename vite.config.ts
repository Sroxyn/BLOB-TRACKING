import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // Göreli yol: dist/ hem kök alan adında hem de alt klasörde (GitHub Pages
  // proje sayfası gibi) aynı şekilde çalışsın.
  base: './',
  plugins: [react(), tailwindcss()],
  worker: { format: 'es' },
})
