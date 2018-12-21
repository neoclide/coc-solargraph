import { LanguageClient, LanguageClientOptions, ServerOptions, workspace, ProvideCompletionItemsSignature, ProviderResult } from 'coc.nvim'
import { TextDocument, Position, CompletionItem, CompletionList } from 'vscode-languageserver-types'
import { CompletionContext, CancellationToken } from 'vscode-languageserver-protocol'

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
    },
    middleware: {
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
  }
  let serverOptions: ServerOptions = {
    command: configurations.commandPath || ' solargraph',
    args: ['stdio'],
    options: {
      env: configurations.env || process.env
    }
  }

  return new LanguageClient(
    'solargraph',
    'Ruby Language Server',
    serverOptions,
    clientOptions
  )
}
