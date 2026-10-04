import { commands, Disposable, ExtensionContext, LanguageClient, services, window, workspace } from 'coc.nvim'
import * as solargraph from './solargraph'
import { makeLanguageClient } from './language-client'
import SolargraphDocumentProvider from './SolargraphDocumentProvider'

function isBare(str: String): boolean {
  return ((str.search(/\//) == -1) && (str.search(/\\/) == -1))
}

export async function activate(context: ExtensionContext): Promise<void> {
  let { subscriptions, logger } = context
  const getConfig = (): any => workspace.getConfiguration().get<any>('solargraph', {}) as any
  const enable = getConfig().enable
  if (enable === false) return

  let applyConfiguration = (_config: solargraph.Configuration) => {
    const config = getConfig()
    if (!config.commandPath) {
      _config.commandPath = 'solargraph'
    } else if (isBare(config.commandPath)) {
      _config.commandPath = config.commandPath
    } else {
      _config.commandPath = workspace.expand(config.commandPath)
    }
    _config.useBundler = config.useBundler || false
    _config.bundlerPath = config.bundlerPath ? workspace.expand(config.bundlerPath) : 'bundle'
    _config.viewsPath = context.asAbsolutePath('views')
    _config.withSnippets = config.withSnippets || false
    _config.workspace = workspace.rootPath || null
    if (config.shell) _config.shell = config.shell
  }
  let solargraphConfiguration = new solargraph.Configuration()
  applyConfiguration(solargraphConfiguration)

  let languageClient: LanguageClient
  let disposableClient: Disposable
  let documentProvider: SolargraphDocumentProvider

  const startLanguageServer = () => {
    applyConfiguration(solargraphConfiguration)
    const client = makeLanguageClient(solargraphConfiguration)
    languageClient = client
    if (documentProvider) documentProvider.setLanguageClient(client)
    client.onReady().then(() => {
      if (client !== languageClient) return
      if (!documentProvider) {
        documentProvider = new SolargraphDocumentProvider(client)
        subscriptions.push(workspace.registerTextDocumentContentProvider('solargraph', documentProvider))
      }
      client.onNotification('$/solargraph/restart', () => restartLanguageServer(false))
      if (workspace.getConfiguration('solargraph').checkGemVersion) {
        client.sendNotification('$/solargraph/checkGemVersion', { verbose: false })
      }
    }).catch(err => {
      if (client !== languageClient) return
      logger.error('Error starting Solargraph socket provider', err)
      const config = getConfig()
      if (!config.promptDownload) return
      if (err.toString().includes('ENOENT') || err.toString().includes('command not found')) {
        // tslint:disable-next-line: no-floating-promises
        window.showPrompt('Solargraph gem not found. Run `gem install solargraph` or update your Gemfile., Install Now?').then(approved => {
          if (approved) {
            solargraph.installGem(solargraphConfiguration).then(() => {
              window.showMessage('Successfully installed the Solargraph gem.')
              if (disposableClient) disposableClient.dispose()
              startLanguageServer()
            }).catch(() => {
              window.showMessage('Failed to install the Solargraph gem.', 'error')
            })
          }
        })
      } else {
        window.showMessage("Failed to start Solargraph: " + err, 'error')
      }
    })
    languageClient.start()
    disposableClient = services.registLanguageClient(languageClient)
    context.subscriptions.push(disposableClient)
  }

  const restartLanguageServer = async (notify = true): Promise<void> => {
    if (languageClient?.needsStop()) await languageClient.stop()
    if (disposableClient) disposableClient.dispose()
    startLanguageServer()
    if (notify) window.showMessage('Solargraph server restarted.', 'more')
  }

  context.subscriptions.push(commands.registerCommand('solargraph.restart', restartLanguageServer))

  // Search command
  let disposableSearch = commands.registerCommand('solargraph.search', async () => {
    let { nvim } = workspace
    let search = await nvim.call('input', ['Search:', '']) as string
    nvim.command('normal! :<C-u>', true)
    if (!search) return
    let uri = 'solargraph:///search?query=' + encodeURIComponent(search)
    await workspace.openResource(uri)
  })
  context.subscriptions.push(disposableSearch)

  // Environment command
  let disposableEnv = commands.registerCommand('solargraph.environment', () => {
    return workspace.openResource('solargraph:///environment')
  })
  context.subscriptions.push(disposableEnv)

  // Check gem version command
  let disposableCheckGemVersion = commands.registerCommand('solargraph.checkGemVersion', () => {
    if (languageClient) {
      languageClient.sendNotification('$/solargraph/checkGemVersion', { verbose: true })
    }
  })
  context.subscriptions.push(disposableCheckGemVersion)

  // Build gem documentation command
  let disposableBuildGemDocs = commands.registerCommand('solargraph.buildGemDocs', () => {
    let prepareStatus = window.createStatusBarItem(10, { progress: true })
    prepareStatus.text = 'Building new gem documentation...'
    languageClient.sendRequest('$/solargraph/documentGems', { rebuild: false }).then(response => {
      prepareStatus.dispose()
      if (response['status'] == 'ok') {
        window.showMessage('Gem documentation complete.', 'more')
      } else {
        window.showMessage('An error occurred building gem documentation.', 'error')
        logger.error(response)
      }
    })
  })
  context.subscriptions.push(disposableBuildGemDocs)

  // Rebuild gems documentation command
  let disposableRebuildAllGemDocs = commands.registerCommand('solargraph.rebuildAllGemDocs', () => {
    let prepareStatus = window.createStatusBarItem(10, { progress: true })
    prepareStatus.text = 'Rebuilding all gem documentation...'
    languageClient.sendRequest('$/solargraph/documentGems', { rebuild: true }).then(response => {
      prepareStatus.dispose()
      if (response['status'] == 'ok') {
        window.showMessage('Gem documentation complete.', 'more')
      } else {
        window.showMessage('An error occurred rebuilding gem documentation.', 'error')
        logger.error(response)
      }
    })
  })
  context.subscriptions.push(disposableRebuildAllGemDocs)

  // Solargraph configuration command
  let disposableSolargraphConfig = commands.registerCommand('solargraph.config', () => {
    let child = solargraph.solargraphCommand(['config'], solargraphConfiguration)
    child.on('exit', code => {
      if (code == 0) {
        window.showMessage('Created default .solargraph.yml file.')
      } else {
        window.showMessage('Error creating .solargraph.yml file.', 'error')
      }
    })
  })
  context.subscriptions.push(disposableSolargraphConfig)

  // Solargraph download core command
  let disposableSolargraphDownloadCore = commands.registerCommand('solargraph.downloadCore', () => {
    if (languageClient) {
      languageClient.sendNotification('$/solargraph/downloadCore')
    } else {
      window.showMessage('Solargraph is still starting. Please try again in a moment.')
    }
  })
  context.subscriptions.push(disposableSolargraphDownloadCore)

  startLanguageServer()
}
