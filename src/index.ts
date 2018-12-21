import { commands, ExtensionContext, LanguageClient, workspace, services } from 'coc.nvim'
import { Disposable } from 'vscode-languageserver-protocol'
import { makeLanguageClient } from './language-client'
import { createConfig, downloadCore, verifyGemIsCurrent } from './util'
import which from 'which'

export async function activate(context: ExtensionContext): Promise<void> {
  let { subscriptions } = context
  const config = workspace.getConfiguration().get<any>('solargraph', {}) as any
  const enable = config.enable
  if (enable === false) return
  let command = config.commandPath || 'solargraph'
  try {
    which.sync(command)
  } catch (e) {
    workspace.showMessage(`Solargraph command '${command}' not found!`, 'error')
    return
  }

  let solargraphConfiguration = Object.assign({
    commandPath: 'solargraph',
    useBundler: false,
    bundlerPath: 'bundle',
    withSnippets: true,
    workspace: workspace.root
  }, config)

  const selector = config.filetypes || ['ruby']
  let client = makeLanguageClient(selector, solargraphConfiguration)
  subscriptions.push(
    services.registLanguageClient(client)
  )

  client.onReady().then(() => {
    if (config.checkGemVersion) {
      verifyGemIsCurrent()
    }
    registerCommand(client, config, subscriptions)
  }, _e => {
    // noop
  })
}

function registerCommand(client: LanguageClient, config: any, subscriptions: Disposable[]): void {
  subscriptions.push(
    commands.registerCommand('solargraph.buildGemDocs', () => {
      client.sendNotification('$/solargraph/documentGems', { rebuild: false })
    })
  )

  subscriptions.push(
    commands.registerCommand('solargraph.checkGemVersion', () => {
      verifyGemIsCurrent()
    })
  )

  subscriptions.push(
    commands.registerCommand('solargraph.rebuildAllGemDocs', () => {
      client.sendNotification('$/solargraph/documentGems', { rebuild: true })
    })
  )

  subscriptions.push(
    commands.registerCommand('solargraph.config', () => {
      createConfig(config)
    })
  )

  subscriptions.push(
    commands.registerCommand('solargraph.downloadCore', () => {
      downloadCore(config)
    })
  )
}
