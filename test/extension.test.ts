import assert from 'node:assert/strict'
import net from 'node:net'
import path from 'node:path'
import { describe, it } from 'node:test'
import { commands, services, Uri, window, workspace, type Document, type LanguageClient } from 'coc.nvim'

const commandNames = [
  'solargraph.search',
  'solargraph.restart',
  'solargraph.config',
  'solargraph.checkGemVersion',
  'solargraph.downloadCore',
  'solargraph.buildGemDocs',
  'solargraph.rebuildAllGemDocs',
  'solargraph.environment'
]

describe('coc-solargraph integration', { concurrency: false }, () => {
  it('starts the real Solargraph stdio server and registers every command', async () => {
    const client = await waitForClientStarted()
    assert.equal(client.started, true)

    for (const command of commandNames) {
      assert.equal(commands.has(command), true, `missing command: ${command}`)
    }
  })

  it('uses deterministic settings for the real Solargraph server', () => {
    const config = workspace.getConfiguration('solargraph')
    assert.equal(config.get('transport'), 'stdio')
    assert.deepEqual(config.get('externalServer'), { host: '127.0.0.1', port: 7658 })
    assert.equal(config.get('commandPath'), 'solargraph')
    assert.equal(config.get('useBundler'), false)
    assert.equal(config.get('checkGemVersion'), false)
    assert.equal(config.get('diagnostics'), false)
    assert.equal(config.get('symbols'), true)
    assert.equal(config.get('logLevel'), 'warn')
  })

  it('returns symbols for a Ruby document through the real language server', async () => {
    const client = await waitForClientStarted()
    const uri = Uri.file(path.join(workspace.rootPath!, 'test', 'fixtures', 'sample.rb')).toString()
    const doc = await openDocument(uri)
    assert.equal(doc.filetype, 'ruby')

    const symbols = await waitForDocumentSymbols(client, uri)
    assert.ok(symbols.some(symbol => symbol.name === 'Greeter'))
    assert.ok(symbols.some(symbol => symbol.name === 'greet' && symbol.containerName === 'Greeter'))
  })

  it('opens environment documentation returned by the real language server', async () => {
    await commands.executeCommand('solargraph.environment')

    const uri = Uri.parse('solargraph:///environment').toString()
    const doc = await waitForDocument(uri)
    assert.match(doc.getDocumentContent(), /Solargraph Environment Info/)
    assert.match(doc.getDocumentContent(), /Solargraph Version/)
    assert.equal(doc.filetype, 'markdown')
  })

  it('searches documentation using editor input', async () => {
    const originalCall = workspace.nvim.call
    const originalOpenResource = workspace.openResource
    let requestedInput = false
    let openedUri: string | undefined
    ;(workspace.nvim as any).call = (method: string, args: unknown[], notify?: boolean): unknown => {
      if (method === 'input') {
        requestedInput = true
        assert.equal(Array.isArray(args), true)
        assert.equal(args[0], 'Search:')
        assert.equal(args[1], '')
        return Promise.resolve().then(() => {
          ;(workspace.nvim as any).call = originalCall
          return 'String'
        })
      }
      return originalCall.call(workspace.nvim, method, args, notify)
    }
    ;(workspace as any).openResource = async (uri: string): Promise<void> => {
      openedUri = uri
    }

    try {
      await commands.executeCommand('solargraph.search')
    } finally {
      ;(workspace.nvim as any).call = originalCall
      ;(workspace as any).openResource = originalOpenResource
    }
    assert.equal(requestedInput, true)
    assert.equal(openedUri, 'solargraph:///search?query=String')

    const result = await getClient().sendRequest<{ content: string }>('$/solargraph/search', { query: 'String' })
    assert.match(result.content, /String/i)
  })

  it('restarts the real language server and preserves the document provider', async () => {
    const originalClient = await waitForClientStarted()
    const environmentUri = Uri.parse('solargraph:///environment').toString()
    const originalDocument = await waitForDocument(environmentUri)
    const originalContent = originalDocument.getDocumentContent()

    await commands.executeCommand('solargraph.restart')

    const restarted = await waitForDifferentClient(originalClient)
    assert.notEqual(restarted, originalClient)
    assert.equal(restarted.started, true)

    const currentDocument = await waitForDocument(environmentUri)
    assert.equal(currentDocument.getDocumentContent(), originalContent)
    assert.equal(currentDocument.filetype, 'markdown')
  })

  it('retries an external connection and handles a server restart notification', async () => {
    const config = workspace.getConfiguration('solargraph')
    const originalTransport = config.get<string>('transport')
    const originalExternalServer = config.get<{ host: string, port: number }>('externalServer')
    const originalShowWarningMessage = window.showWarningMessage
    const server = new TestLanguageServer()
    const port = await reservePort()
    let warningCount = 0

    try {
      await config.update('transport', 'external', true)
      await config.update('externalServer', { host: '127.0.0.1', port }, true)
      ;(window as any).showWarningMessage = async (message: string, item: string): Promise<string> => {
        warningCount++
        assert.match(message, /Failed to connect to the external language client/)
        assert.equal(item, 'Try again')
        await server.listen(port)
        return item
      }

      const stdioClient = getClient()
      await commands.executeCommand('solargraph.restart')
      await waitForValue(() => warningCount, 1, 'external connection warning')
      await waitForConnectionCount(server, 1)
      const externalClient = await waitForDifferentClient(stdioClient)
      assert.equal(warningCount, 1)
      assert.equal(server.connectionCount, 1)

      server.sendNotification('$/solargraph/restart')
      await waitForConnectionCount(server, 2)
      const restartedClient = await waitForDifferentClient(externalClient)
      assert.equal(restartedClient.started, true)
    } finally {
      ;(window as any).showWarningMessage = originalShowWarningMessage
      await config.update('transport', originalTransport, true)
      await config.update('externalServer', originalExternalServer, true)
      const currentClient = getClient()
      await commands.executeCommand('solargraph.restart')
      await waitForDifferentClient(currentClient)
      await server.close()
    }
  })
})

class TestLanguageServer {
  private server = net.createServer(socket => this.accept(socket))
  private sockets = new Set<net.Socket>()
  public connectionCount = 0

  public async listen(port: number): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.server.once('error', reject)
      this.server.listen(port, '127.0.0.1', () => {
        this.server.removeListener('error', reject)
        resolve()
      })
    })
  }

  public sendNotification(method: string): void {
    const socket = Array.from(this.sockets).at(-1)
    assert.ok(socket)
    this.write(socket, { jsonrpc: '2.0', method })
  }

  public async close(): Promise<void> {
    for (const socket of this.sockets) socket.destroy()
    if (!this.server.listening) return
    await new Promise<void>((resolve, reject) => {
      this.server.close(error => error ? reject(error) : resolve())
    })
  }

  private accept(socket: net.Socket): void {
    this.connectionCount++
    this.sockets.add(socket)
    socket.on('close', () => this.sockets.delete(socket))
    let buffered = Buffer.alloc(0)
    socket.on('data', chunk => {
      buffered = Buffer.concat([buffered, chunk])
      while (true) {
        const headerEnd = buffered.indexOf('\r\n\r\n')
        if (headerEnd === -1) return
        const header = buffered.subarray(0, headerEnd).toString()
        const match = /Content-Length: (\d+)/i.exec(header)
        assert.ok(match)
        const contentLength = Number(match[1])
        const messageEnd = headerEnd + 4 + contentLength
        if (buffered.length < messageEnd) return
        const message = JSON.parse(buffered.subarray(headerEnd + 4, messageEnd).toString())
        buffered = buffered.subarray(messageEnd)
        if (message.id == null) continue
        const result = message.method === 'initialize' ? { capabilities: {} } : null
        this.write(socket, { jsonrpc: '2.0', id: message.id, result })
      }
    })
  }

  private write(socket: net.Socket, message: object): void {
    const content = JSON.stringify(message)
    socket.write(`Content-Length: ${Buffer.byteLength(content)}\r\n\r\n${content}`)
  }
}

function getClient(): LanguageClient {
  const service = services.getService('solargraph')
  assert.ok(service)
  assert.ok(service.client)
  return service.client
}

async function waitForClientStarted(timeoutMs = 30000): Promise<LanguageClient> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const client = getClient()
    if (client.started) return client
    await delay(100)
  }
  throw new Error('Solargraph language client did not start in time')
}

async function waitForDifferentClient(original: LanguageClient, timeoutMs = 30000): Promise<LanguageClient> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const client = getClient()
    if (client !== original && client.started) return client
    await delay(100)
  }
  throw new Error('Solargraph language client did not restart in time')
}

async function waitForDocumentSymbols(client: LanguageClient, uri: string, timeoutMs = 30000): Promise<any[]> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try {
      const symbols = await client.sendRequest<any[]>('textDocument/documentSymbol', {
        textDocument: { uri }
      })
      if (symbols.some(symbol => symbol.name === 'Greeter')) return symbols
    } catch (_error) {
      // Coc can open the buffer before its didOpen notification reaches Solargraph.
    }
    await delay(200)
  }
  throw new Error('Solargraph did not return document symbols in time')
}

async function openDocument(uri: string): Promise<Document> {
  const existing = workspace.getDocument(uri)
  if (existing) return existing

  let opened = false
  const disposable = workspace.onDidOpenTextDocument(document => {
    if (document.uri === uri) opened = true
  })
  try {
    await workspace.openResource(uri)
    const started = Date.now()
    while (!opened && Date.now() - started < 5000) {
      await delay(50)
    }
    if (!opened) throw new Error(`didOpen event did not arrive in time: ${uri}`)
  } finally {
    disposable.dispose()
  }
  return waitForDocument(uri)
}

async function waitForDocument(uri: string, timeoutMs = 30000): Promise<Document> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const doc = workspace.getDocument(uri)
    if (doc) return doc
    await delay(100)
  }
  throw new Error(`document did not open in time: ${uri}`)
}

async function reservePort(): Promise<number> {
  const server = net.createServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  return address.port
}

async function waitForConnectionCount(server: TestLanguageServer, expected: number, timeoutMs = 5000): Promise<void> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (server.connectionCount >= expected) return
    await delay(20)
  }
  throw new Error(`language server did not receive ${expected} connections in time`)
}

async function waitForValue(read: () => number, expected: number, description: string, timeoutMs = 5000): Promise<void> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (read() >= expected) return
    await delay(20)
  }
  throw new Error(`${description} did not reach ${expected} in time`)
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
