import {mkdir, readFile, readdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(root, 'assets', 'js', 'page-scripts');
const pendingWrites = [];
await mkdir(outputDirectory, {recursive: true});

for (const page of (await readdir(root)).filter(file => file.endsWith('.html'))) {
  const file = path.join(root, page);
  let html = await readFile(file, 'utf8');
  let index = 0;
  html = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi, (script, attributes, body) => {
    if (/\bsrc\s*=|application\/(?:ld\+json|json)|importmap/i.test(attributes) || !body.trim()) return script;
    const type = attributes.match(/\btype=["']([^"']+)["']/i)?.[1] || '';
    if (type && !/^(?:text\/javascript|application\/javascript|module)$/i.test(type)) return script;

    const filename = `${path.basename(page, '.html')}-${++index}.js`;
    const target = path.join(outputDirectory, filename);
    const contents = type.toLowerCase() === 'module'
      ? body.replace(/(["'])\.\/assets\//g, '$1/assets/')
      : body;
    pendingWrites.push(writeFile(target, contents.trimStart()));
    const moduleType = type.toLowerCase() === 'module' ? ' type="module"' : '';
    return `<script${moduleType} src="/assets/js/page-scripts/${filename}"></script>`;
  });
  if (index) {
    await writeFile(file, html);
    console.log(`${page}: externalized ${index} inline script${index === 1 ? '' : 's'}.`);
  }
}

await Promise.all(pendingWrites);
