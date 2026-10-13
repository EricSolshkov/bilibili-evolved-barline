// Use the official builder with a single, non-interactive component entry.
import { copyFileSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
const framework = resolve(process.argv[2] || '.build-framework')
const target = join(framework, 'registry/lib/components/video/barline')
mkdirSync(target, { recursive: true })
for (const name of readdirSync('.')) {
  if (/\.(ts|vue|scss|svg|md)$/.test(name)) copyFileSync(name, join(target, name))
}
writeFileSync(join(framework, 'registry/webpack/barline-ci.ts'), `
import { buildByEntry } from './config'
export default buildByEntry({
  src: './registry/lib/components/', type: 'component',
  entry: './registry/lib/components/video/barline/index.ts',
})
`)
