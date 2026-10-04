import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
export default defineConfig({plugins:[svelte()],base:'./',worker:{format:'es'},build:{rollupOptions:{input:{main:'index.html',builder:'build-harness/index.html'}}}});
