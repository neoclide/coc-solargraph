const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { readFileSync } = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const test = require('node:test')
const { transformSync } = require('esbuild')

const sourcePath = path.resolve(__dirname, '../../src/solargraph.ts')
const compiledSource = transformSync(readFileSync(sourcePath, 'utf8'), {
  loader: 'ts',
  format: 'cjs',
  target: 'node18',
  sourcefile: sourcePath
}).code

function fakeChild() {
  const child = new EventEmitter()
  for (const name of ['stdout', 'stderr']) {
    child[name] = new EventEmitter()
    child[name].resumeCalls = 0
    child[name].resume = function () {
      this.resumeCalls++
      return this
    }
  }
  return child
}

function loadHelpers(spawnImplementation) {
  const child = fakeChild()
  const calls = []
  const sourceModule = new Module(sourcePath, module)
  sourceModule.filename = sourcePath
  sourceModule.paths = Module._nodeModulePaths(path.dirname(sourcePath))
  sourceModule.require = function (specifier) {
    if (specifier === 'ruby-spawn') {
      return {
        rubySpawn(...args) {
          calls.push(args)
          return spawnImplementation ? spawnImplementation(...args) : child
        }
      }
    }
    return Module.prototype.require.call(this, specifier)
  }
  sourceModule._compile(compiledSource, sourcePath)
  return { ...sourceModule.exports, calls, child }
}

test('Configuration preserves the public defaults and writable fields', () => {
  const { Configuration } = loadHelpers()
  const configuration = new Configuration()
  const defaults = {
    workspace: null,
    useBundler: false,
    bundlerPath: 'bundle',
    commandPath: 'solargraph',
    viewsPath: null,
    withSnippets: false,
    shell: null
  }
  for (const [name, value] of Object.entries(defaults)) {
    assert.equal(configuration[name], value, name)
  }
  const configured = {
    workspace: '/tmp/my workspace',
    useBundler: true,
    bundlerPath: '/opt/my ruby/bundle',
    commandPath: '/opt/my ruby/solargraph',
    viewsPath: '/tmp/my views',
    withSnippets: true,
    shell: '/bin/zsh'
  }
  Object.assign(configuration, configured)
  for (const [name, value] of Object.entries(configured)) {
    assert.equal(configuration[name], value, name)
  }
})

test('solargraphCommand passes arguments unchanged and enables force-kill', () => {
  const { Configuration, solargraphCommand, calls, child } = loadHelpers()
  const args = Object.freeze(['stdio', '--flag', 'a path with spaces', '$(literal)'])
  assert.equal(solargraphCommand(args, new Configuration()), child)
  assert.deepEqual(calls, [['solargraph', [...args], {}, true]])
  assert.deepEqual(args, ['stdio', '--flag', 'a path with spaces', '$(literal)'])
})

test('solargraphCommand preserves custom command paths, workspace and shell', () => {
  const { Configuration, solargraphCommand, calls } = loadHelpers()
  const configuration = Object.assign(new Configuration(), {
    commandPath: '/opt/my ruby/bin/solargraph',
    workspace: '/tmp/my workspace',
    shell: '/opt/my shell/bin/zsh'
  })
  solargraphCommand(['stdio'], configuration)
  assert.deepEqual(calls, [[
    '/opt/my ruby/bin/solargraph',
    ['stdio'],
    { cwd: '/tmp/my workspace', shell: '/opt/my shell/bin/zsh' },
    true
  ]])
})

test('solargraphCommand uses the configured bundler only with a workspace', () => {
  const { Configuration, solargraphCommand, calls } = loadHelpers()
  const configuration = Object.assign(new Configuration(), {
    useBundler: true,
    workspace: '/tmp/my workspace',
    bundlerPath: '/opt/my ruby/bin/bundle',
    commandPath: '/ignored/solargraph',
    shell: '/bin/zsh'
  })
  const args = Object.freeze(['socket', '--port', '0'])
  solargraphCommand(args, configuration)
  assert.deepEqual(calls, [[
    '/opt/my ruby/bin/bundle',
    ['exec', 'solargraph', ...args],
    { cwd: '/tmp/my workspace', shell: '/bin/zsh' },
    true
  ]])
  assert.deepEqual(args, ['socket', '--port', '0'])
})

test('solargraphCommand ignores bundler without a workspace and omits falsey options', () => {
  const { Configuration, solargraphCommand, calls } = loadHelpers()
  const configuration = Object.assign(new Configuration(), {
    useBundler: true,
    bundlerPath: '/ignored/bundle',
    commandPath: '/custom/solargraph',
    workspace: '',
    shell: ''
  })
  solargraphCommand([], configuration)
  assert.deepEqual(calls, [['/custom/solargraph', [], {}, true]])
})

test('installGem drains both streams and resolves true on successful exit', async () => {
  const { Configuration, installGem, calls, child } = loadHelpers()
  const installed = installGem(new Configuration())
  assert.deepEqual(calls, [['gem', ['install', 'solargraph'], {}, true]])
  assert.equal(child.stdout.resumeCalls, 1)
  assert.equal(child.stderr.resumeCalls, 1)
  child.emit('exit', 0, null)
  assert.equal(await installed, true)
})

test('installGem preserves bundler, workspace and shell options', async () => {
  const { Configuration, installGem, calls, child } = loadHelpers()
  const configuration = Object.assign(new Configuration(), {
    useBundler: true,
    workspace: '/tmp/my workspace',
    bundlerPath: '/opt/my ruby/bin/bundle',
    commandPath: '/ignored/solargraph',
    shell: '/bin/zsh'
  })
  const installed = installGem(configuration)
  assert.deepEqual(calls, [[
    '/opt/my ruby/bin/bundle',
    ['exec', 'gem', 'install', 'solargraph'],
    { cwd: '/tmp/my workspace', shell: '/bin/zsh' },
    true
  ]])
  child.emit('exit', 0, null)
  assert.equal(await installed, true)
})

test('installGem does not use bundler without a workspace', async () => {
  const { Configuration, installGem, calls, child } = loadHelpers()
  const configuration = Object.assign(new Configuration(), { useBundler: true })
  const installed = installGem(configuration)
  assert.deepEqual(calls, [['gem', ['install', 'solargraph'], {}, true]])
  child.emit('exit', 0, null)
  assert.equal(await installed, true)
})

test('installGem rejects an Error for a nonzero exit code', async () => {
  const { Configuration, installGem, child } = loadHelpers()
  const rejected = assert.rejects(installGem(new Configuration()), Error)
  child.emit('exit', 1, null)
  await rejected
})

test('installGem rejects an Error when terminated by a signal', async () => {
  const { Configuration, installGem, child } = loadHelpers()
  const rejected = assert.rejects(installGem(new Configuration()), Error)
  child.emit('exit', null, 'SIGTERM')
  await rejected
})

test('installGem rejects the original child-process error', async () => {
  const { Configuration, installGem, child } = loadHelpers()
  const error = new Error('gem executable could not be spawned')
  const rejected = assert.rejects(installGem(new Configuration()), actual => actual === error)
  child.emit('error', error)
  await rejected
})

test('installGem converts synchronous spawn failure into promise rejection', async () => {
  const error = new Error('invalid spawn options')
  const { Configuration, installGem } = loadHelpers(() => { throw error })
  await assert.rejects(installGem(new Configuration()), actual => actual === error)
})

test('SocketProvider starts the configured socket command and exposes its port', async t => {
  const logged = []
  t.mock.method(console, 'log', value => logged.push(value))
  const { Configuration, SocketProvider, calls, child } = loadHelpers()
  const configuration = Object.assign(new Configuration(), {
    useBundler: true,
    workspace: '/tmp/project',
    bundlerPath: '/custom/bundle',
    shell: '/bin/zsh'
  })
  const provider = new SocketProvider(configuration)
  const started = provider.start()
  assert.deepEqual(calls, [[
    '/custom/bundle',
    ['exec', 'solargraph', 'socket', '--port', '0'],
    { cwd: '/tmp/project', shell: '/bin/zsh' },
    true
  ]])
  child.stderr.emit('data', Buffer.from('Solargraph is ready PORT=54321 PID=123\n'))
  assert.equal(await started, undefined)
  assert.equal(provider.port, 54321)
  assert.deepEqual(logged, ['Solargraph is ready PORT=54321 PID=123\n'])
})

test('SocketProvider waits for a complete announcement across stderr chunks', async t => {
  t.mock.method(console, 'log', () => {})
  const { Configuration, SocketProvider, child } = loadHelpers()
  const provider = new SocketProvider(new Configuration())
  let listening = false
  const started = provider.start().then(() => { listening = true })
  for (const chunk of ['Starting server\nPO', 'RT=52', '345\tPI', 'D=']) {
    child.stderr.emit('data', Buffer.from(chunk))
    await Promise.resolve()
    assert.equal(listening, false)
  }
  child.stderr.emit('data', Buffer.from('123\n'))
  await started
  assert.equal(provider.port, 52345)
})

test('SocketProvider does not accept announcements with an empty port or PID', async t => {
  t.mock.method(console, 'log', () => {})
  const { Configuration, SocketProvider, child } = loadHelpers()
  const provider = new SocketProvider(new Configuration())
  let listening = false
  const started = provider.start().then(() => { listening = true })
  child.stderr.emit('data', Buffer.from('PORT= PID=123\nPORT=456 PID=\n'))
  await Promise.resolve()
  assert.equal(listening, false)
  child.stderr.emit('data', Buffer.from('PORT=54321   PID=123\n'))
  await started
  assert.equal(provider.port, 54321)
})

test('SocketProvider rejects the original child error before listening', async () => {
  const { Configuration, SocketProvider, child } = loadHelpers()
  const error = new Error('solargraph executable not found')
  const provider = new SocketProvider(new Configuration())
  const rejected = assert.rejects(provider.start(), actual => actual === error)
  child.emit('error', error)
  await rejected
})

test('SocketProvider converts synchronous spawn failure into promise rejection', async () => {
  const error = new Error('socket spawn failed')
  const { Configuration, SocketProvider } = loadHelpers(() => { throw error })
  const provider = new SocketProvider(new Configuration())
  await assert.rejects(provider.start(), actual => actual === error)
})

test('SocketProvider rejects early exit and preserves stderr diagnostics', async t => {
  t.mock.method(console, 'log', () => {})
  const { Configuration, SocketProvider, child } = loadHelpers()
  const provider = new SocketProvider(new Configuration())
  const rejected = assert.rejects(provider.start(), error => {
    assert.match(String(error), /bad Ruby environment/)
    return true
  })
  child.stderr.emit('data', Buffer.from('bad Ruby environment\n'))
  child.emit('exit', 1, null)
  await rejected
})

test('SocketProvider rejects even a clean exit if no port was announced', async () => {
  const { Configuration, SocketProvider, child } = loadHelpers()
  const provider = new SocketProvider(new Configuration())
  const rejected = assert.rejects(provider.start())
  child.emit('exit', 0, null)
  await rejected
})
