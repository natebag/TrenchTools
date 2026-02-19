import {
  Github,
  Twitter,
  ArrowRight,
  Check,
  ExternalLink,
  BookOpen,
  Zap,
} from 'lucide-react'

function App() {
  return (
    <div className="min-h-screen bg-slate-950">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <img src="/logo.png" alt="TrenchTools" className="h-10 w-auto" />
            </div>
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-slate-400 hover:text-white transition-colors">Features</a>
              <a href="#how-it-works" className="text-slate-400 hover:text-white transition-colors">How it Works</a>
              <a href="#dashboard" className="text-slate-400 hover:text-white transition-colors">Dashboard</a>
              <a
                href="https://docs.trenchtools.io"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-slate-400 hover:text-emerald-400 transition-colors"
              >
                <BookOpen className="w-4 h-4" />
                Docs
              </a>
              <a
                href="https://github.com/natebag/Trenchtools"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 px-4 py-2 rounded-lg transition-colors"
              >
                <Github className="w-4 h-4" />
                Star on GitHub
              </a>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 relative overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-emerald-900/20 via-slate-950 to-slate-950" />
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-emerald-500/10 rounded-full blur-3xl" />
        
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="text-center animate-fade-in">
            <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-4 py-1.5 mb-6">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-emerald-400 text-sm font-medium">Open Source & Free Forever</span>
            </div>
            
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold mb-6 leading-tight">
              <span className="gradient-text">TrenchTools</span>
              <br />
              <span className="text-white">Solana Trading Suite</span>
            </h1>
            
            <p className="text-xl text-slate-400 max-w-3xl mx-auto mb-10">
              The complete Solana trading toolkit. Token sniping, market making, 
              wallet management, and real-time analytics — open source or hosted with just 0.5% fees.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <a
                href="https://app.trenchtools.io"
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 px-8 py-4 rounded-xl text-lg font-semibold transition-all hover:scale-105 animate-pulse-glow"
              >
                <Zap className="w-5 h-5" />
                Launch App
                <ArrowRight className="w-5 h-5" />
              </a>
              <a
                href="https://github.com/natebag/Trenchtools"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 px-8 py-4 rounded-xl text-lg font-semibold transition-all hover:scale-105"
              >
                <Github className="w-5 h-5" />
                Self-Host (Free)
              </a>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-6 mt-12 text-slate-500">
              <div className="flex items-center gap-2">
                <Check className="w-5 h-5 text-emerald-500" />
                <span>Open Source</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-5 h-5 text-emerald-500" />
                <span>Non-Custodial</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-5 h-5 text-emerald-500" />
                <span>0.5% Hosted Fee</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-5 h-5 text-emerald-500" />
                <span>Telegram Bot</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Everything You Need</h2>
            <p className="text-xl text-slate-400">Powerful features for serious Solana market makers</p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <FeatureCard
              icon={<img src="/icons/crosshair.png" alt="" className="w-12 h-12 rounded-lg object-contain" />}
              title="Token Sniper"
              description="Lightning-fast token sniping with auto-buy on launch and configurable limits."
            />
            <FeatureCard
              icon={<img src="/icons/graph.png" alt="" className="w-12 h-12 rounded-lg object-contain" />}
              title="Market Making"
              description="Automated volume and liquidity with smart patterns that mimic natural flow."
            />
            <FeatureCard
              icon={<img src="/icons/wallet.png" alt="" className="w-12 h-12 rounded-lg object-contain" />}
              title="Wallet Manager"
              description="Multi-wallet treasury with auto-distribution, sweeping, and balance tracking."
            />
            <FeatureCard
              icon={<img src="/icons/graphup.png" alt="" className="w-12 h-12 rounded-lg object-contain" />}
              title="Live Charts"
              description="Real-time price charts, volume analysis, and trade markers."
            />
          </div>

          <div className="grid md:grid-cols-3 gap-6 mt-6">
            <FeatureCard
              icon={<img src="/icons/robot.png" alt="" className="w-12 h-12 rounded-lg object-contain" />}
              title="Telegram Bot"
              description="Trade from Telegram. Snipe, boost volume, and manage wallets on the go."
            />
            <FeatureCard
              icon={<img src="/icons/shield.png" alt="" className="w-12 h-12 rounded-lg object-contain" />}
              title="Non-Custodial"
              description="Your keys, your coins. We never store or have access to your private keys."
            />
            <FeatureCard
              icon={<img src="/icons/settings.png" alt="" className="w-12 h-12 rounded-lg object-contain" />}
              title="Analytics"
              description="Track performance, P&L, and export detailed trade reports."
            />
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-20 px-4 bg-slate-900/50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Get Started in Minutes</h2>
            <p className="text-xl text-slate-400">Three simple steps to launch your market making operations</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <StepCard
              number="01"
              title="Clone & Configure"
              description="Clone the repo, install dependencies, and configure your environment with your RPC endpoints and wallet keys."
              code="git clone https://github.com/natebag/Trenchtools && pnpm install"
            />
            <StepCard
              number="02"
              title="Set Up Wallets"
              description="Import or generate wallets, configure your treasury, and set up automatic fund distribution rules."
              code="pnpm run setup:wallets"
            />
            <StepCard
              number="03"
              title="Launch Dashboard"
              description="Start the dashboard, connect to Solana mainnet or devnet, and begin your market making operations."
              code="pnpm run dev"
            />
          </div>
        </div>
      </section>

      {/* Dashboard Preview Section */}
      <section id="dashboard" className="py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Powerful Dashboard</h2>
            <p className="text-xl text-slate-400">Monitor everything from a single interface</p>
          </div>

          <div className="relative">
            {/* Dashboard Mockup */}
            <div className="glass rounded-2xl p-1 shadow-2xl shadow-emerald-500/10">
              <div className="bg-slate-900 rounded-xl overflow-hidden">
                {/* Window header */}
                <div className="flex items-center gap-2 px-4 py-3 bg-slate-800 border-b border-slate-700">
                  <div className="flex gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500" />
                    <div className="w-3 h-3 rounded-full bg-yellow-500" />
                    <div className="w-3 h-3 rounded-full bg-green-500" />
                  </div>
                  <div className="flex-1 text-center text-sm text-slate-500">TrenchTools Dashboard</div>
                </div>
                
                {/* Dashboard content mockup */}
                <div className="p-6 grid grid-cols-12 gap-4 min-h-[500px]">
                  {/* Sidebar */}
                  <div className="col-span-2 space-y-3">
                    {['Dashboard', 'Volume', 'Detection', 'Treasury', 'Settings'].map((item, i) => (
                      <div
                        key={item}
                        className={`px-3 py-2 rounded-lg text-sm ${i === 0 ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-500'}`}
                      >
                        {item}
                      </div>
                    ))}
                  </div>

                  {/* Main content */}
                  <div className="col-span-10 space-y-4">
                    {/* Stats row */}
                    <div className="grid grid-cols-4 gap-4">
                      {[
                        { label: 'Total Volume', value: '2.4M SOL', change: '+12.5%' },
                        { label: 'Active Wallets', value: '156', change: '+8' },
                        { label: 'Detection Alerts', value: '3', change: '-2' },
                        { label: 'Treasury Balance', value: '45.2 SOL', change: '+1.2' },
                      ].map((stat) => (
                        <div key={stat.label} className="bg-slate-800/50 rounded-lg p-4">
                          <div className="text-slate-500 text-sm">{stat.label}</div>
                          <div className="text-2xl font-bold mt-1">{stat.value}</div>
                          <div className="text-emerald-400 text-sm">{stat.change}</div>
                        </div>
                      ))}
                    </div>

                    {/* Chart mockup */}
                    <div className="bg-slate-800/50 rounded-lg p-4 h-64">
                      <div className="flex items-center justify-between mb-4">
                        <span className="font-semibold">Activity Over Time</span>
                        <div className="flex gap-2 text-sm">
                          <span className="px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded">24H</span>
                          <span className="px-2 py-1 text-slate-500">7D</span>
                          <span className="px-2 py-1 text-slate-500">30D</span>
                        </div>
                      </div>
                      <div className="h-40 flex items-end gap-1">
                        {[40, 65, 45, 80, 55, 90, 70, 85, 60, 75, 95, 82, 68, 73, 88, 76, 92, 85, 78, 90].map((h, i) => (
                          <div
                            key={i}
                            className="flex-1 bg-gradient-to-t from-emerald-600 to-emerald-400 rounded-t opacity-80 hover:opacity-100 transition-opacity"
                            style={{ height: `${h}%` }}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Activity table mockup */}
                    <div className="bg-slate-800/50 rounded-lg p-4">
                      <div className="font-semibold mb-4">Recent Activity</div>
                      <div className="space-y-2">
                        {[
                          { action: 'Market making completed', time: '2 min ago', status: 'success' },
                          { action: 'Wallet rebalanced', time: '5 min ago', status: 'success' },
                          { action: 'Sniper detected', time: '12 min ago', status: 'warning' },
                        ].map((activity, i) => (
                          <div key={i} className="flex items-center justify-between py-2 border-b border-slate-700 last:border-0">
                            <span className="text-slate-300">{activity.action}</span>
                            <div className="flex items-center gap-4">
                              <span className="text-slate-500 text-sm">{activity.time}</span>
                              <span className={`w-2 h-2 rounded-full ${activity.status === 'success' ? 'bg-emerald-500' : 'bg-yellow-500'}`} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Open Source Section */}
      <section className="py-20 px-4 bg-gradient-to-b from-slate-950 to-emerald-950/20">
        <div className="max-w-4xl mx-auto text-center">
          <Github className="w-16 h-16 mx-auto mb-6 text-emerald-500" />
          <h2 className="text-4xl font-bold mb-4">Open Source Forever</h2>
          <p className="text-xl text-slate-400 mb-8">
            TrenchTools is 100% open source under the MIT license. Self-host for free, 
            or use our hosted service for just 0.5% per swap. No token gates, no VC bullshit.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
            <a
              href="https://github.com/natebag/Trenchtools"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 bg-white text-slate-900 hover:bg-slate-100 px-8 py-4 rounded-xl text-lg font-semibold transition-all hover:scale-105"
            >
              <Github className="w-5 h-5" />
              View on GitHub
              <ExternalLink className="w-4 h-4" />
            </a>
            <a
              href="https://github.com/natebag/Trenchtools/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 px-8 py-4 rounded-xl text-lg font-semibold transition-all hover:scale-105"
            >
              Report Issues
            </a>
          </div>

          <div className="grid md:grid-cols-3 gap-8 text-left">
            <div className="glass rounded-xl p-6">
              <h3 className="font-semibold text-lg mb-2">Contribute</h3>
              <p className="text-slate-400">
                PRs welcome! Check out our contributing guide and help make TrenchTools even better.
              </p>
            </div>
            <div className="glass rounded-xl p-6">
              <h3 className="font-semibold text-lg mb-2">Self-Host</h3>
              <p className="text-slate-400">
                Run on your own infrastructure. Your keys, your data, your rules. No external dependencies.
              </p>
            </div>
            <div className="glass rounded-xl p-6">
              <h3 className="font-semibold text-lg mb-2">MIT License</h3>
              <p className="text-slate-400">
                Fork it, modify it, sell it — do whatever you want. That's the beauty of open source.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 border-t border-slate-800">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-12">
            <div>
              <div className="flex items-center mb-4">
                <img src="/logo.png" alt="TrenchTools" className="h-8 w-auto" />
              </div>
              <p className="text-slate-400 text-sm">
                Open-source Solana trading suite. Built for degens, by degens.
              </p>
            </div>
            
            <div>
              <h4 className="font-semibold mb-4">Product</h4>
              <ul className="space-y-2 text-slate-400">
                <li><a href="#features" className="hover:text-white transition-colors">Features</a></li>
                <li><a href="#how-it-works" className="hover:text-white transition-colors">How it Works</a></li>
                <li><a href="#dashboard" className="hover:text-white transition-colors">Dashboard</a></li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-semibold mb-4">Resources</h4>
              <ul className="space-y-2 text-slate-400">
                <li>
                  <a href="https://github.com/natebag/Trenchtools" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
                    GitHub
                  </a>
                </li>
                <li>
                  <a href="https://docs.trenchtools.io" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
                    Documentation
                  </a>
                </li>
                <li>
                  <a href="https://github.com/natebag/Trenchtools/blob/main/CONTRIBUTING.md" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
                    Contributing
                  </a>
                </li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-semibold mb-4">Community</h4>
              <div className="flex gap-4">
                <a
                  href="https://github.com/natebag/Trenchtools"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-10 h-10 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center transition-colors"
                >
                  <Github className="w-5 h-5" />
                </a>
                <a
                  href="https://twitter.com/trenchtools"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-10 h-10 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center transition-colors"
                >
                  <Twitter className="w-5 h-5" />
                </a>
              </div>
            </div>
          </div>
          
          <div className="pt-8 border-t border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-slate-500 text-sm">
              © {new Date().getFullYear()} TrenchTools. Open source under MIT License.
            </p>
            <p className="text-slate-500 text-sm">
              Made with ❤️ for the Solana community
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}

interface FeatureCardProps {
  icon: React.ReactNode
  title: string
  description: string
}

function FeatureCard({ icon, title, description }: FeatureCardProps) {
  return (
    <div className="glass rounded-xl p-6 hover:border-emerald-500/50 transition-all group">
      <div className="w-12 h-12 rounded-lg overflow-hidden flex items-center justify-center text-emerald-500 mb-4 group-hover:scale-110 transition-transform">
        {icon}
      </div>
      <h3 className="text-xl font-semibold mb-2">{title}</h3>
      <p className="text-slate-400">{description}</p>
    </div>
  )
}

interface StepCardProps {
  number: string
  title: string
  description: string
  code: string
}

function StepCard({ number, title, description, code }: StepCardProps) {
  return (
    <div className="relative">
      <div className="text-6xl font-bold text-emerald-500/20 mb-4">{number}</div>
      <h3 className="text-xl font-semibold mb-2">{title}</h3>
      <p className="text-slate-400 mb-4">{description}</p>
      <div className="bg-slate-800 rounded-lg p-3 font-mono text-sm text-emerald-400 overflow-x-auto">
        <code>{code}</code>
      </div>
    </div>
  )
}

export default App
