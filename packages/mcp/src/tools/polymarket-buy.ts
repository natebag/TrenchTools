import { z } from 'zod';
import type { MCPConfig } from '../config.js';
import { ensureUnlocked, getDefaultWallet } from '../vault.js';

export const toolName = 'trench_polymarket_buy';
export const toolDescription = 'Buy shares on a Polymarket prediction market. Requires a Polygon wallet in the vault with USDC.e balance.';

export const toolSchema = z.object({
  conditionId: z.string().describe('Market condition ID (from trench_polymarket_search)'),
  outcome: z.enum(['Yes', 'No']).describe('Outcome to buy: Yes or No'),
  amountUsdc: z.number().positive().describe('Amount of USDC to spend'),
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
  const { conditionId, outcome, amountUsdc } = args;

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
  const rpcUrl = config.polygonRpcUrl || 'https://polygon-rpc.com';

  try {
    const { getMarket, approveUsdc, placeOrder } = await import('@trenchtools/core');

    // Look up market
    const market = await getMarket(conditionId);
    if (!market) {
      return {
        content: [{ type: 'text' as const, text: `Market not found: ${conditionId}` }],
      };
    }

    // Find the token for the chosen outcome
    const token = market.tokens?.find(t => t.outcome === outcome);
    if (!token) {
      return {
        content: [{
          type: 'text' as const,
          text: `Outcome "${outcome}" not found in market. Available: ${market.outcomes.join(', ')}`,
        }],
      };
    }

    // Approve USDC.e spending (no-op if already approved)
    const approveTx = await approveUsdc(privateKeyHex, rpcUrl);

    // Calculate shares: amountUsdc / price
    const price = token.price;
    if (price <= 0 || price >= 1) {
      return {
        content: [{
          type: 'text' as const,
          text: `Invalid price for ${outcome}: ${price}. Market may be resolved or illiquid.`,
        }],
      };
    }

    const size = amountUsdc / price;

    // Place market order
    const result = await placeOrder(privateKeyHex, {
      tokenId: token.token_id,
      side: 'BUY',
      price,
      size,
      isMarketOrder: true,
    });

    if (!result.success) {
      return {
        content: [{
          type: 'text' as const,
          text: `Buy failed: ${result.error}\n\nMarket: ${market.question}\nOutcome: ${outcome}\nWallet: ${wallet.publicKey}`,
        }],
      };
    }

    const lines: string[] = [];
    lines.push('Polymarket buy successful');
    lines.push('');
    lines.push(`  Market: ${market.question}`);
    lines.push(`  Outcome: ${outcome} @ ${(price * 100).toFixed(1)}%`);
    lines.push(`  Spent: $${amountUsdc.toFixed(2)} USDC`);
    lines.push(`  Shares: ~${size.toFixed(2)}`);
    lines.push(`  Wallet: ${wallet.publicKey}`);
    if (result.orderId) lines.push(`  Order ID: ${result.orderId}`);
    if (result.filledSize) lines.push(`  Filled: ${result.filledSize.toFixed(2)} shares`);
    if (result.avgPrice) lines.push(`  Avg price: ${(result.avgPrice * 100).toFixed(1)}%`);
    if (approveTx) lines.push(`  USDC approval tx: ${approveTx}`);

    return {
      content: [{ type: 'text' as const, text: lines.join('\n') }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      content: [{
        type: 'text' as const,
        text: `Polymarket buy failed: ${message}`,
      }],
    };
  }
}
