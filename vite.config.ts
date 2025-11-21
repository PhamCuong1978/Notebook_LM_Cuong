import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load environment variables based on the current mode (development/production)
  // The third argument '' loads all variables, but we specifically look for VITE_API_KEY
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    define: {
      // This replaces 'process.env.API_KEY' in your code with the actual string value of VITE_API_KEY during build.
      // If VITE_API_KEY is missing, it defaults to an empty string to avoid "process is not defined" crashes.
      'process.env.API_KEY': JSON.stringify(env.VITE_API_KEY || ''),
    },
  };
});