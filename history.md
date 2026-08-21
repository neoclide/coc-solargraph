# Change log

## 1.3.0

- Add the `solargraph.restart` command to restart only the Solargraph language server.
- Handle the `$/solargraph/restart` server notification and restart the language client without showing a duplicate message.
- Wait for external TCP connections to reach the `connect` state before starting the language client, accept numeric string ports, and offer a retry action when a connection fails.
- Keep Solargraph documentation pages backed by Coc's existing text document content provider across language-server restarts.
- Make `solargraph.commandPath` and `solargraph.bundlerPath` resource-scoped so they can be configured per workspace or resource.
