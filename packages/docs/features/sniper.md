# Sniper

The Sniper lets you buy tokens instantly and manage positions with automated sell triggers.

## How to Snipe

1. Navigate to the **Sniper** tab
2. Paste the token's contract address (CA)
3. Set your buy amount in SOL
4. Configure slippage (default 10%)
5. Select which wallet to use
6. Click **Snipe**

The system auto-detects whether the token is on PumpFun's bonding curve or has graduated to Jupiter, and routes the trade accordingly.

## Auto-Sell Triggers

After sniping, you can set up automatic sell conditions:

### Take Profit
Sell when the token reaches a target multiplier from your entry price.
- Example: Set to `2x` → sells when price doubles

### Stop Loss
Sell when the token drops below a percentage of your entry price.
- Example: Set to `50%` → sells if price drops 50% from entry

### Trailing Stop
Follows the price up and sells when it drops a percentage from the peak.
- Example: Set to `20%` → if token goes 10x then drops 20% from that peak, it sells

### Time-Based
Sell after a specified duration regardless of price.
- Example: Set to `60 minutes` → auto-sells after 1 hour

### Partial Sells (DCA Out)
Configure multiple sell levels to take profits gradually.
- Example: Sell 25% at 2x, 25% at 5x, 50% at 10x

## Position Cards

After buying, the Sniper shows a position card with:
- Token name and CA
- Entry price and current price
- Unrealized P&L (with percentage)
- Active sell triggers
- Manual sell button

Prices refresh every 30 seconds from DexScreener.

## Sell Execution

When selling a position (manual or auto-trigger):
1. System checks if token is still on PumpFun bonding curve
2. Routes to PumpFun sell or Jupiter sell accordingly
3. Records the trade in TX history
4. Updates P&L calculations
