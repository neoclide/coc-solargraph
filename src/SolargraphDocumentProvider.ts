import Uri from 'vscode-uri'
import querystring from 'querystring'
import { LanguageClient } from 'coc.nvim'

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

  public provideTextDocumentContent(uri: string): string {
    if (!this.docs[uri]) {
      this.update(uri)
    }
    return this.docs[uri.toString()] || 'Loading...'
  }

  private parseQuery(query: string): any {
    return querystring.parse(query.replace(/^\?/, ''))
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
