import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MCPConfig } from '../config.js';

import * as walletList from './wallet-list.js';
import * as walletGenerate from './wallet-generate.js';
import * as balances from './balances.js';
import * as tokenInfo from './token-info.js';
import * as shieldScan from './shield-scan.js';
import * as quote from './quote.js';
import * as buy from './buy.js';
import * as sell from './sell.js';
import * as walletFund from './wallet-fund.js';
import * as walletSweep from './wallet-sweep.js';
import * as positions from './positions.js';

export function registerAllTools(server: McpServer, config: MCPConfig): void {
  const register = (tool: { toolName: string; toolDescription: string; toolSchema: { shape: Record<string, unknown> }; handler: (args: any, config: MCPConfig) => Promise<any> }) => {
    server.tool(tool.toolName, tool.toolDescription, tool.toolSchema.shape as any, async (args: any) => {
      return tool.handler(args, config);
    });
  };

  register(walletList);
  register(walletGenerate);
  register(balances);
  register(tokenInfo);
  register(shieldScan);
  register(quote);
  register(buy);
  register(sell);
  register(walletFund);
  register(walletSweep);
  register(positions);
}
