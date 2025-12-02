import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Check, Loader2, Copy } from "lucide-react";
import { Connection, LAMPORTS_PER_SOL, Keypair } from "@solana/web3.js";
import { toast } from "sonner";

interface SessionKeySetupDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onComplete: () => void;
    createSessionKey: () => Promise<Keypair | null>;
    registerSessionKey: () => Promise<boolean>;
    fundSessionKey: () => Promise<boolean>;
    connection: Connection;
}

const STEPS = [
    {
        title: "Create Session Key",
        description: "Sign a message to generate your deterministic session key. This key will be the same across all your devices.",
    },
    {
        title: "Register On-Chain",
        description: "Register your session key with the program on Ephemeral Rollup. This allows the key to act on your behalf.",
    },
    {
        title: "Fund Session Key",
        description: "Transfer 0.01 SOL to your session key so it can pay for transaction fees.",
    },
];

export function SessionKeySetupDialog({
    open,
    onOpenChange,
    onComplete,
    createSessionKey,
    registerSessionKey,
    fundSessionKey,
    connection,
}: SessionKeySetupDialogProps) {
    const [currentStep, setCurrentStep] = useState(0);
    const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sessionKeyPubkey, setSessionKeyPubkey] = useState<string | null>(null);
    const [sessionKeyBalance, setSessionKeyBalance] = useState<number>(0);

    // Fetch balance when session key is created
    useEffect(() => {
        if (sessionKeyPubkey && connection) {
            fetchBalance();
            const interval = setInterval(fetchBalance, 2000); // Update every 2 seconds
            return () => clearInterval(interval);
        }
    }, [sessionKeyPubkey, connection]);

    const fetchBalance = async () => {
        if (!sessionKeyPubkey || !connection) return;
        try {
            const balance = await connection.getBalance(new (await import("@solana/web3.js")).PublicKey(sessionKeyPubkey));
            setSessionKeyBalance(balance / LAMPORTS_PER_SOL);
        } catch (error) {
            console.error("Error fetching balance:", error);
        }
    };

    const copyAddress = () => {
        if (sessionKeyPubkey) {
            navigator.clipboard.writeText(sessionKeyPubkey);
            toast.success("Address copied to clipboard");
        }
    };

    const handleNext = async () => {
        setLoading(true);
        setError(null);

        try {
            if (currentStep === 0) {
                // Step 1: Create session key
                const key = await createSessionKey();
                if (!key) {
                    setError("Failed to create session key");
                    setLoading(false);
                    return;
                }
                setSessionKeyPubkey(key.publicKey.toString());
                setCompletedSteps(new Set([...completedSteps, 0]));
                setCurrentStep(1);
            } else if (currentStep === 1) {
                // Step 2: Register on-chain
                const success = await registerSessionKey();
                if (!success) {
                    setError("Failed to register session key");
                    setLoading(false);
                    return;
                }
                setCompletedSteps(new Set([...completedSteps, 1]));
                setCurrentStep(2);
            } else if (currentStep === 2) {
                // Step 3: Fund session key
                const success = await fundSessionKey();
                if (!success) {
                    setError("Failed to fund session key");
                    setLoading(false);
                    return;
                }
                setCompletedSteps(new Set([...completedSteps, 2]));

                // Wait a moment to show completion
                setTimeout(() => {
                    onComplete();
                    handleClose();
                }, 1500);
            }
        } catch (err: any) {
            setError(err.message || "An error occurred");
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        setCurrentStep(0);
        setCompletedSteps(new Set());
        setError(null);
        setSessionKeyPubkey(null);
        setSessionKeyBalance(0);
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Enable Session Keys</DialogTitle>
                    <DialogDescription>
                        Follow these steps to enable gasless, approval-free transactions on Ephemeral Rollup
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {sessionKeyPubkey && (
                        <div className="p-4 bg-muted rounded-lg space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-medium">Session Key Address</span>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={copyAddress}
                                    className="h-6 px-2"
                                >
                                    <Copy className="h-3 w-3 mr-1" />
                                    Copy
                                </Button>
                            </div>
                            <code className="text-xs break-all block">{sessionKeyPubkey}</code>
                            <div className="flex justify-between items-center pt-2 border-t">
                                <span className="text-sm text-muted-foreground">Balance</span>
                                <span className="text-sm font-medium">{sessionKeyBalance.toFixed(4)} SOL</span>
                            </div>
                        </div>
                    )}

                    {STEPS.map((step, index) => {
                        const isCompleted = completedSteps.has(index);
                        const isCurrent = currentStep === index;
                        const isUpcoming = index > currentStep;

                        return (
                            <div
                                key={index}
                                className={`flex items-start gap-4 p-4 rounded-lg border transition-all ${isCompleted
                                    ? "bg-green-500/10 border-green-500/50"
                                    : isCurrent
                                        ? "bg-primary/10 border-primary"
                                        : "bg-muted border-muted-foreground/20 opacity-50"
                                    }`}
                            >
                                <div
                                    className={`flex items-center justify-center w-8 h-8 rounded-full shrink-0 ${isCompleted
                                        ? "bg-green-500 text-white"
                                        : isCurrent
                                            ? "bg-primary text-primary-foreground"
                                            : "bg-muted-foreground/20 text-muted-foreground"
                                        }`}
                                >
                                    {isCompleted ? (
                                        <Check className="h-5 w-5" />
                                    ) : (
                                        <span className="font-semibold">{index + 1}</span>
                                    )}
                                </div>

                                <div className="flex-1">
                                    <h4 className="font-semibold mb-1">{step.title}</h4>
                                    <p className="text-sm text-muted-foreground">{step.description}</p>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {error && (
                    <div className="p-3 bg-red-500/10 border border-red-500/50 rounded-lg">
                        <p className="text-sm text-red-500">{error}</p>
                    </div>
                )}

                <div className="flex justify-between gap-2">
                    <Button variant="outline" onClick={handleClose} disabled={loading}>
                        Cancel
                    </Button>

                    <div className="flex gap-2">
                        {currentStep === 2 && sessionKeyBalance >= 0.01 && (
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setCompletedSteps(new Set([...completedSteps, 2]));
                                    setTimeout(() => {
                                        onComplete();
                                        handleClose();
                                    }, 500);
                                }}
                                disabled={loading}
                            >
                                Skip (Already Funded)
                            </Button>
                        )}

                        {currentStep < 3 && (
                            <Button onClick={handleNext} disabled={loading}>
                                {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                {currentStep === 0 ? "Create Key" : currentStep === 1 ? "Register" : "Fund"}
                            </Button>
                        )}

                        {currentStep === 3 && completedSteps.has(2) && (
                            <Button onClick={handleClose} variant="default">
                                Done
                            </Button>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
