import React, { createContext, useContext, useState, useEffect } from 'react'
import type { Wallet, SniperConfig, TreasuryState, Settings, ActivityLog } from '@/types'

interface WalletContextType {
  wallets: Wallet[]
  treasury: TreasuryState
  sniperConfig: SniperConfig
  settings: Settings
  activity: ActivityLog[]
  loading: boolean
  addWallet: (wallet: Omit<Wallet, 'id'>) => void
  removeWallet: (id: string) => void
  fundWallet: (id: string, amount: number) => void
  updateSniperConfig: (config: Partial<SniperConfig>) => void
  updateSettings: (settings: Partial<Settings>) => void
  addActivity: (log: Omit<ActivityLog, 'id' | 'timestamp'>) => void
}

const defaultSniperConfig: SniperConfig = {
  enabled: false,
  minLiquidity: 1,
  maxSlippage: 5,
  gasMultiplier: 1.5,
  autoSell: true,
  takeProfit: 200,
  stopLoss: 50,
  maxHoldingTime: 300,
}

const defaultTreasury: TreasuryState = {
  treasuryBalance: 10.5,
  allocatedToSnipers: 5.2,
  totalProfit: 23.8,
  totalLoss: 3.2,
  dailyVolume: 1.8,
}

const defaultSettings: Settings = {
  rpcUrl: 'https://api.devnet.solana.com',
  chainId: 103,
  apiKey: '',
  theme: 'dark',
}

const WalletContext = createContext<WalletContextType | undefined>(undefined)

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [wallets, setWallets] = useState<Wallet[]>(() => {
    const saved = localStorage.getItem('trench_wallets')
    return saved ? JSON.parse(saved) : [
      { id: '1', address: '0x7f...3a2b', name: 'Main Sniper', balance: 2.5, encrypted: true, type: 'sniper' },
      { id: '2', address: '0x9d...8e1c', name: 'Alpha Hunter', balance: 1.8, encrypted: true, type: 'sniper' },
      { id: '3', address: '0x3a...9f4d', name: 'Backup', balance: 0.9, encrypted: false, type: 'burner' },
    ]
  })

  const [treasury, setTreasury] = useState<TreasuryState>(defaultTreasury)
  const [sniperConfig, setSniperConfig] = useState<SniperConfig>(defaultSniperConfig)
  const [settings, setSettingsState] = useState<Settings>(defaultSettings)
  const [activity, setActivity] = useState<ActivityLog[]>([])
  const [loading] = useState(false)

  useEffect(() => {
    localStorage.setItem('trench_wallets', JSON.stringify(wallets))
  }, [wallets])

  const addWallet = (wallet: Omit<Wallet, 'id'>) => {
    const newWallet = { ...wallet, id: Date.now().toString() }
    setWallets([...wallets, newWallet])
  }

  const removeWallet = (id: string) => {
    setWallets(wallets.filter(w => w.id !== id))
  }

  const fundWallet = (id: string, amount: number) => {
    setWallets(wallets.map(w => 
      w.id === id ? { ...w, balance: w.balance + amount } : w
    ))
    setTreasury(prev => ({
      ...prev,
      allocatedToSnipers: prev.allocatedToSnipers + amount
    }))
    addActivity({
      type: 'fund',
      description: `Funded wallet with ${amount} SOL`,
      amount,
    })
  }

  const updateSniperConfig = (config: Partial<SniperConfig>) => {
    setSniperConfig({ ...sniperConfig, ...config })
  }

  const updateSettings = (newSettings: Partial<Settings>) => {
    setSettingsState({ ...settings, ...newSettings })
  }

  const addActivity = (log: Omit<ActivityLog, 'id' | 'timestamp'>) => {
    const newLog: ActivityLog = {
      ...log,
      id: Date.now().toString(),
      timestamp: new Date(),
    }
    setActivity(prev => [newLog, ...prev].slice(0, 100))
  }

  return (
    <WalletContext.Provider value={{
      wallets,
      treasury,
      sniperConfig,
      settings,
      activity,
      loading,
      addWallet,
      removeWallet,
      fundWallet,
      updateSniperConfig,
      updateSettings,
      addActivity,
    }}>
      {children}
    </WalletContext.Provider>
  )
}

export function useWallet() {
  const context = useContext(WalletContext)
  if (context === undefined) {
    throw new Error('useWallet must be used within a WalletProvider')
  }
  return context
}
