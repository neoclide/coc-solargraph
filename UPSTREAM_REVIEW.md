# Upstream review — 2026-10-03

Downstream baseline 2323b8f. Verified latest castwide/vscode-solargraph HEAD by fetch: edb5afc72c84b0c06ddf4bffb6f0c85b2215232f (2025-06-26), unchanged from the existing upstream checkout. Historical Coc import 8b7c51b and subsequent 2026-08 work, including 97e972e integration coverage and history.md 1.3.0, already cover server-requested restart, external socket connection/retry and resource-scoped executable configuration.

Preserved existing Coc document content provider/HTML-to-Markdown conversion, symbol completion start-column adaptation, default 127.0.0.1 host, shell selection and gem-check behavior. VS Code trusted command links and webviews are host-specific and are not copied. No new runtime change is justified by this review; it does not claim every historical host difference is identical.

Baseline npm run lint and npm run prepare passed. npm test ran seven integration cases: two passed, five failed. The real Solargraph executable is absent (spawn solargraph ENOENT), so real-server symbol/documentation/restart tests cannot complete. The external-connection test additionally encountered sandbox EPERM for loopback listening. No runtime source was changed to hide these environmental failures.

The existing AGENTS.md compatibility rules are preserved; only the user-requested branch commit/push authorization paragraph is appended. No commit or push was attempted for this repository because full applicable integration verification remains blocked.
