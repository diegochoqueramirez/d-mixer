import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig({
  base: '/d-mixer/',
  // HTTPS in dev so a phone on the local network gets a secure context (crypto.randomUUID, etc.)
  plugins: [basicSsl()],
});
