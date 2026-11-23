import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath, URL } from "node:url";
import { readFileSync } from "node:fs";

// Politique de sécurité du contenu, ajoutée au build uniquement (le serveur de dev a besoin de scripts en ligne).
// Seuls axta et l'API de taux de change sont joignables.
const CSP = [
  "default-src 'self'", "script-src 'self'", "connect-src 'self' https://open.er-api.com",
  "img-src 'self' data: blob:", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", "font-src 'self' https://fonts.gstatic.com",
  "worker-src 'self' blob:", "object-src 'none'", "base-uri 'self'", "form-action 'none'",
].join("; ");
const csp = { name: "axta-csp", apply: "build" as const, transformIndexHtml: (html: string) => html.replace("<head>", `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`) };

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

export default defineConfig({
  base: "./",
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  // Port dédié : axta ne partage pas son adresse (cache, favicon, données du navigateur) avec d'autres projets Vite.
  server: { port: 5190, strictPort: true },
  preview: { port: 4190, strictPort: true },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  plugins: [
    react(),
    csp,
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "logo.svg"],
      manifest: {
        name: "axta",
        short_name: "axta",
        description: "Pilotage de vie local-first : argent, objectifs, travail, famille.",
        lang: "fr",
        theme_color: "#18181B",
        background_color: "#F4F4F5",
        display: "standalone",
        icons: [{ src: "favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }]
      },
      workbox: { globPatterns: ["**/*.{js,mjs,css,html,svg,webmanifest}"], maximumFileSizeToCacheInBytes: 3 * 1024 * 1024 }
    })
  ],
  build: { rollupOptions: { output: { manualChunks: { react: ["react", "react-dom", "react-router-dom"], motion: ["motion"], dexie: ["dexie", "dexie-react-hooks"], charts: ["recharts"] } } } },
  test: { environment: "node", include: ["src/**/*.test.ts"] }
} as never);
