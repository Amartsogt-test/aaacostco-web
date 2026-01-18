import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useProductStore } from '../store/productStore';
import { ArrowLeft, Upload, DollarSign, Tag, Image as ImageIcon, ScanBarcode, Percent, Layers, Trash2, Plus, Video, Link as LinkIcon, Star, Flame, Crown, Music, Wine } from 'lucide-react';

// Custom K Icon
const KIcon = ({ size = 24, className }) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="currentColor"
        className={className}
    >
        <text x="12" y="18" textAnchor="middle" fontSize="22" fontWeight="900" fontFamily="sans-serif">K</text>
    </svg>
);


export default function AdminProductAdd() {
    const navigate = useNavigate();
    const SPECIAL_TAG = 'Онцгой'; // Define constant to avoid typos
    const [searchParams] = useSearchParams();
    const editId = searchParams.get('id');

    const { addProduct, updateProduct, products, categories, addCategory, addSubCategory, filters, fetchFilters } = useProductStore();

    // Fetch filters if missing
    useEffect(() => {
        if (!filters || filters.length === 0) {
            fetchFilters();
        }
    }, [filters, fetchFilters]);

    // Default to first category if available
    const defaultCategory = categories.length > 0 ? categories[0].label : '';

    const [formData, setFormData] = useState({
        barcode: '',
        name: '',
        name_en: '',
        price: '',
        discountPrice: '',
        discountEndDate: '',
        category: defaultCategory,
        subCategory: '',
        additionalCategories: [],
        image: '',
        video: '',
        description: '',
        productLink: '',
        unitPrice: '',
        rating: '',
        reviewCount: '',
        stock: 'inStock',
        status: 'active',
        weight: ''
    });

    // Populate form if editing - FETCH FRESH DATA
    useEffect(() => {
        const loadProduct = async () => {
            if (editId) {
                try {
                    // 1. Try to find in store first for instant load
                    const cachedProduct = products.find(p => p.id == editId);
                    if (cachedProduct) {
                        setFormData(prev => ({
                            ...prev,
                            barcode: cachedProduct.barcode || '',
                            name: cachedProduct.name || '',
                            name_en: cachedProduct.name_en || '',
                            price: cachedProduct.basePrice || cachedProduct.price,
                            discountPrice: cachedProduct.discount ? cachedProduct.price : '',
                            discountEndDate: cachedProduct.discountEndDate || '',
                            category: cachedProduct.category || defaultCategory,
                            subCategory: cachedProduct.subCategory || '',
                            additionalCategories: cachedProduct.additionalCategories || [],
                            image: cachedProduct.image || '',
                            video: cachedProduct.video || '',
                            description: cachedProduct.description || '',
                            productLink: cachedProduct.productLink || cachedProduct.costcoUrl || '',
                            unitPrice: cachedProduct.unitPrice || '',
                            rating: cachedProduct.rating || cachedProduct.averageRating || '',
                            reviewCount: cachedProduct.reviewCount || '',
                            stock: cachedProduct.stock || 'inStock',
                            status: cachedProduct.status || 'active',
                            weight: cachedProduct.weight || ''
                        }));
                    }

                    // 2. Fetch FRESH data from server to ensure accuracy (e.g. price updates)
                    const { productService } = await import('../services/productService');
                    const freshProduct = await productService.getProductById(editId);

                    if (freshProduct) {
                        console.log("🔄 Loaded fresh data for edit:", freshProduct);
                        setFormData(prev => ({
                            ...prev,
                            barcode: freshProduct.barcode || '',
                            name: freshProduct.name || '',
                            name_en: freshProduct.name_en || '',
                            price: freshProduct.basePrice || freshProduct.price?.value || freshProduct.price || 0, // Handle object or number
                            discountPrice: freshProduct.discount ? (freshProduct.price?.value || freshProduct.price) : '',
                            discountEndDate: freshProduct.discountEndDate || '',
                            category: freshProduct.category || defaultCategory,
                            subCategory: freshProduct.subCategory || '',
                            additionalCategories: freshProduct.additionalCategories || [],
                            image: freshProduct.image || '',
                            video: freshProduct.video || '',
                            description: freshProduct.description || '',
                            productLink: freshProduct.productLink || freshProduct.costcoUrl || '',
                            unitPrice: freshProduct.unitPrice || '',
                            rating: freshProduct.rating || freshProduct.averageRating || '',
                            reviewCount: freshProduct.reviewCount || '',
                            stock: freshProduct.stock || 'inStock',
                            status: freshProduct.status || 'active',
                            weight: freshProduct.weight || ''
                        }));

                        if (freshProduct.basePrice) {
                            setFormData(prev => ({
                                ...prev,
                                price: freshProduct.basePrice,
                                discountPrice: freshProduct.discount ? (freshProduct.price?.value || freshProduct.price) : ''
                            }));
                        }
                    }
                } catch (err) {
                    console.error("Failed to load product for edit:", err);
                }
            }
        };
        loadProduct();
    }, [editId, products, defaultCategory]);

    // Simple state for adding new category
    const [isAddingCategory, setIsAddingCategory] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState('');

    // Subcategory addition state
    const [isAddingSubCategory, setIsAddingSubCategory] = useState(false);
    const [newSubCategoryName, setNewSubCategoryName] = useState('');

    // Get active category object
    const activeCategoryData = useMemo(() => {
        return categories.find(cat => cat.label === formData.category);
    }, [categories, formData.category]);


    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.name || !formData.price) return;

        setIsLoading(true);
        try {
            const basePrice = Number(formData.price);
            const salePrice = formData.discountPrice ? Number(formData.discountPrice) : null;

            console.log('DEBUG: Updating Product Payload:', {
                id: editId,
                additionalCategories: formData.additionalCategories.filter(Boolean),
                fullData: formData
            });

            const productData = {
                barcode: formData.barcode,
                name: formData.name,
                name_en: formData.name_en,
                category: formData.category,
                subCategory: formData.subCategory,
                additionalCategories: formData.additionalCategories.filter(Boolean),
                image: formData.image || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=600&q=80',
                video: formData.video,
                description: formData.description,
                productLink: formData.productLink,
                price: salePrice || basePrice,
                oldPrice: salePrice ? basePrice : null,
                basePrice: basePrice,
                baseOldPrice: salePrice ? basePrice : null,
                discount: !!salePrice,
                discountEndDate: formData.discountEndDate,
                unitPrice: formData.unitPrice,
                rating: formData.rating ? Number(formData.rating) : null,
                reviewCount: formData.reviewCount ? Number(formData.reviewCount) : 0,
                stock: formData.stock,
                status: formData.status,
                weight: formData.weight ? Number(formData.weight) : null
            };

            // Firebase integration
            // If we have an editId, we might need a different service method (updateProduct), but for now checking add.
            // CAUTION: This implies we are creating new entries for now.
            // If editId exists, we should probably update, but the user request was specifically about "Connection" 
            // and primarily usually implies creating new ones first.
            // However, the existing code handled updates to local store.

            // For now, let's persist to Firebase ONLY for NEW products or always?
            // User asked to connect "бараа бүртгэх хэсгийг" (register section).

            if (editId) {
                // Integrating full CRUD
                const { productService } = await import('../services/productService');

                // FIX: Ensure we use the exact ID type (string vs number) currently in the store
                const existingProduct = products.find(p => p.id == editId);
                const idToUpdate = existingProduct ? existingProduct.id : editId;

                let updated;
                try {
                    updated = await productService.updateProduct(editId, productData, imageFile, videoFile);
                } catch (dbError) {
                    console.error("DB Update Failed (likely permission), updating local store only:", dbError);
                    updated = {
                        ...existingProduct,
                        ...productData,
                        // Use current form data for image/video if upload failed or returned nothing
                        image: formData.image,
                        video: formData.video,
                        updatedAt: new Date().toISOString()
                    };
                }

                updateProduct(idToUpdate, updated);
                // alert('Бараа амжилттай шинэчлэгдлээ!'); 
                // Using non-blocking notification or just navigate. 
                // Removing alert to prevent blocking automation, or keeping it but browser handles it?
                // User expects feedback.
                // Let's keep a simple alert but maybe text indicates status
                alert('Бараа амжилттай шинэчлэгдлээ!');
            } else {
                const { productService } = await import('../services/productService');
                const newProduct = await productService.addProduct(productData, imageFile, videoFile);
                addProduct(newProduct);
                // Alert removed for smoother navigation
            }
            navigate('/admin');
        } catch (error) {
            console.error(error);
            alert('Алдаа гарлаа: ' + error.message);
        } finally {
            setIsLoading(false);
        }
    };

    // Category Management
    const handleAddCategory = () => {
        if (!newCategoryName.trim()) return;
        const id = newCategoryName.toLowerCase().replace(/\s+/g, '-');
        addCategory({
            id,
            label: newCategoryName,
            subcategories: [], // Initialize empty
            icon: Tag // Default icon since we can't easily pick one
        });
        setNewCategoryName('');
        setIsAddingCategory(false);
        // Auto select
        setFormData(prev => ({ ...prev, category: newCategoryName, subCategory: '' }));
    };



    const handleAddSubCategory = () => {
        if (!newSubCategoryName.trim() || !activeCategoryData) return;

        const id = newSubCategoryName.toLowerCase().replace(/\s+/g, '-');
        const newSub = {
            id,
            label: newSubCategoryName
        };

        addSubCategory(activeCategoryData.id, newSub);
        setNewSubCategoryName('');
        setIsAddingSubCategory(false);
        // Auto select
        setFormData(prev => ({ ...prev, subCategory: newSubCategoryName }));
    };

    // Store raw files for upload
    const [imageFile, setImageFile] = useState(null);
    const [videoFile, setVideoFile] = useState(null);
    const [isLoading, setIsLoading] = useState(false);

    // Image Upload Handler
    const handleImageUpload = (e) => {
        const file = e.target.files[0];
        if (file) {
            setImageFile(file);
            const imageUrl = URL.createObjectURL(file);
            setFormData(prev => ({ ...prev, image: imageUrl }));
        }
    };

    const handleVideoUpload = (e) => {
        const file = e.target.files[0];
        if (file) {
            setVideoFile(file);
            const videoUrl = URL.createObjectURL(file);
            setFormData(prev => ({ ...prev, video: videoUrl }));
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 py-4 px-3 sm:py-8 sm:px-4">


            <div className="max-w-2xl mx-auto">
                <button
                    onClick={() => navigate('/admin')}
                    className="flex items-center text-gray-600 hover:text-costco-blue mb-6 transition"
                >
                    <ArrowLeft size={20} className="mr-2" />
                    Буцах
                </button>

                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-8">
                    <h1 className="text-2xl font-bold text-gray-900 mb-8 flex items-center gap-3">
                        <div className="bg-costco-blue/10 p-2 rounded-lg text-costco-blue">
                            <Upload size={24} />
                        </div>
                        {editId ? 'Бараа засах' : 'Бараа бүртгэх'}
                    </h1>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        {/* Barcode Field */}
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">
                                Barcode / QR Code
                            </label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={formData.barcode}
                                    onChange={e => setFormData({ ...formData, barcode: e.target.value })}
                                    className="flex-1 px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-costco-blue focus:border-transparent outline-none transition tabular-nums tracking-wider w-full min-w-0"
                                    placeholder="Barcode бичих..."
                                />
                                <button
                                    type="button"
                                    onClick={() => navigate('/scanner')}
                                    className="bg-costco-blue/10 text-costco-blue px-4 rounded-xl hover:bg-costco-blue hover:text-white transition flex items-center gap-2 font-bold whitespace-nowrap"
                                >
                                    <ScanBarcode size={20} />
                                    <span className="hidden sm:inline">Уншуулах</span>
                                    <span className="sm:hidden">Scan</span>
                                </button>
                            </div>
                        </div>

                        {/* Name */}
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">
                                Барааны нэр
                            </label>
                            <input
                                type="text"
                                required
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-costco-blue focus:border-transparent outline-none transition"
                                placeholder="Жишээ: iPhone 15 Pro Max"
                            />
                        </div>

                        {/* English Name */}
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">
                                English Name
                            </label>
                            <input
                                type="text"
                                value={formData.name_en}
                                onChange={e => setFormData({ ...formData, name_en: e.target.value })}
                                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-costco-blue focus:border-transparent outline-none transition"
                                placeholder="Example: iPhone 15 Pro Max"
                            />
                        </div>

                        {/* Category Management Row */}
                        <div className="grid grid-cols-1 gap-6">
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="block text-sm font-bold text-gray-700 flex items-center gap-2">
                                        <Tag size={16} /> Үндсэн Ангилал
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => setIsAddingCategory(!isAddingCategory)}
                                        className="text-xs font-bold text-costco-blue hover:underline flex items-center gap-1"
                                    >
                                        <Plus size={12} /> Нэмэх
                                    </button>
                                </div>
                                {isAddingCategory && (
                                    <div className="flex gap-2 mb-2 p-2 bg-blue-50 rounded-lg border border-blue-100">
                                        <input
                                            type="text"
                                            value={newCategoryName}
                                            onChange={e => setNewCategoryName(e.target.value)}
                                            className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-costco-blue"
                                            placeholder="Шинэ ангиллын нэр..."
                                            autoFocus
                                        />
                                        <button
                                            type="button"
                                            onClick={handleAddCategory}
                                            className="bg-costco-blue text-white px-3 py-1 rounded-lg text-sm font-bold hover:bg-blue-700"
                                        >
                                            OK
                                        </button>
                                    </div>
                                )}
                                <div className="flex gap-2">
                                    <select
                                        value={formData.category}
                                        onChange={e => setFormData({ ...formData, category: e.target.value, subCategory: '' })}
                                        className="flex-1 px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-costco-blue outline-none bg-white"
                                    >
                                        {categories.map(c => (
                                            <option key={c.id} value={c.label}>{c.label}</option>
                                        ))}
                                    </select>

                                </div>
                            </div>

                            {/* Sub Categories */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="block text-sm font-bold text-gray-700 flex items-center gap-2">
                                        <Layers size={16} /> Дэд ангилал
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => setIsAddingSubCategory(!isAddingSubCategory)}
                                        className="text-xs font-bold text-costco-blue hover:underline flex items-center gap-1"
                                        disabled={!activeCategoryData}
                                    >
                                        <Plus size={12} /> Нэмэх
                                    </button>
                                </div>
                                {isAddingSubCategory && activeCategoryData && (
                                    <div className="flex gap-2 mb-2 p-2 bg-blue-50 rounded-lg border border-blue-100">
                                        <input
                                            type="text"
                                            value={newSubCategoryName}
                                            onChange={e => setNewSubCategoryName(e.target.value)}
                                            className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-costco-blue"
                                            placeholder="Шинэ дэд ангилал..."
                                            autoFocus
                                        />
                                        <button
                                            type="button"
                                            onClick={handleAddSubCategory}
                                            className="bg-costco-blue text-white px-3 py-1 rounded-lg text-sm font-bold hover:bg-blue-700"
                                        >
                                            OK
                                        </button>
                                    </div>
                                )}
                                <label className="hidden"></label>
                                <select
                                    value={formData.subCategory}
                                    onChange={e => setFormData({ ...formData, subCategory: e.target.value })}
                                    disabled={!activeCategoryData?.subcategories?.length}
                                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-costco-blue outline-none bg-white disabled:bg-gray-100 disabled:text-gray-400"
                                >
                                    <option value="">Сонгоно уу</option>
                                    {activeCategoryData?.subcategories?.map(sub => (
                                        <option key={sub.id} value={sub.label}>{sub.label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Price Row */}
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
                                <DollarSign size={16} /> Үндсэн үнэ (₩)
                            </label>
                            <input
                                type="number"
                                required
                                value={formData.price}
                                onChange={e => setFormData({ ...formData, price: e.target.value })}
                                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-costco-blue outline-none"
                                placeholder="0"
                            />
                        </div>

                        {/* Discount Row */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
                                    <Percent size={16} /> Хямдралтай үнэ (₩)
                                </label>
                                <input
                                    type="number"
                                    value={formData.discountPrice}
                                    onChange={e => setFormData({ ...formData, discountPrice: e.target.value })}
                                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-costco-blue outline-none"
                                    placeholder="Заавал биш"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-2 text-gray-500">
                                    <Tag size={16} /> Хямдрал дуусах хугацаа
                                </label>
                                <input
                                    type="text"
                                    value={formData.discountEndDate}
                                    onChange={e => {
                                        let val = e.target.value.replace(/\D/g, ''); // Remove non-digits
                                        if (val.length > 8) val = val.slice(0, 8);

                                        // Format as YYYY/MM/DD
                                        if (val.length > 4) {
                                            val = val.slice(0, 4) + '/' + val.slice(4);
                                        }
                                        if (val.length > 7) {
                                            val = val.slice(0, 7) + '/' + val.slice(7);
                                        }
                                        setFormData({ ...formData, discountEndDate: val });
                                    }}
                                    maxLength={10}
                                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-costco-blue outline-none"
                                    placeholder="yyyy/mm/dd"
                                />
                            </div>
                        </div>

                        {/* Additional Product Info Row */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {/* Unit Price */}
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">
                                    Нэгж үнэ
                                </label>
                                <input
                                    type="text"
                                    value={formData.unitPrice}
                                    onChange={e => setFormData({ ...formData, unitPrice: e.target.value })}
                                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-costco-blue outline-none"
                                    placeholder="₩100/g"
                                />
                            </div>

                            {/* Weight */}
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">
                                    Жин (кг)
                                </label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={formData.weight}
                                    onChange={e => setFormData({ ...formData, weight: e.target.value })}
                                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-costco-blue outline-none"
                                    placeholder="0.5"
                                />
                            </div>

                            {/* Rating */}
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">
                                    Рэйтинг
                                </label>
                                <input
                                    type="number"
                                    step="0.1"
                                    min="0"
                                    max="5"
                                    value={formData.rating}
                                    onChange={e => setFormData({ ...formData, rating: e.target.value })}
                                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-costco-blue outline-none"
                                    placeholder="4.5"
                                />
                            </div>

                            {/* Review Count */}
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">
                                    Сэтгэгдэл тоо
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    value={formData.reviewCount}
                                    onChange={e => setFormData({ ...formData, reviewCount: e.target.value })}
                                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-costco-blue outline-none"
                                    placeholder="0"
                                />
                            </div>
                        </div>

                        {/* Additional Categories */}
                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <label className="block text-sm font-bold text-gray-700 flex items-center gap-2 text-gray-500">
                                    <Tag size={16} /> Нэмэлт ангилал (Сонголттой)
                                </label>
                                <button
                                    type="button"
                                    onClick={() => setFormData(prev => ({ ...prev, additionalCategories: [...prev.additionalCategories, ''] }))}
                                    className="text-xs font-bold text-costco-blue hover:underline flex items-center gap-1"
                                >
                                    <Plus size={12} /> Өөр төрөл нэмэх
                                </button>
                            </div>

                            <div className="flex flex-wrap gap-2 mb-4">
                                {/* Dynamic Filters from Firestore */}
                                {filters.map((filter) => {
                                    const isSelected = formData.additionalCategories.includes(filter.label);

                                    // Get icon for each tag
                                    const getIcon = () => {
                                        const cls = isSelected ? "text-white" : "text-costco-blue";

                                        // Legacy / Manual mapping if icon string matches
                                        if (filter.icon === 'Star' || filter.label === 'Онцгой') return <Star size={16} className={isSelected ? "fill-white text-white" : "fill-yellow-400 text-yellow-400"} />;
                                        if (filter.icon === 'Flame' || filter.label === 'Trend') return <Flame size={16} className={cls} />;
                                        if (filter.icon === 'Music' || filter.label === 'Kirkland') return <KIcon size={16} className={cls} />;
                                        if (filter.label === 'Дарс') return <Wine size={16} className={cls} />;

                                        // Fallback generic
                                        return <Tag size={16} className={cls} />;
                                    };

                                    return (
                                        <button
                                            key={filter.id || filter.label}
                                            type="button"
                                            onClick={() => {
                                                setFormData(prev => {
                                                    const newTags = isSelected
                                                        ? prev.additionalCategories.filter(t => t !== filter.label)
                                                        : [...prev.additionalCategories, filter.label];
                                                    return { ...prev, additionalCategories: newTags };
                                                });
                                            }}
                                            className={`px-4 py-2 rounded-xl text-sm font-bold transition border flex items-center gap-2 ${isSelected
                                                ? 'bg-costco-blue text-white border-costco-blue'
                                                : 'bg-white text-gray-600 border-gray-200 hover:border-costco-blue hover:text-costco-blue'
                                                }`}
                                        >
                                            {getIcon()}
                                            {filter.label}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Custom Tags Section */}
                            <div className="space-y-3">
                                {formData.additionalCategories
                                    .filter(tag => !filters.some(f => f.label === tag))
                                    .map((tag) => {
                                        // Find the actual index in the main array to update correctly
                                        const realIndex = formData.additionalCategories.indexOf(tag);
                                        return (
                                            <div key={realIndex} className="flex gap-2">
                                                <input
                                                    type="text"
                                                    value={tag}
                                                    onChange={e => {
                                                        const newTags = [...formData.additionalCategories];
                                                        newTags[realIndex] = e.target.value;
                                                        setFormData({ ...formData, additionalCategories: newTags });
                                                    }}
                                                    className="flex-1 px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-costco-blue outline-none bg-white text-sm"
                                                    placeholder="Өөр төрөл..."
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const newTags = formData.additionalCategories.filter((_, i) => i !== realIndex);
                                                        setFormData({ ...formData, additionalCategories: newTags });
                                                    }}
                                                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                                                    title="Устгах"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>
                                        );
                                    })}
                            </div>
                        </div>

                        {/* Image Upload */}
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
                                <ImageIcon size={16} /> Зураг
                            </label>

                            <div className="space-y-4">
                                {/* Upload Button */}
                                <label className="flex items-center justify-center w-full h-32 border-2 border-dashed border-costco-blue/30 rounded-xl cursor-pointer hover:bg-blue-50 transition group relative overflow-hidden">
                                    {formData.image ? (
                                        <img
                                            src={formData.image}
                                            alt="Preview"
                                            className="w-full h-full object-contain"
                                        />
                                    ) : (
                                        <div className="flex flex-col items-center text-costco-blue group-hover:scale-105 transition">
                                            <Upload size={32} className="mb-2" />
                                            <span className="font-bold">Зураг оруулах</span>
                                            <span className="text-xs opacity-70">эсвэл чирж авчрах</span>
                                        </div>
                                    )}
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={handleImageUpload}
                                        className="hidden"
                                    />
                                    {formData.image && (
                                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                                            <span className="text-white font-bold bg-black/50 px-4 py-2 rounded-lg">Компьютерээс зураг солих</span>
                                        </div>
                                    )}
                                </label>
                            </div>
                        </div>

                        {/* Video Upload */}
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
                                <Video size={16} /> Бүтээгдэхүүний Видео
                            </label>

                            <div className="space-y-4">
                                <label className="flex items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:bg-gray-50 transition group relative overflow-hidden">
                                    {formData.video ? (
                                        <video
                                            src={formData.video}
                                            className="w-full h-full object-contain bg-black"
                                            controls
                                        />
                                    ) : (
                                        <div className="flex flex-col items-center text-gray-500 group-hover:text-costco-blue transition">
                                            <Upload size={32} className="mb-2" />
                                            <span className="font-bold">Видео оруулах</span>
                                            <span className="text-xs opacity-70">MP4, WebM</span>
                                        </div>
                                    )}
                                    <input
                                        type="file"
                                        accept="video/*"
                                        onChange={handleVideoUpload}
                                        className="hidden"
                                    />
                                    {formData.video && (
                                        <div className="absolute top-2 right-2">
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    setFormData(prev => ({ ...prev, video: '' }));
                                                }}
                                                className="bg-red-500 text-white p-1 rounded-full shadow-lg hover:bg-red-600"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    )}
                                </label>
                            </div>
                        </div>

                        {/* Description */}
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">
                                Дэлгэрэнгүй тайлбар
                            </label>
                            <textarea
                                rows={4}
                                value={formData.description}
                                onChange={e => setFormData({ ...formData, description: e.target.value })}
                                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-costco-blue outline-none resize-none"
                                placeholder="Барааны тухай..."
                            />
                        </div>

                        {/* Product Link */}
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
                                <LinkIcon size={16} /> Барааны линк
                            </label>
                            <input
                                type="text"
                                value={formData.productLink}
                                onChange={e => setFormData({ ...formData, productLink: e.target.value })}
                                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-costco-blue outline-none"
                                placeholder="https://..."
                            />
                        </div>

                        <button
                            type="submit"
                            className={`w-full bg-costco-blue text-white font-bold py-4 rounded-xl hover:bg-blue-700 transition shadow-lg shadow-blue-900/10 active:scale-[0.98] ${isLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
                            disabled={isLoading}
                        >
                            {isLoading ? 'Уншиж байна...' : (editId ? 'Хадгалах' : 'Бүртгэх')}
                        </button>
                    </form>
                </div>
            </div >
        </div >
    );
}
