import { useNavigate, useSearchParams } from 'react-router-dom';
import { useProductStore } from '../store/productStore';
import { useSettingsStore } from '../store/settingsStore';
import { useUIStore } from '../store/uiStore';
import { ChevronLeft, Plus, Trash2, Edit, Search, ScanBarcode, MessageSquare, CircleDollarSign, AlertTriangle, Minus, ArrowRightLeft, RotateCcw, Archive, Filter, Eye, EyeOff, XCircle, Database, LayoutGrid, Table as TableIcon, Package, ExternalLink, TrendingUp, Save, Check, ArrowUp, ArrowDown, ChevronsUpDown } from 'lucide-react';
import { useState, useEffect } from 'react';
import ScannerModal from '../components/ScannerModal';
import ConfirmationModal from '../components/ConfirmationModal';
import SalesSummaryModal from '../components/SalesSummaryModal';



export default function AdminDashboard() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const isStandalone = searchParams.get('view') === 'spreadsheet';

    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState('Featured');
    const [activeTab, setActiveTab] = useState('active'); // 'active', 'inactive', 'deleted'
    const [isScannerOpen, setIsScannerOpen] = useState(false);
    const [isSalesModalOpen, setIsSalesModalOpen] = useState(false);
    const [viewMode] = useState(isStandalone ? 'spreadsheet' : 'list'); // 'list' or 'spreadsheet'

    // Confirmation Modal State
    const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', message: '', onConfirm: null });

    // Sort Config
    const [sortConfig, setSortConfig] = useState({ key: 'updatedAt', direction: 'desc' });

    const handleSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    // Inline Editing State
    const [editingCell, setEditingCell] = useState(null); // { id, field }
    const [editValue, setEditValue] = useState('');
    // const [savingId, setSavingId] = useState(null); // Removed unused state

    const { products, deleteProduct, setProductStatus, fetchProducts, updateProduct, categories, wonRate } = useProductStore();
    // const { currency } = useUIStore(); // Unused
    // const { user } = useAuthStore(); // Unused

    useEffect(() => {
        fetchProducts();
    }, [fetchProducts]);

    // Rate logic removed as it belongs to Profile page

    const [inactiveProducts, setInactiveProducts] = useState([]);
    const [deletedProducts, setDeletedProducts] = useState([]);

    useEffect(() => {
        const loadSpecialTabs = async () => {
            if (activeTab === 'inactive') {
                try {
                    const { productService } = await import('../services/productService');
                    const data = await productService.getInactiveProducts();
                    setInactiveProducts(data);
                } catch (error) {
                    console.error("Failed to load inactive products:", error);
                }
            } else if (activeTab === 'deleted') {
                try {
                    const { productService } = await import('../services/productService');
                    const data = await productService.getDeletedProducts();
                    setDeletedProducts(data);
                } catch (error) {
                    console.error("Failed to load deleted products:", error);
                }
            }
        };
        loadSpecialTabs();
    }, [activeTab]);



    // Filter & Sort Logic
    const getFilteredProducts = () => {
        let sourceProducts = products;

        // Use specifically fetched products when special tabs are active
        if (activeTab === 'inactive') {
            sourceProducts = inactiveProducts;
        } else if (activeTab === 'deleted') {
            sourceProducts = deletedProducts;
        }

        // 1. Filter by Tab Status
        let filtered = sourceProducts.filter(product => {
            if (activeTab === 'active') return !product.status || product.status === 'active';
            if (activeTab === 'inactive') return product.status === 'inactive';
            if (activeTab === 'deleted') return product.status === 'deleted';
            return false;
        });

        // 2. Filter by Search
        if (searchTerm) {
            filtered = filtered.filter(product =>
                product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                product.barcode?.includes(searchTerm)
            );
        }

        // 3. Sort/Filter by Type
        let result = filtered;
        switch (filterType) {
            case 'Sale':
                result = filtered.filter(p => p.discount);
                break;
            case 'PriceLowHigh':
                result = [...filtered].sort((a, b) => (a.price || 0) - (b.price || 0));
                break;
            case 'PriceHighLow':
                result = [...filtered].sort((a, b) => (b.price || 0) - (a.price || 0));
                break;
            case 'BestSelling':
                result = [...filtered].sort((a, b) => (b.reviews || 0) - (a.reviews || 0));
                break;
            case 'Featured':
            default:
                // No specific sort from dropdown, or just filtering
                break;
        }

        // 4. Apply Table Column Sort (Overrides Dropdown Sort if active)
        if (sortConfig.key) {
            result = [...result].sort((a, b) => {
                let aValue = a[sortConfig.key];
                let bValue = b[sortConfig.key];

                // Special handling for Category Name
                if (sortConfig.key === 'category') {
                    const catA = categories.find(c => c.id === a.category)?.name || a.category || '';
                    const catB = categories.find(c => c.id === b.category)?.name || b.category || '';
                    aValue = catA;
                    bValue = catB;
                }

                // Handle null/undefined
                if (aValue === undefined || aValue === null) aValue = '';
                if (bValue === undefined || bValue === null) bValue = '';

                if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }

        return result;
    };

    const filteredProducts = getFilteredProducts();

    // Action Handlers
    const handleStatusChange = (id, newStatus, confirmMsg) => {
        if (confirmMsg) {
            setConfirmModal({
                isOpen: true,
                title: 'Баталгаажуулах',
                message: confirmMsg,
                onConfirm: () => setProductStatus(id, newStatus)
            });
        } else {
            setProductStatus(id, newStatus);
        }
    };

    const handlePermanentDelete = (id) => {
        setConfirmModal({
            isOpen: true,
            title: 'Анхааруулга',
            message: 'САНАМЖ: Энэ барааг САНГААС БҮРМӨСӨН УСТГАХДАА итгэлтэй байна уу? Дахин сэргээх боломжгүй!',
            onConfirm: () => deleteProduct(id)
        });
    };

    const handleScan = (code) => {
        setSearchTerm(code);
        setIsScannerOpen(false);
    };

    const handleEditStart = (product, field) => {
        setEditingCell({ id: product.id, field });
        setEditValue(product[field] || '');
    };

    const handleEditSave = async () => {
        if (!editingCell) return;

        const { id, field } = editingCell;

        try {
            await updateProduct(id, { [field]: editValue });
            setEditingCell(null);
        } catch (error) {
            console.error('Update failed:', error);
            // Optional: Show toast
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            handleEditSave();
        } else if (e.key === 'Escape') {
            setEditingCell(null);
        }
    };

    // Additional handlers for spreadsheet specific features could go here
    const handleOpenSpreadsheet = () => {
        window.open('/admin?view=spreadsheet', '_blank');
    };

    return (
        <div className="bg-gray-50 min-h-screen pb-10">
            {/* Header */}
            <div className="bg-white border-b px-6 py-4 sticky top-0 z-10 shadow-sm">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 max-w-7xl mx-auto">
                    <div className="flex items-center gap-4 flex-1">
                        <button
                            onClick={() => navigate('/admin')}
                            className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500"
                            title="Буцах"
                        >
                            <ChevronLeft size={24} />
                        </button>
                        <div className="relative flex-1 max-w-md">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                            <input
                                type="text"
                                placeholder="Барааны нэрээр хайх..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 bg-gray-100 border-none rounded-xl focus:ring-2 focus:ring-costco-blue/20 transition-all font-medium"
                            />
                        </div>

                        {/* Dropdown Filter */}
                        <div className="relative group">
                            <button className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg text-sm font-medium hover:bg-gray-200 transition">
                                <span className="hidden sm:inline">{
                                    filterType === 'Featured' ? 'Онцлох' :
                                        filterType === 'Sale' ? 'Хямдралтай' :
                                            filterType === 'PriceLowHigh' ? 'Үнэ өсөхөөр' :
                                                filterType === 'PriceHighLow' ? 'Үнэ буурахаар' :
                                                    filterType === 'BestSelling' ? 'Борлуулалт' : 'Шүүлтүүр'
                                }</span>
                                <Filter size={16} className="text-gray-600" />
                            </button>
                            <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-xl border p-1 hidden group-hover:block z-20">
                                <button onClick={() => setFilterType('Featured')} className={`w-full text-left px-4 py-2 rounded-lg text-sm ${filterType === 'Featured' ? 'bg-blue-50 text-blue-600' : 'hover:bg-gray-50'}`}>Онцлох</button>
                                <button onClick={() => setFilterType('Sale')} className={`w-full text-left px-4 py-2 rounded-lg text-sm ${filterType === 'Sale' ? 'bg-blue-50 text-blue-600' : 'hover:bg-gray-50'}`}>Хямдралтай</button>
                                <button onClick={() => setFilterType('PriceLowHigh')} className={`w-full text-left px-4 py-2 rounded-lg text-sm ${filterType === 'PriceLowHigh' ? 'bg-blue-50 text-blue-600' : 'hover:bg-gray-50'}`}>Үнэ өсөхөөр</button>
                                <button onClick={() => setFilterType('PriceHighLow')} className={`w-full text-left px-4 py-2 rounded-lg text-sm ${filterType === 'PriceHighLow' ? 'bg-blue-50 text-blue-600' : 'hover:bg-gray-50'}`}>Үнэ буурахаар</button>
                                <button onClick={() => setFilterType('BestSelling')} className={`w-full text-left px-4 py-2 rounded-lg text-sm ${filterType === 'BestSelling' ? 'bg-blue-50 text-blue-600' : 'hover:bg-gray-50'}`}>Борлуулалт</button>
                            </div>
                        </div>

                        <button
                            onClick={() => setIsScannerOpen(true)}
                            className="bg-gray-100 p-2 rounded-lg hover:bg-gray-200 transition"
                            title="Баркод уншуулах"
                        >
                            <ScanBarcode size={20} className="text-gray-600" />
                        </button>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="flex bg-gray-100 p-1 rounded-lg">
                            <button
                                onClick={() => setActiveTab('active')}
                                className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-all ${activeTab === 'active' ? 'bg-white text-costco-blue shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                Active
                            </button>
                            <button
                                onClick={() => setActiveTab('inactive')}
                                className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-all ${activeTab === 'inactive' ? 'bg-white text-costco-blue shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                Inactive
                            </button>
                            <button
                                onClick={() => setActiveTab('deleted')}
                                className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-all ${activeTab === 'deleted' ? 'bg-white text-costco-blue shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                Delete
                            </button>
                        </div>

                        <div className="h-6 w-px bg-gray-300 mx-1"></div>

                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setIsSalesModalOpen(true)}
                                className="bg-green-50 text-green-700 h-9 px-4 rounded-lg font-bold hover:bg-green-100 transition flex items-center gap-1 shadow-sm text-xs"
                                title="Борлуулалтын тайлан"
                            >
                                <TrendingUp size={16} />
                                <span className="hidden md:inline px-1">Тайлан</span>
                            </button>

                            <button
                                onClick={() => navigate('/admin/add-product')}
                                className="bg-costco-blue text-white h-9 px-4 rounded-lg font-bold hover:bg-blue-700 transition flex items-center gap-1 shadow-sm text-xs"
                                title="Бараа нэмэх"
                            >
                                <span className="hidden md:inline px-1">Бараа</span>
                                <Plus size={16} />
                            </button>

                            <button
                                onClick={() => navigate('/admin/inactive-products')}
                                className="bg-white text-gray-700 border border-gray-300 h-9 px-4 rounded-lg font-bold hover:bg-gray-50 transition flex items-center gap-1 shadow-sm text-xs"
                                title="Идэвхгүй бараанууд"
                            >
                                <EyeOff size={16} />
                                <span className="hidden md:inline px-1">Идэвхгүй</span>
                            </button>

                            <div className="flex bg-gray-200 rounded-lg p-1 h-9 items-center">
                                <button
                                    onClick={handleOpenSpreadsheet}
                                    className={`p-1.5 rounded transition ${viewMode === 'spreadsheet' ? 'bg-white shadow text-costco-blue' : 'text-gray-500 hover:text-gray-700'}`}
                                    title="Open Spreadsheet View"
                                >
                                    <TableIcon size={16} />
                                </button>
                                <button
                                    onClick={() => { }} // Assuming standard view is default/only option here for now
                                    className={`p-1.5 rounded transition ${viewMode !== 'spreadsheet' ? 'bg-white shadow text-costco-blue' : 'text-gray-500 hover:text-gray-700'}`}
                                    title="List View"
                                >
                                    <LayoutGrid size={16} />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="max-w-7xl mx-auto px-6 py-6">
                <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="bg-gray-100/50 border-b">
                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-24">Зураг</th>
                                    <th
                                        className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 hover:text-costco-blue transition group"
                                        onClick={() => handleSort('name')}
                                    >
                                        <div className="flex items-center gap-1">
                                            Барааны жагсаалт ({filteredProducts.length})
                                            {sortConfig.key === 'name' ? (
                                                sortConfig.direction === 'asc' ? <ArrowUp size={14} className="text-costco-blue" /> : <ArrowDown size={14} className="text-costco-blue" />
                                            ) : (
                                                <ChevronsUpDown size={14} className="text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                                            )}
                                        </div>
                                    </th>
                                    <th
                                        className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-40 cursor-pointer hover:bg-gray-100 hover:text-costco-blue transition group"
                                        onClick={() => handleSort('category')}
                                    >
                                        <div className="flex items-center gap-1">
                                            Ангилал
                                            {sortConfig.key === 'category' ? (
                                                sortConfig.direction === 'asc' ? <ArrowUp size={14} className="text-costco-blue" /> : <ArrowDown size={14} className="text-costco-blue" />
                                            ) : (
                                                <ChevronsUpDown size={14} className="text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                                            )}
                                        </div>
                                    </th>
                                    <th
                                        className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-32 cursor-pointer hover:bg-gray-100 hover:text-costco-blue transition group"
                                        onClick={() => handleSort('discount')}
                                    >
                                        <div className="flex items-center gap-1">
                                            Хямдрал
                                            {sortConfig.key === 'discount' ? (
                                                sortConfig.direction === 'asc' ? <ArrowUp size={14} className="text-costco-blue" /> : <ArrowDown size={14} className="text-costco-blue" />
                                            ) : (
                                                <ChevronsUpDown size={14} className="text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                                            )}
                                        </div>
                                    </th>
                                    <th
                                        className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-40 cursor-pointer hover:bg-gray-100 hover:text-costco-blue transition group"
                                        onClick={() => handleSort('price')}
                                    >
                                        <div className="flex items-center gap-1">
                                            Үнэ
                                            {sortConfig.key === 'price' ? (
                                                sortConfig.direction === 'asc' ? <ArrowUp size={14} className="text-costco-blue" /> : <ArrowDown size={14} className="text-costco-blue" />
                                            ) : (
                                                <ChevronsUpDown size={14} className="text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                                            )}
                                        </div>
                                    </th>
                                    <th className="px-6 py-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider w-32">Үйлдэл</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filteredProducts.length === 0 ? (
                                    <tr>
                                        <td colSpan="6" className="px-6 py-12 text-center text-gray-500">
                                            <div className="flex flex-col items-center gap-2">
                                                <Package size={32} className="text-gray-300" />
                                                <p>Бараа олдсонгүй.</p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    filteredProducts.map((product) => (
                                        <tr key={product.id} className="hover:bg-blue-50/30 transition group">
                                            {/* Image */}
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="h-12 w-12 rounded-lg overflow-hidden bg-gray-100 border relative group-hover:border-blue-200 transition">
                                                    <img src={product.image} alt={product.name} className="h-full w-full object-cover" />
                                                </div>
                                            </td>

                                            {/* Name & Code */}
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col max-w-md">
                                                    {/* Inline Edit Name */}
                                                    {editingCell?.id === product.id && editingCell?.field === 'name' ? (
                                                        <div className="flex items-center gap-2">
                                                            <input
                                                                autoFocus
                                                                className="border rounded px-2 py-1 flex-1 text-sm focus:outline-none focus:border-blue-500"
                                                                value={editValue}
                                                                onChange={(e) => setEditValue(e.target.value)}
                                                                onBlur={handleEditSave}
                                                                onKeyDown={handleKeyDown}
                                                            />
                                                            <button onClick={handleEditSave} className="text-green-600 hover:text-green-700 bg-green-50 p-1 rounded-md"><Check size={14} /></button>
                                                        </div>
                                                    ) : (
                                                        <div className="font-medium text-gray-900 group-hover:text-blue-600 transition flex items-center gap-2">
                                                            <span className="truncate">{product.name}</span>
                                                            {/* Edit Icon on Hover */}
                                                            {activeTab === 'active' && (
                                                                <button
                                                                    className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-blue-500 transition px-1"
                                                                    onClick={(e) => { e.stopPropagation(); handleEditStart(product, 'name'); }}
                                                                >
                                                                    <Edit size={12} />
                                                                </button>
                                                            )}
                                                            {product.isNew && <span className="bg-blue-50 text-blue-600 text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wide">New</span>}
                                                            {product.discount > 0 && <span className="bg-red-50 text-red-600 text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wide">-{product.discount}%</span>}
                                                        </div>
                                                    )}

                                                    {/* Inline Edit Barcode */}
                                                    {editingCell?.id === product.id && editingCell?.field === 'barcode' ? (
                                                        <div className="flex items-center gap-2 mt-0.5">
                                                            <input
                                                                autoFocus
                                                                className="border rounded px-1 py-0.5 flex-1 text-xs focus:outline-none focus:border-blue-500"
                                                                value={editValue}
                                                                onChange={(e) => setEditValue(e.target.value)}
                                                                onBlur={handleEditSave}
                                                                onKeyDown={handleKeyDown}
                                                            />
                                                        </div>
                                                    ) : (
                                                        <div className="text-xs text-gray-400 flex items-center gap-1 group/code">
                                                            <ScanBarcode size={12} />
                                                            {product.barcode || "Баркодгүй"}
                                                            {activeTab === 'active' && (
                                                                <button
                                                                    className="opacity-0 group-hover/group:opacity-100 text-gray-300 hover:text-blue-500 transition ml-1"
                                                                    onClick={(e) => { e.stopPropagation(); handleEditStart(product, 'barcode'); }}
                                                                >
                                                                    <Edit size={10} />
                                                                </button>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Category */}
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-gray-100 text-gray-600 border border-gray-200">
                                                    {categories.find(c => c.id === product.category)?.name || product.category || 'N/A'}
                                                </span>
                                            </td>

                                            {/* Discount */}
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                {product.discount > 0 ? (
                                                    <span className="text-red-600 font-bold text-sm bg-red-50 px-2 py-1 rounded-md">
                                                        {product.discount}% OFF
                                                    </span>
                                                ) : (
                                                    <span className="text-gray-400 text-sm">-</span>
                                                )}
                                            </td>

                                            {/* Price */}
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                {editingCell?.id === product.id && editingCell?.field === 'price' ? (
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            autoFocus
                                                            className="border rounded px-2 py-1 w-24 text-sm focus:outline-none focus:border-blue-500"
                                                            value={editValue}
                                                            onChange={(e) => setEditValue(e.target.value)}
                                                            onBlur={handleEditSave}
                                                            onKeyDown={handleKeyDown}
                                                        />
                                                    </div>
                                                ) : (
                                                    <div className="flex flex-col">
                                                        <div className="font-semibold text-gray-900 flex items-center gap-2">
                                                            {(product.price).toLocaleString()}₮
                                                            {activeTab === 'active' && (
                                                                <button
                                                                    className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-blue-500 transition px-1"
                                                                    onClick={(e) => { e.stopPropagation(); handleEditStart(product, 'price'); }}
                                                                >
                                                                    <Edit size={12} />
                                                                </button>
                                                            )}
                                                        </div>
                                                        {product.oldPrice && (
                                                            <span className="text-xs text-gray-400 line-through">{(product.oldPrice).toLocaleString()}₮</span>
                                                        )}
                                                    </div>
                                                )}
                                            </td>

                                            {/* Actions */}
                                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">

                                                    {activeTab === 'active' && (
                                                        <>
                                                            <button onClick={() => navigate(`/admin/add-product?id=${product.id}`)} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition" title="Засах">
                                                                <Edit size={18} />
                                                            </button>
                                                            <button onClick={() => handleStatusChange(product.id, 'inactive', 'Энэ барааг идэвхгүй болгох уу? (Хэрэглэгчдэд харагдахгүй)')} className="p-2 text-gray-400 hover:text-orange-500 hover:bg-orange-50 rounded-lg transition" title="Идэвхгүй болгох">
                                                                <EyeOff size={18} />
                                                            </button>
                                                            <button onClick={() => handleStatusChange(product.id, 'deleted', 'Энэ барааг устгах уу? (Хогийн сав руу)')} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition" title="Устгах">
                                                                <Trash2 size={18} />
                                                            </button>
                                                        </>
                                                    )}

                                                    {activeTab === 'inactive' && (
                                                        <>
                                                            <button onClick={() => navigate(`/admin/add-product?id=${product.id}`)} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition" title="Засах">
                                                                <Edit size={18} />
                                                            </button>
                                                            <button onClick={() => handleStatusChange(product.id, 'active', 'Энэ барааг идэвхжүүлэх үү?')} className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition" title="Сэргээх">
                                                                <RotateCcw size={18} />
                                                            </button>
                                                            <button onClick={() => handleStatusChange(product.id, 'deleted', 'Энэ барааг устгах уу? (Хогийн сав руу)')} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition" title="Устгах">
                                                                <Trash2 size={18} />
                                                            </button>
                                                        </>
                                                    )}

                                                    {activeTab === 'deleted' && (
                                                        <>
                                                            <button onClick={() => handleStatusChange(product.id, 'active', 'Энэ барааг сэргээх үү?')} className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition" title="Сэргээх">
                                                                <RotateCcw size={18} />
                                                            </button>
                                                            <button onClick={() => handlePermanentDelete(product.id)} className="p-2 text-gray-400 hover:text-red-700 hover:bg-red-100 rounded-lg transition" title="Бүрмөсөн устгах">
                                                                <XCircle size={18} />
                                                            </button>
                                                        </>
                                                    )}

                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <ScannerModal
                isOpen={isScannerOpen}
                onClose={() => setIsScannerOpen(false)}
                onScan={handleScan}
            />

            <ConfirmationModal
                isOpen={confirmModal.isOpen}
                onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })}
                onConfirm={confirmModal.onConfirm}
                title={confirmModal.title}
                message={confirmModal.message}
            />

            <SalesSummaryModal
                isOpen={isSalesModalOpen}
                onClose={() => setIsSalesModalOpen(false)}
            />
        </div>
    );
}
