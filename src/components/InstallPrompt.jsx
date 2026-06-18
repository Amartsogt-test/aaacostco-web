import React, { useState, useEffect } from 'react';
import { Download, X, Share, PlusSquare } from 'lucide-react';

export default function InstallPrompt() {
    const [deferredPrompt, setDeferredPrompt] = useState(null);
    const [isIOS] = useState(() => {
        const userAgent = window.navigator.userAgent.toLowerCase();
        const isIOSDevice = /iphone|ipad|ipod/.test(userAgent);
        return isIOSDevice && /safari/.test(userAgent) && !/chrome|crios|fxios/.test(userAgent);
    });
    // Computed once at init (no setState-in-effect) so it never blinks.
    const [isStandalone] = useState(
        () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
    );
    const [showPrompt, setShowPrompt] = useState(false);

    useEffect(() => {
        // 1. Already installed → nothing to prompt.
        if (isStandalone) return;

        // 2. Check if user dismissed it recently (last 7 days)
        const dismissedAt = localStorage.getItem('installPromptDismissed');
        if (dismissedAt) {
            const daysSinceDismissed = (Date.now() - parseInt(dismissedAt)) / (1000 * 60 * 60 * 24);
            if (daysSinceDismissed < 7) {
                return; // Hide if dismissed in the last 7 days
            }
        }

        // 3. Android/Chrome Install Prompt
        const handleBeforeInstallPrompt = (e) => {
            e.preventDefault();
            setDeferredPrompt(e);
            setShowPrompt(true);
        };
        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

        // 4. iOS Safari Check
        let timer;
        if (isIOS) {
            // Delay slightly so it doesn't pop up instantly on first load
            timer = setTimeout(() => setShowPrompt(true), 3000); 
        }

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
            if (timer) clearTimeout(timer);
        };
    }, [isStandalone, isIOS]);

    const handleInstallClick = async () => {
        if (!deferredPrompt) return;
        
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        
        if (outcome === 'accepted') {
            setShowPrompt(false);
        }
        setDeferredPrompt(null);
    };

    const handleDismiss = () => {
        setShowPrompt(false);
        localStorage.setItem('installPromptDismissed', Date.now().toString());
    };

    if (!showPrompt || isStandalone) return null;

    return (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 w-[90%] max-w-sm bg-white rounded-2xl shadow-2xl border border-gray-100 p-4 z-[100] animate-in slide-in-from-bottom-5 fade-in duration-300">
            <button
                onClick={handleDismiss}
                aria-label="Хаах"
                className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 p-1 rounded-full bg-gray-50"
            >
                <X className="w-4 h-4" />
            </button>

            <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Download className="w-6 h-6 text-blue-600" />
                </div>
                <div className="flex-1">
                    <h3 className="font-bold text-gray-900 text-sm">Апп болгож суулгах</h3>
                    <p className="text-xs text-gray-500 mt-1 mb-3 leading-relaxed">
                        Утсандаа суулгаад хэзээ ч хаанаас ч хурдан, хялбар хандаарай.
                    </p>
                    
                    {isIOS ? (
                        <div className="bg-gray-50 rounded-lg p-2 text-xs text-gray-600 flex items-center gap-2">
                            <span>Тусгай <b>Share</b> <Share className="w-3 h-3 inline mx-1" /> товчийг дараад <b>Add to Home Screen</b> <PlusSquare className="w-3 h-3 inline mx-1" /> сонгоорой.</span>
                        </div>
                    ) : (
                        <button 
                            onClick={handleInstallClick}
                            className="w-full bg-blue-600 text-white font-bold py-2 rounded-xl text-sm hover:bg-blue-700 transition active:scale-95"
                        >
                            Яг одоо суулгах
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
