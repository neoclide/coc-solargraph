import querystring from 'querystring'
import { Uri, workspace, LanguageClient, ProviderResult } from 'coc.nvim'
import { CancellationToken } from 'vscode-jsonrpc'
import TurndownService from 'turndown'

const turndownService = new TurndownService()

export default class SolargraphDocumentProvider {
  private docs: { [uri: string]: string }

  constructor(private languageClient: LanguageClient) {
    this.docs = {}
  }

  public updateAll(): void {
    Object.keys(this.docs).forEach(uri => {
      this.update(uri)
    })
  }

  public remove(uri: string): void {
    delete this.docs[uri]
  }

  public provideTextDocumentContent(uri: Uri, token: CancellationToken): ProviderResult<string> {
    let key = uri.toString()
    let doc = this.docs[uri.toString()]
    if (doc) return doc
    return new Promise(resolve => {
      let method = '$/solargraph' + uri.path
      let query = this.parseQuery(uri.query.replace(/=/g, '%3D').replace(/\%$/, '%25').replace(/query\%3D/, 'query='))
      this.languageClient
        .sendRequest(method, { query: query.query })
        .then((result: any) => {
          workspace.nvim.command('setfiletype markdown', true)
          if (result && result.content) {
            let content = result.content.replace(/solargraph:\//g, 'solargraph:///')
            let markdown = turndownService.turndown(content)
            this.docs[key] = markdown
            resolve(markdown)
          } else {
            this.docs[key] = ''
            resolve('')
          }
        }, e => {
          resolve(`Load error ${e}`)
        })
    })
  }

  private parseQuery(query: string): any {
    let result = {}
    let parts = query.split('&')
    parts.forEach(part => {
      let frag = part.split('=')
      result[decodeURIComponent(frag[0])] = decodeURIComponent(frag[1])
    })
    return result
  }

  public update(uri: string): void {
    let method = '$/solargraph' + Uri.parse(uri).path
    let query = this.parseQuery(Uri.parse(uri).query)
    this.languageClient
      .sendRequest(method, { query: query.query })
      .then((result: any) => {
        this.docs[uri.toString()] = result.content
      })
  }
}
