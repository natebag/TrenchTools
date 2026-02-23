import { z } from 'zod';
import type { MCPConfig } from '../config.js';
import { ensureUnlocked } from '../vault.js';

export const toolName = 'trench_polymarket_positions';
export const toolDescription = 'Show open Polymarket prediction market positions for a Polygon wallet in the vault.';

export const toolSchema = z.object({
  walletAddress: z.string().optional().describe('Polygon wallet address. Omit to use the first polygon wallet in vault.'),
});

export type ToolInput = z.infer<typeof toolSchema>;

function secretKeyToHex(secretKey: Uint8Array): `0x${string}` {
  const bytes = secretKey instanceof Uint8Array ? secretKey : new Uint8Array(Object.values(secretKey));
  const hex = Array.from(bytes.slice(0, 32))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `0x${hex}` as `0x${string}`;
}

export async function handler(args: ToolInput, config: MCPConfig) {
  // Get wallets and find a polygon wallet
  const wallets = await ensureUnlocked(config);
  const polygonWallets = wallets.filter(w => w.chain === 'polygon');

  if (polygonWallets.length === 0) {
    return {
      content: [{
        type: 'text' as const,
        text: 'No Polygon wallets in vault. Use trench_wallet_generate with chain "polygon" first.',
      }],
    };
  }

  let wallet;
  if (args.walletAddress) {
    wallet = polygonWallets.find(w => w.publicKey === args.walletAddress);
    if (!wallet) {
      return {
        content: [{
          type: 'text' as const,
          text: `Wallet ${args.walletAddress} not found among Polygon wallets in vault.`,
        }],
      };
    }
  } else {
    wallet = polygonWallets[0];
  }

  const privateKeyHex = secretKeyToHex(wallet.secretKey);

  try {
    const { getPositions } = await import('@trenchtools/core');

    const positions = await getPositions(privateKeyHex);

    if (positions.length === 0) {
      return {
        content: [{
          type: 'text' as const,
          text: `No open Polymarket positions for wallet ${wallet.publicKey}.`,
        }],
      };
    }

    let totalValue = 0;
    let totalPnl = 0;

    const lines: string[] = [];
    lines.push('Polymarket Positions');
    lines.push(`Wallet: ${wallet.publicKey}`);
    lines.push('');

    for (let i = 0; i < positions.length; i++) {
      const p = positions[i];
      const value = p.size * p.currentPrice;
      const cost = p.size * p.avgPrice;
      totalValue += value;
      totalPnl += p.pnl;

      const pnlStr = p.pnl >= 0 ? `+$${p.pnl.toFixed(2)}` : `-$${Math.abs(p.pnl).toFixed(2)}`;
      const pnlPctStr = p.pnlPercent >= 0 ? `+${p.pnlPercent.toFixed(1)}%` : `${p.pnlPercent.toFixed(1)}%`;

      lines.push(`${i + 1}. ${p.question}`);
      lines.push(`   Outcome: ${p.outcome} ${p.resolved ? '(RESOLVED)' : ''}`);
      lines.push(`   Shares: ${p.size.toFixed(2)} @ avg ${(p.avgPrice * 100).toFixed(1)}%`);
      lines.push(`   Current: ${(p.currentPrice * 100).toFixed(1)}%  Value: $${value.toFixed(2)}`);
      lines.push(`   PnL: ${pnlStr} (${pnlPctStr})`);
      lines.push(`   Condition ID: ${p.conditionId}`);
      lines.push('');
    }

    const totalPnlStr = totalPnl >= 0 ? `+$${totalPnl.toFixed(2)}` : `-$${Math.abs(totalPnl).toFixed(2)}`;
    lines.push(`Total: ${positions.length} position(s)  Value: $${totalValue.toFixed(2)}  PnL: ${totalPnlStr}`);

    return {
      content: [{ type: 'text' as const, text: lines.join('\n') }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      content: [{
        type: 'text' as const,
        text: `Failed to fetch Polymarket positions: ${message}`,
      }],
    };
  }
}
