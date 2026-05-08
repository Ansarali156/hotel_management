import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface PwaInstallButtonProps {
  variant?: 'hotel' | 'police';
  className?: string;
}

export function PwaInstallButton({ variant = 'hotel', className = '' }: PwaInstallButtonProps) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const appInstalledHandler = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', appInstalledHandler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', appInstalledHandler);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) {
      // Fallback instructions for iOS/browsers that don't support the API
      const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
      const isAndroid = /Android/.test(navigator.userAgent);
      
      let instructions = 'To install this app:\n\n';
      
      if (isIOS) {
        instructions += '1. Tap the Share button (square with arrow)\n2. Scroll down and tap "Add to Home Screen"\n3. Tap "Add" to confirm';
      } else if (isAndroid) {
        instructions += '1. Tap the menu (⋮) in your browser\n2. Select "Add to Home screen"\n3. Tap "Add" to confirm';
      } else {
        instructions += '1. Look for the install icon in your browser\'s address bar\n2. Or use your browser\'s menu to "Install app"';
      }
      
      alert(instructions);
      return;
    }

    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      
      if (outcome === 'accepted') {
        // installed successfully
      }
    } catch {
      // install failed — non-fatal
    } finally {
      setDeferredPrompt(null);
    }
  };

  // Don't show if already installed
  if (isInstalled) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <span className="material-symbols-outlined text-green-600 icon-fill text-xl">
          check_circle
        </span>
        <span className="text-sm text-gray-600 font-medium">App Installed</span>
      </div>
    );
  }

  const bgColor = variant === 'police' ? 'bg-blue-900 hover:bg-blue-950' : 'bg-emerald-800 hover:bg-emerald-900';

  return (
    <button
      onClick={handleInstall}
      className={`inline-flex items-center gap-2 ${bgColor} text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-all shadow-md hover:shadow-lg active:scale-95 ${className}`}
    >
      <span className="material-symbols-outlined text-lg">
        install_mobile
      </span>
      <span>Install App</span>
    </button>
  );
}
