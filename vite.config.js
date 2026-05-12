import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: 'localhost',
    /** Avoid clashing with other Vite apps on the default :5173. */
    port: 5190,
    strictPort: true,
  },
});
