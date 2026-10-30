import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const page = (file: string) => new URL(file, import.meta.url).pathname

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    open: true
  },
  build: {
    outDir: 'build',
    rollupOptions: {
      // The dashboard, plus the LAN camera pages: one for the camera computer, one for OBS browser sources.
      input: {
        main: page('./index.html'),
        camera: page('./camera.html'),
        cameraReceiver: page('./camera-receiver.html'),
      }
    }
  }
})
