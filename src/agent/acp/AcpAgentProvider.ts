import { IAgentProvider, type IAgentProcess, type AgentSpawnOptions } from '../types.js';
import { AcpAgentProcess } from './AcpAgentProcess.js';

export class AcpAgentProvider extends IAgentProvider {
  async spawn(options: AgentSpawnOptions): Promise<IAgentProcess> {
    const proc = new AcpAgentProcess(options);
    await proc.initialize();
    return proc;
  }
}
