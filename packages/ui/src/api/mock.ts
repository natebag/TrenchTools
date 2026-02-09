import type { TokenInfo, ShieldResult, PnLData } from '@/types'

// Mock API calls for development - replace with real RPC calls

export async function fetchTokenInfo(address: string): Promise<TokenInfo | null> {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 500))
  
  if (!address || address.length < 10) return null
  
  return {
    address,
    name: 'Mock Token',
    symbol: 'MOCK',
    decimals: 9,
    priceUsd: Math.random() * 0.01,
    liquidity: Math.random() * 100,
    marketCap: Math.random() * 1000000,
    priceChange24h: (Math.random() - 0.5) * 100,
  }
}

export async function scanWithShield(address: string): Promise<ShieldResult> {
  await new Promise(resolve => setTimeout(resolve, 800))
  
  const riskScore = Math.floor(Math.random() * 100)
  const warnings: string[] = []
  
  if (riskScore > 70) warnings.push('High creator risk score')
  if (riskScore > 90) warnings.push('Possible honeypot contract')
  if (Math.random() > 0.7) warnings.push('Liquidity not locked')
  
  return {
    address,
    riskScore,
    isHoneypot: riskScore > 80,
    canSell: riskScore < 80,
    hasMint: Math.random() > 0.8,
    hasPause: Math.random() > 0.9,
    isRugPull: riskScore > 95,
    warnings,
  }
}

export async function fetchPnLHistory(): Promise<PnLData[]> {
  await new Promise(resolve => setTimeout(resolve, 300))
  
  const data: PnLData[] = []
  const now = new Date()
  
  for (let i = 29; i >= 0; i--) {
    const date = new Date(now)
    date.setDate(date.getDate() - i)
    
    const profit = Math.random() > 0.5 ? Math.random() * 5 : 0
    const loss = Math.random() > 0.7 ? Math.random() * 2 : 0
    
    data.push({
      date: date.toISOString().split('T')[0],
      profit: parseFloat(profit.toFixed(3)),
      loss: parseFloat(loss.toFixed(3)),
      totalTrades: Math.floor(Math.random() * 10) + 1,
    })
  }
  
  return data
}

export async function estimateGas(): Promise<number> {
  await new Promise(resolve => setTimeout(resolve, 100))
  return 0.000005 + Math.random() * 0.000005
}

export async function broadcastTransaction(_txData: unknown): Promise<{ hash: string }> {
  await new Promise(resolve => setTimeout(resolve, 1000))
  return { hash: '0x' + Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('') }
}
