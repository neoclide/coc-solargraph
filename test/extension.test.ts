import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, describe, it } from 'node:test'
import { commands, services, Uri, workspace, type Document, type LanguageClient } from 'coc.nvim'

interface ServerEvent {
  type: string
  pid: number
  argv: string[]
  cwd: string
  method?: string
  params?: any
}

const logFile = path.join(os.tmpdir(), `coc-solargraph-test-${process.pid}.jsonl`)

after(() => {
  fs.rmSync(logFile, { force: true })
})

describe('coc-solargraph integration', { concurrency: false }, () => {
  it('starts the configured stdio server and registers every command', async () => {
    const client = await waitForClientStarted()
    assert.equal(client.started, true)

    const started = await waitForEvent(event => event.type === 'start')
    assert.equal(started.argv[0], 'stdio')
    assert.equal(path.resolve(started.cwd), path.resolve(workspace.rootPath!))

    for (const command of [
      'solargraph.search',
      'solargraph.restart',
      'solargraph.config',
      'solargraph.checkGemVersion',
      'solargraph.downloadCore',
      'solargraph.buildGemDocs',
      'solargraph.rebuildAllGemDocs',
      'solargraph.environment'
    ]) {
      assert.equal(commands.has(command), true, `missing command: ${command}`)
    }
  })

  it('applies configuration defaults and sends non-default settings to the server', async () => {
    const config = workspace.getConfiguration('solargraph')
    assert.equal(config.get('trace.server'), 'off')
    assert.ok(config.get('shell') == null)
    assert.equal(config.get('transport'), 'stdio')
    assert.equal(config.get('promptDownload'), true)
    assert.equal(config.get('commandPath'), '${workspaceFolder}/test/fixtures/solargraph')
    assert.equal(config.get('useBundler'), false)
    assert.equal(config.get('bundlerPath'), 'bundle')
    assert.equal(config.get('checkGemVersion'), true)
    assert.equal(config.get('completion'), false)
    assert.equal(config.get('hover'), false)
    assert.equal(config.get('diagnostics'), true)
    assert.equal(config.get('autoformat'), true)
    assert.equal(config.get('formatting'), true)
    assert.equal(config.get('symbols'), false)
    assert.equal(config.get('definitions'), false)
    assert.equal(config.get('rename'), false)
    assert.equal(config.get('references'), false)
    assert.equal(config.get('folding'), false)
    assert.equal(config.get('logLevel'), 'debug')

    const externalServer = config.get<{ host: string, port: number }>('externalServer')
    assert.ok(externalServer)
    assert.equal(externalServer.host, 'localhost')
    assert.equal(externalServer.port, 7658)

    const changed = await waitForEvent(event => event.method === 'workspace/didChangeConfiguration')
    const settings = changed.params.settings.solargraph
    assert.equal(settings.transport, 'stdio')
    assert.equal(settings.completion, false)
    assert.equal(settings.hover, false)
    assert.equal(settings.diagnostics, true)
    assert.equal(settings.autoformat, true)
    assert.equal(settings.formatting, true)
    assert.equal(settings.symbols, false)
    assert.equal(settings.definitions, false)
    assert.equal(settings.rename, false)
    assert.equal(settings.references, false)
    assert.equal(settings.folding, false)
    assert.equal(settings.logLevel, 'debug')

    const check = await waitForEvent(event => event.method === '$/solargraph/checkGemVersion')
    assert.equal(check.params.verbose, false)
  })

  it('opens environment documentation returned by the language server', async () => {
    const offset = readEvents().length
    await commands.executeCommand('solargraph.environment')

    const request = await waitForEvent(event => event.method === '$/solargraph/environment', offset)
    assert.deepEqual(request.params, {})
    const uri = Uri.parse('solargraph:///environment').toString()
    const doc = await waitForDocument(uri)
    assert.match(doc.getDocumentContent(), /Solargraph Test Environment/)
    assert.equal(doc.filetype, 'markdown')
  })

  it('searches documentation using editor input', async () => {
    const offset = readEvents().length
    const execution = commands.executeCommand('solargraph.search')
    await delay(50)
    await workspace.nvim.input('Widget')
    await workspace.nvim.input('<CR>')
    await execution

    const request = await waitForEvent(event => event.method === '$/solargraph/search', offset)
    assert.equal(request.params.query, 'Widget')
    const uri = Uri.parse('solargraph:///search?query=Widget').toString()
    const doc = await waitForDocument(uri)
    assert.match(doc.getDocumentContent(), /Search Widget/)
    assert.equal(doc.filetype, 'markdown')
  })

  it('sends explicit gem-version and core-download notifications', async () => {
    let offset = readEvents().length
    await commands.executeCommand('solargraph.checkGemVersion')
    const check = await waitForEvent(event => event.method === '$/solargraph/checkGemVersion', offset)
    assert.equal(check.params.verbose, true)

    offset = readEvents().length
    await commands.executeCommand('solargraph.downloadCore')
    await waitForEvent(event => event.method === '$/solargraph/downloadCore', offset)
  })

  it('requests incremental and full gem documentation builds', async () => {
    let offset = readEvents().length
    await commands.executeCommand('solargraph.buildGemDocs')
    let request = await waitForEvent(event => event.method === '$/solargraph/documentGems', offset)
    assert.equal(request.params.rebuild, false)

    offset = readEvents().length
    await commands.executeCommand('solargraph.rebuildAllGemDocs')
    request = await waitForEvent(event => event.method === '$/solargraph/documentGems', offset)
    assert.equal(request.params.rebuild, true)
  })

  it('runs the Solargraph configuration command in the workspace', async () => {
    const offset = readEvents().length
    await commands.executeCommand('solargraph.config')
    const event = await waitForEvent(item => item.type === 'command' && item.argv[0] === 'config', offset)
    assert.equal(path.resolve(event.cwd), path.resolve(workspace.rootPath!))
  })

  it('restarts with updated bundler configuration', async () => {
    const config = workspace.getConfiguration('solargraph')
    const originalClient = getClient()
    const originalPid = (await waitForEvent(event => event.type === 'start')).pid
    const offset = readEvents().length
    try {
      await config.update('checkGemVersion', false, true)
      await config.update('useBundler', true, true)
      await config.update('bundlerPath', '${workspaceFolder}/test/fixtures/bundle', true)
      await commands.executeCommand('solargraph.restart')

      const bundler = await waitForEvent(event => event.type === 'bundler', offset)
      assert.deepEqual(bundler.argv.slice(0, 3), ['exec', 'solargraph', 'stdio'])
      await waitForEvent(event => event.type === 'start' && event.pid !== originalPid, offset)
      const restarted = await waitForClientStarted()
      assert.notEqual(restarted, originalClient)
      assert.equal(restarted.started, true)
    } finally {
      await config.update('checkGemVersion', undefined, true)
      await config.update('useBundler', undefined, true)
      await config.update('bundlerPath', undefined, true)
    }
  })
})

function getClient(): LanguageClient {
  const service = services.getService('solargraph')
  assert.ok(service)
  assert.ok(service.client)
  return service.client
}

async function waitForClientStarted(timeoutMs = 15000): Promise<LanguageClient> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const client = getClient()
    if (client.started) return client
    await delay(50)
  }
  throw new Error('Solargraph language client did not start in time')
}

function readEvents(): ServerEvent[] {
  if (!fs.existsSync(logFile)) return []
  return fs.readFileSync(logFile, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => JSON.parse(line) as ServerEvent)
}

async function waitForEvent(predicate: (event: ServerEvent) => boolean, offset = 0, timeoutMs = 10000): Promise<ServerEvent> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const event = readEvents().slice(offset).find(predicate)
    if (event) return event
    await delay(50)
  }
  throw new Error(`Solargraph event did not arrive in time: ${JSON.stringify(readEvents().slice(offset))}`)
}

async function waitForDocument(uri: string, timeoutMs = 10000): Promise<Document> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const doc = workspace.getDocument(uri)
    if (doc) return doc
    await delay(50)
  }
  throw new Error(`document did not open in time: ${uri}`)
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
