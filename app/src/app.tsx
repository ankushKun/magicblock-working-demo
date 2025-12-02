import ThemeToggle from "@/components/theme-toggle"
import { WalletButton } from "@/components/WalletButton"
import { GameBoard } from "@/components/GameBoard"
import { Toaster } from "@/components/ui/sonner"

function App() {
  return (
    <div className="flex min-h-svh flex-col">
      <WalletButton />
      <ThemeToggle />
      <GameBoard />
      <Toaster />
    </div>
  )
}

export default App