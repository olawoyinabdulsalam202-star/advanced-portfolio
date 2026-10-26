import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
await mkdir('public/assets', {recursive:true});
await build({entryPoints:['src/main.jsx'],bundle:true,minify:true,outdir:'public/assets',entryNames:'app',loader:{'.png':'file'},external:['/fonts/*'],define:{'process.env.NODE_ENV':'"production"'},target:['es2022'],sourcemap:false,legalComments:'eof'});
console.log('React production build complete.');
