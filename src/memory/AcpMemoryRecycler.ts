import { homedir } from 'node:os';
import { join } from 'node:path';
import { getLogger } from '../logger.js';
import { IMemoryRecycler } from './types.js';
import type { IAgentProvider, AgentSpawnOptions } from '../agent/types.js';

const log = getLogger('AcpMemoryRecycler');

const RECYCLE_PROMPT = (sessionFilePath: string) =>
`请读取以下 ACP session 文件，总结对话要点：

文件路径: ${sessionFilePath}

要求：
1. 用文件读取工具读取该文件内容
2. 提取关键讨论主题、决策和结论
3. 记录重要的技术细节和代码变更
4. 用简洁的中文输出总结，格式为 markdown
5. 总结控制在 500 字以内

请直接输出总结内容，不要包含其他说明。`;

/**
 * 启动临时 ACP Agent 进程来总结 session 文件。
 * Agent 用文件读取工具读取 session .jsonl，生成 markdown 摘要。
 * 临时进程用完即杀。
 */
export class AcpMemoryRecycler extends IMemoryRecycler {
  private sessionBaseDir: string;

  constructor(
    private agentProvider: IAgentProvider,
    private agentSpawnOpts: AgentSpawnOptions,
    sessionBaseDir?: string,
  ) {
    super();
    this.sessionBaseDir = sessionBaseDir ?? join(homedir(), '.kiro', 'sessions', 'cli');
  }

  async summarize(_chatId: string, sessionId: string): Promise<string> {
    const sessionPath = join(this.sessionBaseDir, `${sessionId}.jsonl`);
    log.info(`Summarizing session ${sessionId} from ${sessionPath}`);

    const proc = await this.agentProvider.spawn(this.agentSpawnOpts);

    try {
      const sid = await proc.createSession(this.agentSpawnOpts.cwd);
      let result = '';

      for await (const chunk of proc.prompt(sid, [{ type: 'text', text: RECYCLE_PROMPT(sessionPath) }])) {
        if (chunk.type === 'text') result += chunk.text;
        if (chunk.type === 'done') break;
      }

      log.info(`Summary generated for session ${sessionId}, length=${result.length}`);
      return result.trim() || '(无法生成摘要)';
    } catch (e) {
      log.error(e, `Failed to summarize session ${sessionId}`);
      return '(摘要生成失败)';
    } finally {
      await proc.kill().catch(() => {});
    }
  }
}
