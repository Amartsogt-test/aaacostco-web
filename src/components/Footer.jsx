import { useSettingsStore } from '../store/settingsStore';
import { useEffect } from 'react';

export default function Footer() {
    const { fetchSettings } = useSettingsStore();

    useEffect(() => {
        fetchSettings();
    }, [fetchSettings]);

    return (
        <footer className="bg-gray-100 border-t mt-auto">
            <div className="container mx-auto px-4 py-8 text-sm text-gray-600">
                <div className="flex flex-col md:flex-row justify-between gap-6">
                    {/* Company Info */}
                    <div>
                        <h3 className="font-bold text-gray-900 mb-2">AAA Costco Mongolia</h3>
                        <p className="text-gray-500 max-w-xs">
                            Costco бараа бүтээгдэхүүнийг Монголд хүргэж буй албан ёсны дэлгүүр.
                        </p>
                    </div>

                    {/* Contact */}
                    <div>
                        <h3 className="font-bold text-gray-900 mb-2">Холбоо барих</h3>
                        <ul className="space-y-1 text-gray-500">
                            <li>📱 Утас: +976 8008-0088</li>
                            <li>📧 И-мэйл: info@costco.mn</li>
                            <li>🕐 Даваа-Баасан: 09:00 - 18:00</li>
                        </ul>
                    </div>

                    {/* Social */}
                    <div>
                        <h3 className="font-bold text-gray-900 mb-2">Бидэнтэй нэгдэх</h3>
                        <div className="flex gap-3">
                            <a
                                href="https://www.facebook.com/aaacostco"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-gray-400 hover:text-blue-600 transition-colors"
                            >
                                Facebook
                            </a>
                            <a
                                href="https://www.instagram.com/aaacostco"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-gray-400 hover:text-pink-500 transition-colors"
                            >
                                Instagram
                            </a>
                        </div>
                    </div>
                </div>

                {/* Bottom bar */}
                <div className="border-t mt-6 pt-4 flex flex-col md:flex-row justify-between items-center gap-2 text-xs text-gray-400">
                    <span>© {new Date().getFullYear()} AAA Costco Mongolia. Бүх эрх хуулиар хамгаалагдсан.</span>
                    <div className="flex gap-4">
                        <a href="/privacy" className="hover:text-gray-600">Нууцлалын бодлого</a>
                        <a href="/terms" className="hover:text-gray-600">Үйлчилгээний нөхцөл</a>
                    </div>
                </div>
            </div>
        </footer>
    );
}
