import { spawn, type ChildProcess } from 'node:child_process';
import { Readable, Writable } from 'node:stream';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve as pathResolve } from 'node:path';
import * as acp from '@agentclientprotocol/sdk';
import { getLogger } from '../../logger.js';
import { IAgentProcess, type AgentChunk, type AgentSpawnOptions, type PromptContent } from '../types.js';
import { AsyncQueue } from '../../utils.js';

const log = getLogger('AcpAgentProcess');

export class AcpAgentProcess extends IAgentProcess {
  private proc: ChildProcess | null = null;
  private conn: acp.ClientSideConnection | null = null;
  private _sessionId: string | null = null;
  private activeQueue: AsyncQueue<AgentChunk> | null = null;

  constructor(private options: AgentSpawnOptions) { super(); }

  get sessionId() { return this._sessionId; }

  get alive() {
    return this.proc !== null && this.proc.exitCode === null && !this.conn?.signal.aborted;
  }

  async initialize(): Promise<void> {
    const { command, args, cwd, env } = this.options;
    this.proc = spawn(command, args, {
      cwd,
      stdio: ['pipe', 'pipe', 'inherit'],
      env: { ...process.env, ...env },
    });

    this.proc.on('exit', (code) => {
      log.info(`ACP process exited code=${code}`);
    });

    const input = Writable.toWeb(this.proc.stdin!);
    const output = Readable.toWeb(this.proc.stdout!) as ReadableStream<Uint8Array>;
    const stream = acp.ndJsonStream(input, output);

    this.conn = new acp.ClientSideConnection((_agent) => ({
      requestPermission: async (params) => this.handlePermission(params),
      sessionUpdate: async (params) => this.handleSessionUpdate(params),
      readTextFile: async (params) => this.handleReadFile(params),
      writeTextFile: async (params) => this.handleWriteFile(params),
    }), stream);

    await this.conn.initialize({
      protocolVersion: acp.PROTOCOL_VERSION,
      clientCapabilities: {
        fs: { readTextFile: true, writeTextFile: true },
      },
    });
    log.info('ACP process initialized');
  }

  async createSession(cwd: string): Promise<string> {
    const result = await this.conn!.newSession({ cwd, mcpServers: [] });
    this._sessionId = result.sessionId;
    log.info(`Session created: ${this._sessionId}`);
    return this._sessionId!;
  }

  async loadSession(sessionId: string): Promise<void> {
    await this.conn!.loadSession({ sessionId, cwd: this.options.cwd, mcpServers: [] });
    this._sessionId = sessionId;
    log.info(`Session loaded: ${sessionId}`);
  }

  async *prompt(sessionId: string, content: PromptContent[]): AsyncIterable<AgentChunk> {
    const queue = new AsyncQueue<AgentChunk>();
    this.activeQueue = queue;

    const promptBlocks: acp.ContentBlock[] = content.map(c => {
      if (c.type === 'text') return { type: 'text' as const, text: c.text };
      return { type: 'image' as const, data: c.data, mimeType: c.mediaType };
    });

    this.conn!.prompt({ sessionId, prompt: promptBlocks })
      .then(result => queue.push({ type: 'done', stopReason: result.stopReason }))
      .catch(err => { log.error(err, 'Prompt error'); queue.push({ type: 'done', stopReason: 'error' }); })
      .finally(() => queue.close());

    try {
      for await (const chunk of queue) {
        yield chunk;
        if (chunk.type === 'done') break;
      }
    } finally {
      this.activeQueue = null;
    }
  }

  async cancel(sessionId: string): Promise<void> {
    await this.conn?.cancel({ sessionId });
  }

  async kill(): Promise<void> {
    this.activeQueue?.close();
    this.activeQueue = null;
    if (this.proc && this.proc.exitCode === null) {
      this.proc.kill('SIGTERM');
      await new Promise<void>(r => {
        const timer = setTimeout(() => { this.proc?.kill('SIGKILL'); r(); }, 5000);
        this.proc!.on('exit', () => { clearTimeout(timer); r(); });
      });
    }
    this.proc = null;
    this.conn = null;
  }

  private handleSessionUpdate(params: acp.SessionNotification): Promise<void> {
    const update = params.update;
    if (update.sessionUpdate === 'agent_message_chunk' && update.content.type === 'text') {
      this.activeQueue?.push({ type: 'text', text: update.content.text });
    } else if (update.sessionUpdate === 'tool_call') {
      this.activeQueue?.push({ type: 'tool_call', title: update.title, status: update.status ?? 'in_progress' });
    } else if (update.sessionUpdate === 'tool_call_update') {
      this.activeQueue?.push({ type: 'tool_call', title: (update as any).title ?? '', status: (update as any).status ?? 'in_progress' });
    }
    return Promise.resolve();
  }

  private async handlePermission(params: acp.RequestPermissionRequest): Promise<acp.RequestPermissionResponse> {
    const allow = params.options.find(o => o.kind === 'allow_once' || o.kind === 'allow_always') ?? params.options[0];
    log.info(`Auto-approving permission: ${params.toolCall.title} → ${allow?.name}`);
    return { outcome: { outcome: 'selected', optionId: allow!.optionId } };
  }

  private async handleReadFile(params: acp.ReadTextFileRequest): Promise<acp.ReadTextFileResponse> {
    try {
      const content = await readFile(params.path, 'utf-8');
      return { content };
    } catch (e: unknown) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') return { content: '' };
      throw e; // permission errors etc. should propagate
    }
  }

  private async handleWriteFile(params: acp.WriteTextFileRequest): Promise<acp.WriteTextFileResponse> {
    const resolved = pathResolve(params.path);
    const workDir = this.options.cwd;
    if (!resolved.startsWith(workDir)) {
      throw new Error(`Write denied: ${params.path} is outside WORK_DIR`);
    }
    await mkdir(dirname(params.path), { recursive: true });
    await writeFile(params.path, params.content, 'utf-8');
    return {};
  }
}
