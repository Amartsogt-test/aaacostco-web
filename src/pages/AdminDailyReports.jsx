
import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, doc, getDoc, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { Calendar, ChevronDown, ChevronUp, Package, Tag, Scale, Globe, FileText, AlertCircle } from 'lucide-react';

const AdminDailyReports = () => {
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState(false);
    const [availableDates, setAvailableDates] = useState([]);

    // Fetch available dates on mount
    useEffect(() => {
        const fetchDates = async () => {
            const q = query(collection(db, 'daily_reports'), orderBy('date', 'desc'), limit(30));
            const snap = await getDocs(q);
            const dates = snap.docs.map(d => d.id);
            setAvailableDates(dates);
        };
        fetchDates();
    }, []);

    // Fetch specific report
    useEffect(() => {
        const fetchReport = async () => {
            setLoading(true);
            try {
                const docRef = doc(db, 'daily_reports', selectedDate);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    setReport(docSnap.data());
                } else {
                    setReport(null);
                }
            } catch (error) {
                console.error("Error fetching report:", error);
            } finally {
                setLoading(false);
            }
        };
        if (selectedDate) fetchReport();
    }, [selectedDate]);

    return (
        <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Өдөр Тутмын Тайлан</h1>
                    <p className="text-gray-500">Системийн хийсэн засвар болон шинэ барааны мэдээлэл</p>
                </div>

                <div className="flex items-center gap-2 bg-white p-2 rounded-xl border border-gray-200 shadow-sm">
                    <Calendar size={20} className="text-gray-400" />
                    <select
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="bg-transparent text-gray-700 font-medium focus:outline-none"
                    >
                        {availableDates.length > 0 ? (
                            availableDates.map(date => (
                                <option key={date} value={date}>{date}</option>
                            ))
                        ) : (
                            <option value={selectedDate}>{selectedDate}</option>
                        )}
                    </select>
                </div>
            </div>

            {loading ? (
                <div className="h-64 flex items-center justify-center text-gray-400">Уншиж байна...</div>
            ) : !report ? (
                <div className="h-64 flex flex-col items-center justify-center text-gray-400 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                    <AlertCircle size={48} className="mb-2 opacity-20" />
                    <p>Тайлан олдсонгүй ({selectedDate})</p>
                </div>
            ) : (
                <div className="space-y-6">
                    {/* Summary Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <StatCard icon={<Package className="text-blue-500" />} label="Шалгасан" value={report.stats.processed} color="blue" />
                        <StatCard icon={<Tag className="text-green-500" />} label="Шинэ Бараа" value={report.stats.newProductsCount} color="green" />
                        <StatCard icon={<AlertCircle className="text-orange-500" />} label="Идэвхтэй Хямдрал" value={report.stats.activeSalesCount} color="orange" />
                        <StatCard icon={<FileText className="text-purple-500" />} label="AI Засвар" value={report.stats.updated} color="purple" />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* New Products List */}
                        <ListSection
                            title="Шинэ Бараа"
                            count={report.stats.newProductsCount}
                            items={report.lists.newProducts}
                            icon={<Package size={18} />}
                            renderItem={(item) => (
                                <div key={item.id} className="flex justify-between items-start py-2 border-b border-gray-50 last:border-0">
                                    <span className="text-sm text-gray-700 line-clamp-1 flex-1">{item.name}</span>
                                    <span className="text-sm font-medium text-blue-600 ml-2">₮{item.price?.toLocaleString()}</span>
                                </div>
                            )}
                        />

                        {/* Active Sales List */}
                        <ListSection
                            title="Идэвхтэй Хямдрал"
                            count={report.stats.activeSalesCount}
                            items={report.lists.activeSales}
                            icon={<Tag size={18} />}
                            renderItem={(item) => (
                                <div key={item.id} className="flex justify-between items-start py-2 border-b border-gray-50 last:border-0">
                                    <span className="text-sm text-gray-700 line-clamp-1 flex-1">{item.name}</span>
                                    <div className="text-right ml-2">
                                        <div className="text-sm font-bold text-red-500">₮{item.price?.toLocaleString()}</div>
                                        {item.oldPrice && (
                                            <div className="text-xs text-gray-400 line-through">₮{item.oldPrice?.toLocaleString()}</div>
                                        )}
                                    </div>
                                </div>
                            )}
                        />
                    </div>

                    {/* AI Fixes Details */}
                    {report.stats.updated > 0 && (
                        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                            <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
                                <FileText size={18} className="text-purple-600" />
                                <h3 className="font-bold text-gray-800">AI Засварын Дэлгэрэнгүй</h3>
                            </div>
                            <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-6">
                                <DetailGroup title="Жин (Weights)" items={report.lists.fixedWeights} icon={<Scale size={14} />} />
                                <DetailGroup title="Орчуулга (Translations)" items={report.lists.fixedTranslations} icon={<Globe size={14} />} />
                                <DetailGroup title="Тайлбар (Descriptions)" items={report.lists.fixedDescriptions} icon={<FileText size={14} />} />
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// Helper Components
const StatCard = ({ icon, label, value, color }) => (
    <div className={`bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-3`}>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-${color}-50`}>
            {icon}
        </div>
        <div>
            <div className="text-2xl font-bold text-gray-900">{value}</div>
            <div className="text-xs text-gray-500">{label}</div>
        </div>
    </div>
);

const ListSection = ({ title, count, items, icon, renderItem }) => (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden flex flex-col h-96">
        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
            <div className="flex items-center gap-2">
                <span className="text-gray-600">{icon}</span>
                <h3 className="font-bold text-gray-800">{title}</h3>
            </div>
            <span className="bg-gray-200 text-gray-600 text-xs px-2 py-1 rounded-full">{count}</span>
        </div>
        <div className="p-4 overflow-y-auto flex-1 custom-scrollbar">
            {items && items.length > 0 ? (
                items.map(renderItem)
            ) : (
                <div className="text-center text-gray-400 py-8 text-sm">Мэдээлэл алга</div>
            )}
        </div>
    </div>
);

const DetailGroup = ({ title, items, icon }) => (
    <div>
        <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-gray-600 uppercase tracking-wider">
            {icon} {title} <span className="text-gray-400 font-normal">({items?.length || 0})</span>
        </div>
        <div className="bg-gray-50 rounded-xl p-3 h-64 overflow-y-auto border border-gray-100">
            {items && items.length > 0 ? (
                <div className="space-y-2">
                    {items.map((item, i) => (
                        <div key={i} className="text-xs text-gray-600 border-b border-gray-200 pb-1 last:border-0 last:pb-0">
                            {item.name}
                            {item.result && <span className="block font-medium text-green-600">➜ {item.result}kg</span>}
                        </div>
                    ))}
                </div>
            ) : (
                <div className="text-center text-gray-400 py-4 text-xs">Өөрчлөлт алга</div>
            )}
        </div>
    </div>
);

export default AdminDailyReports;
