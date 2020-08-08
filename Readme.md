# coc-solargraph

Ruby language server extension using [solargraph](http://solargraph.org/)
for [coc.nvim](https://github.com/neoclide/coc.nvim).

Note: solargraph uri `solargraph:/` should be `solargraph:///` to open with vim.

Note: solargraph scheme returns html, but vim doesn't handle html, so it's
converted to markdown.

## Install

Install solargraph by:

    gem install solargraph

In your vim/neovim, run command:

    :CocInstall coc-solargraph

## Features

Coc.nvim support all features of [solargraph](https://github.com/castwide/solargraph)

## Configuration options

This extension contributes the following settings:

- `solargraph.trace.server`: default: `"off"`
  Valid options: ["off","messages","verbose"]
- `solargraph.transport`: The type of transport to use., default: `"socket"`
  Valid options: ["socket","stdio","external"]
- `solargraph.promptDownload`: Prompt for download solargraph gem when not found., default: `true`
- `solargraph.externalServer`: The host and port to use for external transports. (Ignored for stdio and socket transports.), default: `{"host":"localhost","port":7658}`
- `solargraph.commandPath`: Path to the solargraph command. Set this to an absolute path to select from multiple installed Ruby versions., default: `"solargraph"`
- `solargraph.useBundler`: Use `bundle exec` to run solargraph. (If this is true, the solargraph.commandPath setting is ignored.), default: `false`
- `solargraph.bundlerPath`: Path to the bundle executable, defaults to 'bundle', default: `"bundle"`
- `solargraph.checkGemVersion`: Automatically check if a new version of the Solargraph gem is available., default: `true`
- `solargraph.completion`: Enable completion, default: `true`
- `solargraph.hover`: Enable hover, default: `true`
- `solargraph.diagnostics`: Enable diagnostics, default: `false`
- `solargraph.autoformat`: Enable automatic formatting while typing (WARNING: experimental), default: `false`
- `solargraph.formatting`: Enable document formatting, default: `false`
- `solargraph.symbols`: Enable symbols, default: `true`
- `solargraph.definitions`: Enable definitions (go to, etc.), default: `true`
- `solargraph.rename`: Enable symbol renaming, default: `true`
- `solargraph.references`: Enable finding references, default: `true`
- `solargraph.folding`: Enable folding ranges, default: `true`
- `solargraph.logLevel`: Level of debug info to log. `warn` is least and `debug` is most., default: `"warn"`
  Valid options: ["warn","info","debug"]

Use command `:CocConfig` to open config file.

## Transport Options

Extension version 1.0.0 introduces the `solargraph.transport` setting with the following options:

- `socket`: Run a TCP server. This is the default option.
- `stdio`: Run a STDIO server.
- `external`: Connect to an external server instead of starting a new one.

Most users should use the default `socket` option or switch to `stdio` in case of network issues.

The `external` option is intended for cases where the project is hosted in a different environment from the editor,
such as a docker container or a remote server. Users can opt to run a socket server in the remote environment and connect
to it via TCP. Example configuration:

    "solargraph.transport": "external",
    "solargraph.externalServer": {
        "host": "localhost",
        "port": 7658
    }

## Documenting Your Code

Using [YARD](http://www.rubydoc.info/gems/yard/file/docs/GettingStarted.md) for inline documentation is highly recommended.
Solargraph will use YARD comments to provide the best code completion and API reference it can.

In addition to the standard YARD tags, Solargraph defines a `@type` tag for documenting variable types. It works with both
local and instance variables. Example:

    # @type [String]
    my_variable = some_method_call
    my_variable. # <= Hitting crtl-space here will suggest String instance methods

## Gem Support

Solargraph is capable of providing code completion and documentation for gems. When your code uses `require` to include a gem, its classes and methods become available in completion and intellisense.

You can make sure your gems are available with the commands `Build new gem documentation` or `Rebuild all gem documentation` in the `:CocCommand` list.

## Solargraph and Bundler

If your project uses Bundler, the most comprehensive way to use your bundled gems is to bundle Solargraph.

In the Gemfile:

    gem 'solargraph', group: :development

Run `bundle install` and use `bundle exec yard gems` to generate the documentation. This process documents cached or vendored gems, or even gems that are installed from a local path.

In order to access intellisense for bundled gems, you'll need to start the language server with Bundler by setting the `solargraph.useBundler` option to `true`.

## Diagnostics (Linting)

To enable diagnostics, set the `solargraph.diagnostics` configuration to `true`.

Solargraph uses RuboCop for diagnostics by default. If your project has a .solargraph.yml file, you can configure the diagnostics in its `reporters` section. Example:

    reporters:
    - rubocop

See [Solargraph Tips](http://solargraph.org/tips) for more information about the .solargraph.yml file.

Use a .rubocop.yml file in your project's root folder to customize the linting rules.

## Restarting Solargraph

Some changes you make to a project, such as updating the Gemfile, might require you to restart the Solargraph server.
Instead of reloading restart vim, you can restart coc.nvim by `:CocRestart`.

## Project Configuration

Solargraph will use the .solargraph.yml file for configuration if it exists in the workspace root. The extension provides
a command to `Create a Solargraph config file`, or you can do it from the command line:

    $ solargraph config .

The default file should look something like this:

    include:
      - ./**/*.rb
    exclude:
      - spec/**/*

This configuration tells Solargraph to parse all .rb files in the workspace excluding the spec folder.

## Updating the Core Documentation

The Solargraph gem ships with documentation for Ruby 2.2.2. As of gem version 0.15.0, there's an option to download additional documentation for other Ruby versions from the command line.

    $ solargraph list-cores      # List the installed documentation versions
    $ solargraph available-cores # List the versions available for download
    $ solargraph download-core   # Install the best match for your Ruby version
    $ solargraph clear-cores     # Clear the documentation cache

## License

MIT
