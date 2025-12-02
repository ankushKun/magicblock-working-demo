import { createRoot } from 'react-dom/client'
import './index.css'
import App from './app.tsx'
import { ThemeProvider } from "@/components/theme-provider"
import { WalletProvider } from "@/contexts/WalletProvider"
import { Buffer } from 'buffer'

// Polyfill Buffer for browser
window.Buffer = Buffer

createRoot(document.getElementById('root')!).render(
  <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
    <WalletProvider>
      <App />
    </WalletProvider>
  </ThemeProvider>
)
