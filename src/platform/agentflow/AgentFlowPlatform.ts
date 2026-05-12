import WebSocket from "ws";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { getLogger } from "../../logger.js";
import { IMessagePlatform } from "../types.js";
import type { IncomingMessage, PlatformEvent } from "../types.js";

const log = getLogger("AgentFlowPlatform");

export interface AgentFlowConfig {
  serverUrl: string;
  daemonName: string;
  workDir: string;
  notifyChannel?: string;
}

interface WorkflowInfo {
  id: string;
  name: string;
}

export class AgentFlowPlatform extends IMessagePlatform {
  private ws: WebSocket | null = null;
  private messageHandler: ((msg: IncomingMessage) => Promise<void>) | null = null;
  private eventHandler: ((evt: PlatformEvent) => Promise<void>) | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private daemonId: string | null = null;
  private outputBuffers = new Map<string, string[]>();
  private chatToTaskNode = new Map<string, string>();
  private _workflows: WorkflowInfo[] = [];

  readonly failedReqIds = new Set<string>();

  constructor(private config: AgentFlowConfig) { super(); }

  get workflows(): WorkflowInfo[] { return this._workflows; }

  async connect(): Promise<void> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(), 10_000);
      this.doConnect(() => { clearTimeout(timeout); resolve(); });
    });
  }

  async disconnect(): Promise<void> {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) { this.ws.close(); this.ws = null; }
  }

  onMessage(handler: (msg: IncomingMessage) => Promise<void>): void {
    this.messageHandler = handler;
  }

  onEvent(handler: (evt: PlatformEvent) => Promise<void>): void {
    this.eventHandler = handler;
  }

  async sendStream(reqId: string, _streamId: string, content: string, finish: boolean): Promise<void> {
    const taskNodeId = this.chatToTaskNode.get(reqId);
    if (!taskNodeId) return;
    if (content === "🤔") return;

    if (!this.outputBuffers.has(taskNodeId)) {
      this.outputBuffers.set(taskNodeId, []);
    }
    this.outputBuffers.get(taskNodeId)!.push(content);

    if (finish) {
      const fullOutput = this.outputBuffers.get(taskNodeId)!.join("");
      this.outputBuffers.delete(taskNodeId);
      this.chatToTaskNode.delete(reqId);
      if (fullOutput.startsWith("❌")) {
        this.send({ type: "session_error", payload: { taskNodeId, error: fullOutput } });
      } else {
        this.sendResult(taskNodeId, fullOutput);
      }
    }
  }

  async sendMessage(chatId: string, content: string, _chatType?: number): Promise<void> {
    const taskNodeId = this.chatToTaskNode.get(chatId);
    if (taskNodeId) {
      this.sendResult(taskNodeId, content);
    }
  }

  async sendWelcome(_reqId: string, _text: string): Promise<void> { /* no-op */ }
  async getMedia(_mediaId: string): Promise<Buffer | null> { return null; }

  submitIssue(payload: { sessionId: string; title: string; content: string; source: any; workflowId?: string }): void {
    this.send({ type: "create_issue", payload });
  }

  // --- internal ---

  private doConnect(onFirstConnect?: () => void): void {
    this.ws = new WebSocket(this.config.serverUrl);

    this.ws.on("open", () => {
      log.info("Connected to AgentFlow platform");
      this.register();
      this.startHeartbeat();
      if (onFirstConnect) { onFirstConnect(); onFirstConnect = undefined; }
    });

    this.ws.on("message", (raw) => {
      try {
        this.handlePlatformMessage(JSON.parse(raw.toString()));
      } catch (e) {
        log.error(e, "Failed to parse platform message");
      }
    });

    this.ws.on("close", () => {
      log.info("Disconnected from platform, reconnecting in 5s...");
      this.cleanup();
      this.reconnectTimer = setTimeout(() => this.doConnect(), 5000);
    });

    this.ws.on("error", (err) => {
      log.error(err, "Platform WebSocket error");
    });
  }

  private register(): void {
    this.send({
      type: "register",
      payload: {
        name: this.config.daemonName,
        notifyChannel: this.config.notifyChannel,
        agents: this.scanAgents(),
      },
    });
  }

  private handlePlatformMessage(msg: any): void {
    switch (msg.type) {
      case "registered":
        this.daemonId = msg.payload.daemonId;
        this._workflows = msg.payload.workflows ?? [];
        log.info(`Registered as daemon: ${this.daemonId}, ${this._workflows.length} workflows available`);
        break;
      case "start_session":
        this.handleStartSession(msg.payload);
        break;
      case "resume_session":
        this.handleResumeSession(msg.payload);
        break;
      case "cancel_session": {
        const { taskNodeId } = msg.payload;
        log.info(`Cancel requested for taskNode: ${taskNodeId}`);
        this.outputBuffers.delete(taskNodeId);
        // Clean chatToTaskNode entry for this taskNode
        for (const [chatId, tn] of this.chatToTaskNode) {
          if (tn === taskNodeId) { this.chatToTaskNode.delete(chatId); break; }
        }
        break;
      }
      case "task_completed":
      case "task_paused":
      case "task_failed":
        this.eventHandler?.({ type: "disconnected", reqId: msg.type, chatId: JSON.stringify(msg.payload) });
        break;
      case "workflows_updated":
        this._workflows = msg.payload.workflows ?? [];
        log.info(`Workflows updated: ${this._workflows.length} available`);
        break;
    }
  }

  // Design constraint: reqId === chatId. SessionManager uses reqId to route responses back,
  // and we use chatId as the key in chatToTaskNode. They must be identical so that sendStream/sendMessage
  // can look up the taskNodeId from the reqId it receives.
  private async handleStartSession(payload: { taskNodeId: string; agentName: string; prompt: string }): Promise<void> {
    const { taskNodeId, agentName, prompt } = payload;
    log.info(`Executing task node ${taskNodeId} with agent "${agentName}"`);

    try {
      const { output, sessionId } = await this.executeAgent(agentName, prompt);
      this.sendResult(taskNodeId, output, sessionId);
    } catch (err: any) {
      log.error(err, `Task node ${taskNodeId} failed`);
      this.send({ type: "session_error", payload: { taskNodeId, error: err.message } });
    }
  }

  private async handleResumeSession(payload: { taskNodeId: string; agentName: string; sessionId: string; prompt: string }): Promise<void> {
    const { taskNodeId, agentName, prompt } = payload;
    log.info(`Resuming task node ${taskNodeId} with agent "${agentName}"`);

    try {
      const { output, sessionId } = await this.executeAgent(agentName, prompt);
      this.sendResult(taskNodeId, output, sessionId);
    } catch (err: any) {
      log.error(err, `Task node ${taskNodeId} resume failed`);
      this.send({ type: "session_error", payload: { taskNodeId, error: err.message } });
    }
  }

  private async executeAgent(agentName: string, prompt: string): Promise<{ output: string; sessionId: string | null }> {
    const { AcpAgentProcess } = await import("../../agent/acp/AcpAgentProcess.js");
    const proc = new AcpAgentProcess({
      command: "kiro-cli",
      args: ["acp", "--agent", agentName, "--trust-all-tools"],
      cwd: this.config.workDir,
      env: {},
    });
    proc.setPermissions({ mode: "trust-all", deny: [], denyCommands: [], denyKinds: [] });

    try {
      await proc.initialize();
      await proc.createSession(this.config.workDir);

      // 等待 MCP servers 初始化（kiro 异步加载）
      await new Promise(r => setTimeout(r, 5000));

      let currentPrompt = prompt;
      let finalOutput = "";
      const MAX_TURNS = 10;

      for (let turn = 0; turn < MAX_TURNS; turn++) {
        const chunks: string[] = [];
        for await (const chunk of proc.prompt(proc.sessionId!, [{ type: "text", text: currentPrompt }])) {
          if (chunk.type === "text") chunks.push(chunk.text);
          if (chunk.type === "done") break;
        }
        const output = chunks.join("");

        if (turn === MAX_TURNS - 1) {
          finalOutput = output;
          break;
        }

        const judgment = await this.judgeOutput(output, prompt);

        if (judgment.done) {
          finalOutput = output;
          break;
        }

        log.info(`Agent "${agentName}" needs more input (turn ${turn + 1}), continuing...`);
        currentPrompt = judgment.reply || "请继续完成任务。";
      }

      return { output: finalOutput, sessionId: proc.sessionId ?? null };
    } finally {
      await proc.kill();
    }
  }

  private async judgeOutput(agentOutput: string, taskContext: string): Promise<{ done: boolean; reply?: string }> {
    try {
      const res = await fetch(`${this.config.serverUrl.replace('ws://', 'http://').replace('wss://', 'https://')}/trpc/assistant.judge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentOutput: agentOutput.slice(0, 3000), taskContext: taskContext.slice(0, 2000) }),
      });
      const data = await res.json() as any;
      return data?.result?.data ?? { done: true };
    } catch (err) {
      log.error(err, "Judge API failed, assuming done");
      return { done: true };
    }
  }

  private sendResult(taskNodeId: string, output: string, sessionId?: string | null): void {
    let parsed: any;
    try { parsed = JSON.parse(output); } catch { parsed = output; }
    this.send({ type: "session_result", payload: { taskNodeId, output: parsed, sessionId: sessionId ?? undefined } });
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      this.send({ type: "heartbeat", payload: { agentStatuses: {} } });
    }, 10_000);
  }

  private send(msg: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private cleanup(): void {
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
  }

  private scanAgents(): any[] {
    const agentsDir = join(this.config.workDir, ".kiro", "agents");
    if (!existsSync(agentsDir)) return [];
    const agents: any[] = [];
    try {
      for (const entry of readdirSync(agentsDir, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
        try {
          const config = JSON.parse(readFileSync(join(agentsDir, entry.name), "utf-8"));
          agents.push({
            name: config.name ?? basename(entry.name, ".json"),
            description: config.description ?? "",
            capabilities: config.tools ?? [],
            workspacePath: this.config.workDir,
            agentConfig: config.name ?? basename(entry.name, ".json"),
            status: "idle",
            lastHeartbeat: Date.now(),
          });
        } catch { /* skip malformed */ }
      }
    } catch { /* dir read error */ }
    return agents;
  }
}
