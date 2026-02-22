import { z } from 'zod';
import { Connection } from '@solana/web3.js';
import { analyzeTokenSafety, formatSafetyReport } from '@trenchtools/core';
import type { MCPConfig } from '../config.js';

export const toolName = 'trench_shield_scan';
export const toolDescription = 'Analyze token safety: checks mint/freeze authority, liquidity, honeypot risk, and transfer patterns. Returns a risk score 0-100.';

export const toolSchema = z.object({
  tokenMint: z.string().describe('Token mint address to analyze'),
});

export type ToolInput = z.infer<typeof toolSchema>;

export async function handler(args: ToolInput, config: MCPConfig) {
  const connection = new Connection(config.rpcUrl, 'confirmed');

  try {
    const result = await analyzeTokenSafety({
      connection,
      tokenMint: args.tokenMint,
    });

    const report = formatSafetyReport(result);

    return {
      content: [{ type: 'text' as const, text: report }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      content: [{
        type: 'text' as const,
        text: `Shield scan failed for ${args.tokenMint}: ${message}\n\nThis may mean the token mint address is invalid or the token has not been created yet.`,
      }],
    };
  }
}
