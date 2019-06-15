import { Middleware, LanguageClient, LanguageClientOptions, ServerOptions, workspace, ProvideCompletionItemsSignature, ProviderResult } from 'coc.nvim'
import { TextDocument, Position, CompletionItem, CompletionList } from 'vscode-languageserver-types'
import { CompletionContext, CancellationToken, MarkedString } from 'vscode-languageserver-protocol'
import * as solargraph from 'solargraph-utils'
import net from 'net'

// export function makeLanguageClient(socketProvider: solargraph.SocketProvider): LanguageClient {
export function makeLanguageClient(configuration: solargraph.Configuration): LanguageClient {
  let prepareStatus = workspace.createStatusBarItem(10, { progress: true })
  prepareStatus.show()

  let middleware: Middleware = {
    // fix completeItem
    provideCompletionItem: (
      document: TextDocument,
      position: Position,
      context: CompletionContext,
      token: CancellationToken,
      next: ProvideCompletionItemsSignature
    ): ProviderResult<CompletionItem[] | CompletionList> => {
      return Promise.resolve(next(document, position, context, token)).then((res: CompletionItem[] | CompletionList) => {
        let doc = workspace.getDocument(document.uri)
        if (!doc) return []
        let items: CompletionItem[] = res.hasOwnProperty('isIncomplete') ? (res as CompletionList).items : res as CompletionItem[]
        let result: any = {
          isIncomplete: false,
          items
        }
        if (items.length
          && items.every(o => o.label.startsWith(':'))) {
          result.startcol = doc.fixStartcol(position, [':'])
        }
        return result
      })
    }
  }

  // Options to control the language client
  let clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: 'file', language: 'ruby' }, { scheme: 'file', pattern: '**/Gemfile' }],
    synchronize: {
      // Synchronize the setting section 'solargraph' to the server
      configurationSection: 'solargraph',
      // Notify the server about changes to relevant files in the workspace
      fileEvents: workspace.createFileSystemWatcher('{**/*.rb,**/*.gemspec,**/Gemfile}')
    },
    middleware,
    initializationOptions: {
      enablePages: true,
      viewsPath: configuration.viewsPath
    }
  }

  let selectClient = (): ServerOptions => {
    let transport = workspace.getConfiguration('solargraph').transport
    if (transport == 'stdio') {
      return () => {
        return new Promise(resolve => {
          let child = solargraph.commands.solargraphCommand(['stdio'], configuration)
          child.stderr.on('data', (data: Buffer) => {
            // tslint:disable-next-line: no-console
            console.log(data.toString())
          })
          child.on('exit', (code, signal) => {
            // tslint:disable-next-line: no-console
            console.error('Solargraph exited with code', code, signal)
          })
          resolve(child)
        })
      }
    } else if (transport == 'socket') {
      return () => {
        return new Promise((resolve, reject) => {
          let socketProvider: solargraph.SocketProvider = new solargraph.SocketProvider(configuration)
          socketProvider.start().then(() => {
            let socket: net.Socket = net.createConnection(socketProvider.port)
            resolve({
              reader: socket,
              writer: socket
            })
          }).catch(err => {
            reject(err)
          })
        })
      }
    } else {
      return () => {
        return new Promise(resolve => {
          let socket: net.Socket = net.createConnection({ host: workspace.getConfiguration('solargraph').externalServer.host, port: workspace.getConfiguration('solargraph').externalServer.port })
          resolve({
            reader: socket,
            writer: socket
          })
        })
      }
    }
  }

  let serverOptions: ServerOptions = selectClient()

  let client = new LanguageClient('solargraph', 'Ruby Language Server', serverOptions, clientOptions)
  let interval = setInterval(() => {
    prepareStatus.text = `Starting the Solargraph language server`
  }, 100)
  client.onReady().then(() => {
    clearInterval(interval)
    prepareStatus.dispose()
    workspace.showMessage('Solargraph is ready.', 'more')
    // if (vscode.workspace.getConfiguration('solargraph').checkGemVersion) {
    // 	client.sendNotification('$/solargraph/checkGemVersion')
    // }
  }).catch(() => {
    clearInterval(interval)
    prepareStatus.dispose()
    workspace.showMessage('Solargraph failed to initialize.', 'error')
  })
  return client
}
