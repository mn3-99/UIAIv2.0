import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import {visualizer} from 'rollup-plugin-visualizer';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      // Bundle analysis — only when explicitly requested (ANALYZE=1 npm run build).
      process.env.ANALYZE &&
        visualizer({
          filename: 'dist/stats.html',
          template: 'treemap',
          gzipSize: true,
          brotliSize: true,
        }),
    ].filter(Boolean),
    resolve: {
      alias: [
        {find: '@', replacement: path.resolve(__dirname, '.')},
        // Force ONE katex build (ESM). Our static import resolves katex.mjs while
        // mermaid's lazy `import("katex")` resolves the CJS katex.js — without
        // this both copies (≈261KB each) end up in the bundle. Exact match only
        // so `katex/dist/katex.min.css` stays untouched.
        {find: /^katex$/, replacement: path.resolve(__dirname, 'node_modules/katex/dist/katex.mjs')},
      ],
    },
    build: {
      // Split heavy vendor libraries into separately cacheable chunks so the
      // initial JS payload (and thus time-to-interactive) stays small.
      //
      // IMPORTANT: function form (not object form). The object form sweeps each
      // package's *dependencies* into its chunk, which previously: (a) put React
      // itself into vendor-ui (via lucide-react) leaving vendor-react at 3.9KB,
      // and (b) DUPLICATED katex (261KB) because mermaid lazy-imports it while
      // vendor-math claimed the static copy. The function form assigns only the
      // exact module ids, so each library lands in exactly one chunk and
      // mermaid's dynamic import of katex reuses vendor-math.
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return;
            if (/\/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'vendor-react';
            if (id.includes('/node_modules/lucide-react/')) return 'vendor-ui';
            if (/\/node_modules\/(marked|highlight.js|dompurify)\//.test(id)) return 'vendor-markdown';
            if (id.includes('/node_modules/katex/')) return 'vendor-math';
            // mermaid & everything else: let Rollup keep its lazy chunks as-is.
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
