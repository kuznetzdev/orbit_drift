#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const indexPath = path.join(root, 'index.html');
const distDir = path.join(root, 'dist');
const outPath = path.join(distDir, 'orbit-drift-standalone.html');

const html = fs.readFileSync(indexPath, 'utf8');
const css = fs.readFileSync(path.join(root, 'src', 'styles', 'main.css'), 'utf8');
const scripts = [...html.matchAll(/<script\s+defer\s+src="([^"]+)"\s*><\/script>/g)].map(m => m[1]);

let built = html;
built = built.replace(/<link rel="stylesheet" href="src\/styles\/main\.css" \/>/, `<style>\n${css}\n</style>`);

const scriptBlock = scripts.map(src => {
  const filePath = path.join(root, src);
  const code = fs.readFileSync(filePath, 'utf8');
  return `/* ${src} */\n${code}`;
}).join('\n\n');

built = built.replace(/\s*<script defer src="src\/js\/[^"]+"><\/script>/g, '');
built = built.replace('</body>', `  <script>\n${scriptBlock}\n  </script>\n</body>`);

fs.mkdirSync(distDir, { recursive: true });
fs.writeFileSync(outPath, built);
console.log(`build: ${path.relative(root, outPath)}`);
