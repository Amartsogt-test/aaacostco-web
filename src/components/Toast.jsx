import { useEffect } from 'react';
import { X, AlertCircle, CheckCircle, Info, AlertTriangle } from 'lucide-react';
import { useUIStore } from '../store/uiStore';

export default function Toast() {
    const { toast, hideToast } = useUIStore();

    useEffect(() => {
        if (toast) {
            const timer = setTimeout(() => {
                hideToast();
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [toast, hideToast]);

    if (!toast) return null;

    const icons = {
        success: <CheckCircle className="text-green-500" size={20} />,
        error: <AlertCircle className="text-red-500" size={20} />,
        warning: <AlertTriangle className="text-yellow-500" size={20} />,
        info: <Info className="text-blue-500" size={20} />
    };

    const bgColors = {
        success: 'bg-green-50 border-green-200',
        error: 'bg-red-50 border-red-200',
        warning: 'bg-yellow-50 border-yellow-200',
        info: 'bg-blue-50 border-blue-200'
    };

    return (
        <div className="fixed top-24 right-4 z-[60] animate-slide-in">
            <div className={`flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg border ${bgColors[toast.type] || bgColors.info} min-w-[300px]`}>
                {icons[toast.type] || icons.info}
                <p className="text-sm font-medium text-gray-800 flex-1">{toast.message}</p>
                <button onClick={hideToast} className="text-gray-400 hover:text-gray-600">
                    <X size={16} />
                </button>
            </div>
        </div>
    );
}
