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

- `solargraph.commandPath`: Path to the solargraph command. Set this to an absolute path to select from multiple installed Ruby versions.
- `solargraph.useBundler`: Use `bundle exec` to run solargraph. (If this is true, `solargraph.commandPath` is ignored.)
- `solargraph.bundlerPath`: Path to the bundle command.
- `solargraph.checkGemVersion`: Check if a new version of the Solargraph gem is available. Default is true (recommended).
- `solargraph.promptDownload`: Prompt for download solargraph gem when not found.
- `solargraph.diagnostics`: Enable diagnostics reporting. See [Solargraph Tips](http://solargraph.org/tips) for diagnostics options.
- `solargraph.completion`: Enable autocompletion.
- `solargraph.hover`: Enable tips on hover.
- `solargraph.autoformat`: Enable automatic formatting while typing.
- `solargraph.formatting`: Enable document formatting. The gem currently uses RuboCop for formatting.
- `solargraph.symbols`: Enable search for document and workspace symbols.
- `solargraph.definitions`: Enable go-to-definition.
- `solargraph.rename`: Enable symbol renaming.
- `solargraph.references`: Enable finding references.
- `solargraph.folding`: Enable folding ranges.
- `solargraph.transport`: socket (default), stdio, or external. See [Transport Options](#transport-options) for more information.
- `solargraph.externalServer`: The host and port for external transports. See [Transport Options](#transport-options) for more information.
- `solargraph.logLevel`: The logging level. Options in ascending amount of detail are `warn`, `info`, and `debug`. The default is `warn`.

Use command `:CocConfig` to open config file.

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
