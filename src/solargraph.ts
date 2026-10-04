import { ChildProcess, SpawnOptions } from 'child_process'
import { rubySpawn } from 'ruby-spawn'

// Process helpers adapted from solargraph-utils. See THIRD_PARTY_NOTICES.
// Keep ruby-spawn for Ruby version managers, login shells and Windows support.
export class Configuration {
  public workspace: string = null
  public useBundler = false
  public bundlerPath = 'bundle'
  public commandPath = 'solargraph'
  public withSnippets = false
  public viewsPath: string = null
  public shell: string = null
}

function spawnCommand(command: string, args: string[], configuration: Configuration): ChildProcess {
  const options: SpawnOptions = {}
  if (configuration.workspace) options.cwd = configuration.workspace
  if (configuration.shell) options.shell = configuration.shell
  if (configuration.useBundler && configuration.workspace) {
    return rubySpawn(configuration.bundlerPath, ['exec', command, ...args], options, true)
  }
  return rubySpawn(command, args, options, true)
}

export function solargraphCommand(args: string[], configuration: Configuration): ChildProcess {
  const command = configuration.useBundler && configuration.workspace ? 'solargraph' : configuration.commandPath
  return spawnCommand(command, args, configuration)
}

export function installGem(configuration: Configuration): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const child = spawnCommand('gem', ['install', 'solargraph'], configuration)
    // The install command has no output consumer. Drain both pipes so verbose
    // gem installation cannot fill them and prevent the process from exiting.
    child.stdout.resume()
    child.stderr.resume()
    child.on('error', reject)
    child.on('exit', code => {
      if (code === 0) resolve(true)
      else reject(new Error(`Solargraph gem installation exited with code ${code}`))
    })
  })
}

export class SocketProvider {
  private _port: number

  constructor(private configuration: Configuration) {}

  public get port(): number {
    return this._port
  }

  public start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = solargraphCommand(['socket', '--port', '0'], this.configuration)
      let output = ''
      let listening = false
      child.stderr.on('data', (data: Buffer) => {
        console.log(data.toString())
        if (listening) return
        output += data.toString()
        const match = /PORT=([0-9]+)\s+PID=([0-9]+)/.exec(output)
        if (match) {
          this._port = Number(match[1])
          listening = true
          resolve()
        }
      })
      child.on('error', reject)
      child.on('exit', code => {
        if (!listening) reject(new Error(output || `Solargraph socket server exited with code ${code}`))
      })
    })
  }
}
