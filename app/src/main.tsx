import { createRoot } from 'react-dom/client'
import './index.css'
import App from './app.tsx'
import { ThemeProvider } from "@/components/theme-provider"
import { WalletProvider } from "@/contexts/WalletProvider"

createRoot(document.getElementById('root')!).render(
  <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
    <WalletProvider>
      <App />
    </WalletProvider>
  </ThemeProvider>
)
