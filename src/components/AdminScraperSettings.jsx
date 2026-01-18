import { useState, useEffect } from 'react';
import { Save, AlertCircle, Key } from 'lucide-react';
import { settingsService } from '../services/settingsService';
import { useUIStore } from '../store/uiStore';

export default function AdminScraperSettings() {
    const [cookie, setCookie] = useState('');
    const [userAgent, setUserAgent] = useState('');
    const [loading, setLoading] = useState(false);
    const { showToast } = useUIStore();

    useEffect(() => {
        fetchSettings();
        // Auto-capture current browser's UA
        setUserAgent(window.navigator.userAgent);
    }, []);

    const fetchSettings = async () => {
        try {
            const data = await settingsService.getScraperSettings();
            if (data) {
                setCookie(data.cookie || '');
                // If saved UA exists, showing it might be confusing if it differs from current.
                // But for debug, let's keep current browser UA as the one we want to save.
            }
        } catch (error) {
            console.error("Error fetching scraper settings:", error);
            showToast('Тохиргоо уншихад алдаа гарлаа', 'error');
        }
    };

    const handleSave = async () => {
        setLoading(true);
        try {
            await settingsService.updateScraperSettings({
                cookie: cookie,
                userAgent: userAgent, // Save current UA
                updatedAt: new Date().toISOString()
            });
            showToast('Амжилттай хадгалагдлаа', 'success');
        } catch (error) {
            console.error("Error saving scraper settings:", error);
            showToast('Хадгалахад алдаа гарлаа', 'error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-6">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 flex items-start gap-3">
                <AlertCircle className="text-blue-600 shrink-0 mt-0.5" size={20} />
                <div className="text-sm text-blue-800">
                    <p className="font-bold mb-1">Costco.co.kr Session Cookie</p>
                    <p>
                        Гишүүнчлэл шаардлагатай (Member Only) барааны үнийг татахын тулд таны нэвтэрсэн мэдээлэл хэрэгтэй.
                        Browser-ын Developer Tools &rarr; Network хэсгээс <code>Cookie</code> утгыг хуулж энд оруулна уу.
                    </p>
                </div>
            </div>

            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                        <Key size={16} />
                        Cookie Value
                    </label>
                    <textarea
                        value={cookie}
                        onChange={(e) => setCookie(e.target.value)}
                        placeholder="JSESSIONID=...; accstorefront=...;"
                        className="w-full h-32 px-4 py-3 rounded-xl border border-gray-200 focus:border-costco-blue focus:ring-2 focus:ring-costco-blue/20 outline-none transition font-mono text-xs"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Detected User Agent (Auto-filled)
                    </label>
                    <div className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-600 font-mono break-all">
                        {userAgent || 'Detecting...'}
                    </div>
                </div>

                <div className="flex justify-end pt-4">
                    <button
                        onClick={handleSave}
                        disabled={loading}
                        className="flex items-center gap-2 px-6 py-2.5 bg-costco-blue text-white rounded-xl font-bold hover:bg-blue-700 transition disabled:opacity-50"
                    >
                        <Save size={18} />
                        {loading ? 'Хадгалж байна...' : 'Хадгалах'}
                    </button>
                </div>
            </div>
        </div>
    );
}
