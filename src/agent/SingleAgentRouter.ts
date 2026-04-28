import { getLogger } from '../logger.js';
import { IAgentRouter, type IAgentProcess, type IAgentProvider, type AgentChunk, type PromptContent, type AgentSpawnOptions } from './types.js';

const log = getLogger('SingleAgentRouter');

export class SingleAgentRouter extends IAgentRouter {
  private _availableModes: string[] = [];

  constructor(
    private proc: IAgentProcess,
    private provider: IAgentProvider,
    private spawnOptions: AgentSpawnOptions,
  ) { super(); }

  get sessionId() { return this.proc.sessionId; }
  get alive() { return this.proc.alive; }
  get availableModes() { return this._availableModes; }

  async *handle(content: PromptContent[]): AsyncIterable<AgentChunk> {
    yield* this.proc.prompt(this.proc.sessionId!, content);
  }

  async switchAgent(agentName: string, spawnOpts?: AgentSpawnOptions): Promise<void> {
    log.info(`Switching agent to ${agentName}`);
    await this.proc.kill();
    const newOpts = spawnOpts ?? { ...this.spawnOptions, command: agentName };
    this.spawnOptions = newOpts;
    this.proc = await this.provider.spawn(newOpts);
    await this.proc.createSession(newOpts.cwd);
  }

  async setMode(_mode: string): Promise<void> {
    // ACP setSessionMode - placeholder until ACP SDK exposes it
    log.info(`setMode(${_mode}) - not yet supported by ACP SDK`);
  }

  async cancel(sessionId: string): Promise<void> {
    await this.proc.cancel(sessionId);
  }

  async createSession(): Promise<string> {
    return this.proc.createSession(this.spawnOptions.cwd);
  }

  async loadSession(sessionId: string): Promise<void> {
    await this.proc.loadSession(sessionId);
  }

  async kill(): Promise<void> {
    await this.proc.kill();
  }
}
