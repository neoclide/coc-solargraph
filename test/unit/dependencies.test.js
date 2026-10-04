const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const { it } = require('node:test')
const esbuild = require('esbuild')

const root = path.resolve(__dirname, '../..')
const removedPackages = /(?:^|\/)node_modules\/(?:axios|solargraph-utils)(?:\/|$)/

it('keeps the removed HTTP dependency out of the full dependency tree', () => {
  const lock = JSON.parse(readFileSync(path.join(root, 'package-lock.json'), 'utf8'))
  for (const [name, metadata] of Object.entries(lock.packages)) {
    assert.doesNotMatch(name, removedPackages)
    for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) {
      for (const dependency of Object.keys(metadata[field] || {})) {
        assert.ok(!['axios', 'solargraph-utils'].includes(dependency), `${name} depends on ${dependency}`)
      }
    }
  }
})

it('bundles the extension without Axios or the unused HTTP server', () => {
  const build = esbuild.buildSync({
    absWorkingDir: root,
    entryPoints: ['src/index.ts'],
    bundle: true,
    platform: 'node',
    target: 'node10.12',
    mainFields: ['module', 'main'],
    external: ['coc.nvim'],
    metafile: true,
    write: false
  })
  for (const input of Object.keys(build.metafile.inputs)) {
    assert.doesNotMatch(input, removedPackages)
  }
  assert.doesNotMatch(build.outputFiles[0].text, /AxiosError|AxiosHeaders|axios\/lib/)
})
