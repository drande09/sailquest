const { build } = require('esbuild');
const fs = require('node:fs/promises');
const path = require('node:path');

async function main() {
  const root = path.resolve(__dirname, '..');
  await build({ entryPoints: [path.join(root, 'src/scene3d.js')], bundle: true,
    outfile: path.join(root, 'js/scene3d.bundle.js'), format: 'iife', minify: true,
    target: ['es2020'], legalComments: 'eof' });
  const out = path.join(root, 'dist');
  await fs.mkdir(out, { recursive: true });
  for (const file of ['index.html', 'style.css', 'js', 'THIRD_PARTY_LICENSES.txt']) {
    await fs.cp(path.join(root, file), path.join(out, file), { recursive: true });
  }
  console.log('Built SailQuest in dist/ (also ready to serve from the repository root).');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
