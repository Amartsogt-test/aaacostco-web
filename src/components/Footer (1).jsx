import buildInfo from '../buildInfo.json';
import { useSettingsStore } from '../store/settingsStore'; // Import Store
import { useEffect } from 'react';

export default function Footer() {
    const { settings, fetchSettings } = useSettingsStore();

    useEffect(() => {
        fetchSettings();
    }, [fetchSettings]);

    return (
        <footer className="bg-gray-100 border-t mt-auto">
            <div className="container mx-auto px-4 py-6 pb-6 text-sm text-gray-600">
                <div className="flex flex-wrap gap-x-16 gap-y-4">
                </div>
            </div>
        </footer>
    );
}
