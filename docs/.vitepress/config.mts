import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'stoa Docs',
  description: 'Commerce for humans and agents.',
  cleanUrls: true,
  ignoreDeadLinks: true,
  base: '/docs',

  head: [
    ['link', { rel: 'icon', href: '/favicon.ico' }]
  ],

  themeConfig: {
    logo: '/logo.svg',
    siteTitle: 'stoa docs',

    nav: [
      { text: 'Guide', link: '/guide/introduction' },
      { text: 'API', link: '/api/overview' },
      { text: 'Plugins', link: '/plugins/overview' },
      { text: 'MCP', link: '/mcp/overview' },
      {
        text: 'v0.3.0',
        items: [
          { text: 'Changelog', link: '/changelog' },
          { text: 'GitHub', link: 'https://github.com/stoa-hq/stoa' }
        ]
      }
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Getting Started',
          items: [
            { text: 'Introduction', link: '/guide/introduction' },
            { text: 'Quick Start', link: '/guide/quick-start' },
            { text: 'Configuration', link: '/guide/configuration' },
            { text: 'Self-Hosting', link: '/guide/self-hosting' },
          ]
        },
        {
          text: 'Core Concepts',
          items: [
            { text: 'Architecture', link: '/guide/architecture' },
            { text: 'Products & Variants', link: '/guide/products' },
            { text: 'Orders', link: '/guide/orders' },
            { text: 'Customers', link: '/guide/customers' },
            { text: 'Warehouses & Stock', link: '/guide/warehouses' },
            { text: 'Media', link: '/guide/media' },
            { text: 'Search', link: '/guide/search' },
          ]
        },
        {
          text: 'Admin Panel',
          items: [
            { text: 'Overview', link: '/guide/admin' },
            { text: 'Demo Storefront', link: '/guide/storefront' },
          ]
        },
        {
          text: 'Security',
          items: [
            { text: 'Overview', link: '/guide/security' },
          ]
        }
      ],

      '/api/': [
        {
          text: 'REST API',
          items: [
            { text: 'Overview', link: '/api/overview' },
            { text: 'Authentication', link: '/api/authentication' },
            { text: 'Products', link: '/api/products' },
            { text: 'Orders', link: '/api/orders' },
            { text: 'Customers', link: '/api/customers' },
            { text: 'Cart', link: '/api/cart' },
            { text: 'Warehouses', link: '/api/warehouses' },
            { text: 'Error Handling', link: '/api/error-handling' },
          ]
        }
      ],

      '/plugins/': [
        {
          text: 'Plugin System',
          items: [
            { text: 'Overview', link: '/plugins/overview' },
            { text: 'Installing Plugins', link: '/plugins/installing' },
            { text: 'Docker Installation', link: '/plugins/docker-installation' },
            { text: 'Creating a Plugin', link: '/plugins/creating' },
            { text: 'Plugin API', link: '/plugins/api' },
            { text: 'UI Extensions', link: '/plugins/ui-extensions' },
            { text: 'Payment Providers', link: '/plugins/payment' },
            { text: 'Shipping Providers', link: '/plugins/shipping' },
            { text: 'n8n Workflows', link: '/plugins/n8n' },
            { text: 'Stripe Payments', link: '/plugins/stripe' },
            { text: 'Meilisearch Search', link: '/plugins/meilisearch' },
          ]
        }
      ],

      '/mcp/': [
        {
          text: 'MCP',
          items: [
            { text: 'Overview', link: '/mcp/overview' },
            { text: 'Setup', link: '/mcp/setup' },
            { text: 'Available Tools', link: '/mcp/tools' },
            { text: 'Agent Examples', link: '/mcp/examples' },
          ]
        }
      ]
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/stoa-hq/stoa' }
    ],

    footer: {
      message: 'Released under the APACHE 2.0 License.',
      copyright: 'Copyright © 2025 Stoa Contributors'
    },

    search: {
      provider: 'local'
    }
  }
})
