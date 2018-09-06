# coc-solargraph

Ruby language server extension using [solargraph](http://solargraph.org/)
for [coc.nvim](https://github.com/neoclide/coc.nvim).

## Install

Install solargraph by:

    gem install solargraph

In your vim/neovim, run command:

    :CocInstall coc-solargraph

## Features

Coc support all features of [solargraph](https://github.com/castwide/solargraph)

## Configuration options

* `solargraph.enable` set to `false` to disable wxml language server.
* `solargraph.trace.server` trace LSP traffic in output channel.
* `solargraph.execArgv` add `execArgv` to `child_process.spawn`

Trigger completion in your `coc-settings.json` to get full list.

## License

MIT
