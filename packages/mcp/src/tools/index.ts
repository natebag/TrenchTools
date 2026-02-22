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
import * as volumeStart from './volume-start.js';
import * as volumeStatus from './volume-status.js';
import * as volumeStop from './volume-stop.js';
import * as botStart from './bot-start.js';
import * as botStatus from './bot-status.js';
import * as botStop from './bot-stop.js';
import * as activityStart from './activity-start.js';
import * as activityStatus from './activity-status.js';
import * as activityStop from './activity-stop.js';
import * as stealthFund from './stealth-fund.js';

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
  register(volumeStart);
  register(volumeStatus);
  register(volumeStop);
  register(botStart);
  register(botStatus);
  register(botStop);
  register(activityStart);
  register(activityStatus);
  register(activityStop);
  register(stealthFund);
}
