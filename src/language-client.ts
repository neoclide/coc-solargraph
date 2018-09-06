import { LanguageClient, LanguageClientOptions, ServerOptions, workspace } from 'coc.nvim'

export function makeLanguageClient(
  languageIds: string[],
  configurations: any
): LanguageClient {

  // Options to control the language client
  let clientOptions: LanguageClientOptions = {
    documentSelector: languageIds,
    synchronize: {
      // Synchronize the setting section 'solargraph' to the server
      configurationSection: 'solargraph',
      // Notify the server about file changes to any file in the workspace
      fileEvents: workspace.createFileSystemWatcher('**/*')
    },
    initializationOptions: {
      enablePages: false
    }
  }
  let serverOptions: ServerOptions = {
    command: configurations.commandPath || ' solargraph',
    args: ['stdio']
  }

  return new LanguageClient(
    'solargraph',
    'Ruby Language Server',
    serverOptions,
    clientOptions
  )
}
