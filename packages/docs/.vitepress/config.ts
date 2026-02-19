import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'TrenchTools',
  description: 'The Operating System for Solana Trench Warfare',
  lang: 'en-US',

  head: [
    ['link', { rel: 'icon', type: 'image/png', href: '/favicon.png' }],
    ['meta', { name: 'theme-color', content: '#10B981' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: 'TrenchTools Docs' }],
    ['meta', { property: 'og:description', content: 'Open-source market making and trading toolkit for Solana' }],
    ['meta', { property: 'og:url', content: 'https://docs.trenchtools.io' }],
  ],

  themeConfig: {
    logo: '/favicon.png',
    siteTitle: 'TrenchTools',

    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Features', link: '/features/sniper' },
      { text: 'Architecture', link: '/architecture/overview' },
      { text: 'API', link: '/api/dex-layer' },
      {
        text: 'Links',
        items: [
          { text: 'GitHub', link: 'https://github.com/natebag/Trenchtools' },
          { text: 'trenchtools.io', link: 'https://trenchtools.io' },
        ]
      }
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Introduction',
          items: [
            { text: 'What is TrenchTools?', link: '/guide/what-is-trenchtools' },
            { text: 'Getting Started', link: '/guide/getting-started' },
            { text: 'Configuration', link: '/guide/configuration' },
          ]
        },
        {
          text: 'Core Concepts',
          items: [
            { text: 'Wallet System', link: '/guide/wallets' },
            { text: 'DEX Auto-Routing', link: '/guide/dex-routing' },
            { text: 'Trade Recording', link: '/guide/trade-recording' },
          ]
        },
        {
          text: 'Deployment',
          items: [
            { text: 'Hosting & Railway', link: '/guide/deployment' },
          ]
        }
      ],
      '/features/': [
        {
          text: 'Features',
          items: [
            { text: 'Sniper', link: '/features/sniper' },
            { text: 'Market Making', link: '/features/volume' },
            { text: 'Bot Groups', link: '/features/bot-groups' },
            { text: 'Treasury & Wallets', link: '/features/treasury' },
            { text: 'P&L Analytics', link: '/features/pnl' },
            { text: 'Shield Scanner', link: '/features/shield' },
            { text: 'Whale Alerts', link: '/features/whale-alerts' },
            { text: 'Manipulation Detection', link: '/features/detection' },
            { text: 'Token Charts', link: '/features/charts' },
            { text: 'Activity Generator', link: '/features/activity' },
          ]
        }
      ],
      '/architecture/': [
        {
          text: 'Architecture',
          items: [
            { text: 'Overview', link: '/architecture/overview' },
            { text: 'Monorepo Structure', link: '/architecture/monorepo' },
            { text: 'Context Providers', link: '/architecture/contexts' },
            { text: 'Data Persistence', link: '/architecture/persistence' },
            { text: 'Security Model', link: '/architecture/security' },
          ]
        }
      ],
      '/api/': [
        {
          text: 'API Reference',
          items: [
            { text: 'DEX Layer', link: '/api/dex-layer' },
            { text: 'Wallet Manager', link: '/api/wallet-manager' },
            { text: 'Hooks', link: '/api/hooks' },
            { text: 'Core Package', link: '/api/core' },
          ]
        }
      ]
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/natebag/Trenchtools' },
    ],

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright 2024-present TrenchTools'
    },

    search: {
      provider: 'local'
    },

    editLink: {
      pattern: 'https://github.com/natebag/Trenchtools/edit/main/packages/docs/:path',
      text: 'Edit this page on GitHub'
    }
  }
})
