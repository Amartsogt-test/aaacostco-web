import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { giftCardService } from '../services/giftCardService';
import { useUIStore } from '../store/uiStore';
import { ArrowLeft, Plus, Search, Copy, Check, Filter, CreditCard, Gift, Loader2 } from 'lucide-react';

export default function AdminGiftCards() {
    const navigate = useNavigate();
    const { showToast } = useUIStore();
    const [cards, setCards] = useState([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);

    // Filter State
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');

    // Create Form State
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [formData, setFormData] = useState({
        amount: '',
        expiresDays: 365,
        recipientPhone: '',
        message: ''
    });

    useEffect(() => {
        fetchCards();
    }, []);

    const fetchCards = async () => {
        setLoading(true);
        try {
            const data = await giftCardService.getAllGiftCards();
            setCards(data);
        } catch (error) {
            console.error(error);
            showToast('Мэдээлэл татахад алдаа гарлаа', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        setCreating(true);
        try {
            const result = await giftCardService.createGiftCard({
                amount: Number(formData.amount),
                expiresDays: Number(formData.expiresDays),
                recipientPhone: formData.recipientPhone,
                message: formData.message,
                createdBy: 'Admin'
            });

            if (result.success) {
                showToast(`Gift Card амжилттай үүслээ! Код: ${result.code}`, 'success');
                setShowCreateForm(false);
                setFormData({ amount: '', expiresDays: 365, recipientPhone: '', message: '' });
                fetchCards();
            }
        } catch {
            showToast('Үүсгэхэд алдаа гарлаа', 'error');
        } finally {
            setCreating(false);
        }
    };

    const copyCode = (code) => {
        navigator.clipboard.writeText(code);
        showToast('Код хуулагдлаа', 'success');
    };

    // Filter Logic
    const filteredCards = cards.filter(card => {
        const matchesSearch =
            card.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (card.recipientPhone && card.recipientPhone.includes(searchTerm));

        const matchesStatus = statusFilter === 'all' || card.status === statusFilter;

        return matchesSearch && matchesStatus;
    });

    const totalActiveValue = cards
        .filter(c => c.status === 'active')
        .reduce((sum, c) => sum + c.balance, 0);

    return (
        <div className="min-h-screen bg-gray-50 pb-20">
            {/* Header */}
            <div className="bg-white border-b border-gray-100 px-4 py-4 sticky top-0 z-10 shadow-sm">
                <div className="container mx-auto max-w-4xl flex items-center justify-between gap-4">
                    <button onClick={() => navigate('/admin')} className="p-2 -ml-2 hover:bg-gray-100 rounded-full">
                        <ArrowLeft size={20} />
                    </button>
                    <h1 className="text-lg font-bold flex-1 flex items-center gap-2">
                        <Gift size={20} className="text-costco-blue" />
                        Digital Gift Cards
                    </h1>
                    <button
                        onClick={() => setShowCreateForm(!showCreateForm)}
                        className="bg-costco-blue text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-blue-700 transition"
                    >
                        <Plus size={16} />
                        Шинэ карт
                    </button>
                </div>
            </div>

            <div className="container mx-auto max-w-4xl px-4 py-6 space-y-6">

                {/* Stats Summary */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                        <div className="text-gray-500 text-xs uppercase font-bold">Нийт идэвхтэй дүн</div>
                        <div className="text-2xl font-bold text-green-600 mt-1">
                            {totalActiveValue.toLocaleString()}₮
                        </div>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                        <div className="text-gray-500 text-xs uppercase font-bold">Идэвхтэй карт</div>
                        <div className="text-2xl font-bold text-gray-800 mt-1">
                            {cards.filter(c => c.status === 'active').length}
                        </div>
                    </div>
                </div>

                {/* Create Form */}
                {showCreateForm && (
                    <div className="bg-white rounded-xl border border-blue-100 shadow-lg p-6 animate-in slide-in-from-top-4">
                        <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                            <Plus size={18} className="text-blue-500" /> Карт үүсгэх
                        </h3>
                        <form onSubmit={handleCreate} className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1">Мөнгөн дүн (₮)</label>
                                    <input
                                        type="number"
                                        required
                                        min="1000"
                                        value={formData.amount}
                                        onChange={e => setFormData({ ...formData, amount: e.target.value })}
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:border-costco-blue"
                                        placeholder="Жишээ: 50000"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1">Хүчинтэй хоног</label>
                                    <input
                                        type="number"
                                        required
                                        min="1"
                                        value={formData.expiresDays}
                                        onChange={e => setFormData({ ...formData, expiresDays: e.target.value })}
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:border-costco-blue"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">Хүлээн авах утас (Заавал биш)</label>
                                <input
                                    type="text"
                                    value={formData.recipientPhone}
                                    onChange={e => setFormData({ ...formData, recipientPhone: e.target.value })}
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:border-costco-blue"
                                    placeholder="88112233 - SMS илгээнэ (Mock)"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">Зурвас / Тайлбар</label>
                                <textarea
                                    rows="2"
                                    value={formData.message}
                                    onChange={e => setFormData({ ...formData, message: e.target.value })}
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:border-costco-blue"
                                    placeholder="Төрсөн өдрийн мэнд!"
                                />
                            </div>

                            <div className="flex justify-end gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowCreateForm(false)}
                                    className="px-4 py-2 rounded-lg text-gray-600 hover:bg-gray-100 font-semibold"
                                >
                                    Болих
                                </button>
                                <button
                                    type="submit"
                                    disabled={creating}
                                    className="px-6 py-2 bg-costco-blue text-white rounded-lg font-bold hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                                >
                                    {creating && <Loader2 size={16} className="animate-spin" />}
                                    Үүсгэх
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                {/* Filters */}
                <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input
                            type="text"
                            placeholder="Код эсвэл утсаар хайх..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-xl outline-none focus:border-costco-blue"
                        />
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-1 sm:pb-0">
                        {['all', 'active', 'fully_used', 'expired'].map(status => (
                            <button
                                key={status}
                                onClick={() => setStatusFilter(status)}
                                className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap border transition ${statusFilter === status
                                    ? 'bg-gray-800 text-white border-gray-800'
                                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                                    }`}
                            >
                                {status === 'all' && 'Бүгд'}
                                {status === 'active' && 'Идэвхтэй'}
                                {status === 'fully_used' && 'Дууссан'}
                                {status === 'expired' && 'Хугацаа дууссан'}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Cards List */}
                {loading ? (
                    <div className="py-20 flex justify-center">
                        <Loader2 className="animate-spin text-gray-400" size={32} />
                    </div>
                ) : (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 divide-y divide-gray-50 overflow-hidden">
                        {filteredCards.length === 0 ? (
                            <div className="p-10 text-center text-gray-400">
                                Илэрц олдсонгүй
                            </div>
                        ) : (
                            filteredCards.map(card => (
                                <div key={card.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-gray-50 transition">
                                    <div className="flex items-start gap-4">
                                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${card.status === 'active' ? 'bg-green-100 text-green-600' :
                                            card.status === 'fully_used' ? 'bg-gray-100 text-gray-400' : 'bg-red-100 text-red-500'
                                            }`}>
                                            <CreditCard size={24} />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="font-mono font-bold text-gray-800 text-lg tracking-wider">
                                                    {card.code}
                                                </span>
                                                <button onClick={() => copyCode(card.code)} className="text-gray-400 hover:text-blue-500">
                                                    <Copy size={14} />
                                                </button>
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${card.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'
                                                    }`}>
                                                    {card.status}
                                                </span>
                                            </div>
                                            <div className="text-sm text-gray-500 mt-1">
                                                Үлдэгдэл: <span className="font-bold text-gray-700">{card.balance.toLocaleString()}₮</span>
                                                <span className="text-gray-300 mx-2">|</span>
                                                Анх: {card.initialValue.toLocaleString()}₮
                                            </div>
                                            {card.recipientPhone && (
                                                <div className="text-xs text-blue-600 mt-1 flex items-center gap-1">
                                                    📞 {card.recipientPhone}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="text-right text-xs text-gray-400">
                                        <div>Үүссэн: {card.createdAt?.toDate().toLocaleDateString()}</div>
                                        {card.expiresAt && (
                                            <div className={new Date() > card.expiresAt.toDate() ? 'text-red-500 font-bold' : ''}>
                                                Дуусах: {card.expiresAt.toDate().toLocaleDateString()}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
