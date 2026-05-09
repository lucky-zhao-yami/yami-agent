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
    return new Promise((resolve) => { this.doConnect(resolve); });
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
      case "cancel_session":
        log.info(`Cancel requested for taskNode: ${msg.payload.taskNodeId}`);
        break;
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

  private handleStartSession(payload: { taskNodeId: string; agentName: string; prompt: string }): void {
    const { taskNodeId, prompt } = payload;
    const chatId = `af_${taskNodeId}`;
    this.chatToTaskNode.set(chatId, taskNodeId);
    this.messageHandler?.({
      chatId, userId: "agentflow-platform", msgType: "text",
      text: prompt, reqId: chatId, chatType: 1,
    });
  }

  private handleResumeSession(payload: { taskNodeId: string; agentName: string; sessionId: string; prompt: string }): void {
    const { taskNodeId, prompt } = payload;
    const chatId = `af_${taskNodeId}`;
    this.chatToTaskNode.set(chatId, taskNodeId);
    this.messageHandler?.({
      chatId, userId: "agentflow-platform", msgType: "text",
      text: prompt, reqId: chatId, chatType: 1,
    });
  }

  private sendResult(taskNodeId: string, output: string): void {
    let parsed: any;
    try { parsed = JSON.parse(output); } catch { parsed = output; }
    this.send({ type: "session_result", payload: { taskNodeId, output: parsed } });
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
