import React, { useEffect } from 'react';
import { useSettingsStore } from '../store/settingsStore';

const AboutUs = () => {
    const { settings, fetchSettings } = useSettingsStore();

    useEffect(() => {
        fetchSettings();
    }, [fetchSettings]);

    return (
        <div className="min-h-screen bg-[#0a0a0a] text-white p-8 font-sans">
            <div className="max-w-3xl mx-auto bg-[#1a1a1a] rounded-2xl p-10 shadow-2xl border border-white/5">
                <h1 className="text-4xl font-bold mb-8 bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
                    Бидний тухай
                </h1>

                <div className="space-y-6 text-gray-300 leading-relaxed min-h-[200px]">
                    {settings?.aboutUs ? (
                        <div className="whitespace-pre-wrap">{settings.aboutUs}</div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-2">
                            <p>Одоогоор мэдээлэл оруулаагүй байна.</p>
                        </div>
                    )}
                </div>

                <div className="mt-12 pt-8 border-t border-white/5 text-sm text-gray-500">
                    Сүүлд шинэчлэгдсэн: {new Date().toLocaleDateString()}
                </div>
            </div>
        </div>
    );
};

export default AboutUs;
