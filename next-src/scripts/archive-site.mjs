// Preserve the committed static site before replacing its design.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '../..');
const dest = path.join(root, 'next-src/public/old');
if (existsSync(path.join(dest, 'index.html'))) throw new Error('Archive already exists; refusing to overwrite it.');
const files = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).trim().split('\n');
const excluded = ['next-src/', 'backend/', '.github/', 'integrations/'];
for (const name of files) {
  if (excluded.some(p => name.startsWith(p)) || !/\.(html|txt|js|css|json|svg|png|webp|ico|woff2?|jpg|jpeg)$/.test(name)) continue;
  const output = path.join(dest, name);
  mkdirSync(path.dirname(output), { recursive: true });
  let data = readFileSync(path.join(root, name));
  if (/\.(html|txt|js|css|json)$/.test(name)) {
    let text = data.toString();
    // Preserve JS operators and route parsing. Only rewrite known asset roots.
    text = text.replace(/\/(?:_next|assets|inspect-viewer)\//g, '/old$&');
    if (name.endsWith('.html')) {
      text = text.replace(/(href|src)="\/(?!\/|old\/)/g, '$1="/old/');
      // Client hydration can restore original hrefs; keep archived navigation local.
      text = text.replace('</head>', `<script>document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a');if(!a)return;var u=new URL(a.href,location.href);if(u.origin===location.origin&&!u.pathname.startsWith('/old/')){e.preventDefault();location.href='/old'+u.pathname+u.search+u.hash;}},true);</script></head>`);
    }
    data = Buffer.from(text);
  }
  writeFileSync(output, data);
}
console.log('Archived published site at next-src/public/old/');
