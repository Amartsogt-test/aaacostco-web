import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useEffect, lazy, Suspense } from 'react';
import { useProductStore } from './store/productStore';
import { useSettingsStore } from './store/settingsStore';
import Layout from './components/Layout';

import ScrollToTop from './components/ScrollToTop';

// Lazy load components to prevent initialization order issues
// const Layout = lazy(() => import('./components/Layout'));
const Home = lazy(() => import('./pages/Home'));
const Cart = lazy(() => import('./pages/Cart'));
const Saved = lazy(() => import('./pages/Saved'));
const Orders = lazy(() => import('./pages/Orders'));
const Notifications = lazy(() => import('./pages/Notifications'));
const ProductDetail = lazy(() => import('./pages/ProductDetail'));
const Login = lazy(() => import('./pages/Login'));
const Profile = lazy(() => import('./pages/Profile'));
const AdminProductAdd = lazy(() => import('./pages/AdminProductAdd'));
const AdminPortal = lazy(() => import('./pages/AdminPortal'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const AdminOrders = lazy(() => import('./pages/AdminOrders'));
const AdminChat = lazy(() => import('./pages/AdminChat'));
const DebugPage = lazy(() => import('./pages/DebugPage'));
const AdminSync = lazy(() => import('./pages/AdminSync'));
const AdminInactiveProducts = lazy(() => import('./pages/AdminInactiveProducts'));
const AdminGiftCards = lazy(() => import('./pages/AdminGiftCards'));
const AdminSettings = lazy(() => import('./pages/AdminSettings'));
const AdminRoute = lazy(() => import('./components/AdminRoute'));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));
const TermsOfService = lazy(() => import('./pages/TermsOfService'));
const DataDeletion = lazy(() => import('./pages/DataDeletion'));
const AboutUs = lazy(() => import('./pages/AboutUs'));
const Chat = lazy(() => import('./pages/Chat'));

// Modal-as-Page components (embedded mode)
const InfoModal = lazy(() => import('./components/InfoModal'));
const PaymentModal = lazy(() => import('./components/PaymentModal'));
const BranchModal = lazy(() => import('./components/BranchModal'));
const CartMenuModal = lazy(() => import('./components/CartMenuModal'));
const QuickScanModal = lazy(() => import('./components/QuickScanModal'));
const ScannerModal = lazy(() => import('./components/ScannerModal'));
const LocationPickerModal = lazy(() => import('./components/LocationPickerModal'));
const AdminBannerModal = lazy(() => import('./components/AdminBannerModal'));
const AdminContentModal = lazy(() => import('./components/AdminContentModal'));
const AdminMenuImagesModal = lazy(() => import('./components/AdminMenuImagesModal'));

// Wrapper for InfoModal page
const InfoPage = () => <InfoModal isEmbedded={true} />;
const PaymentPage = () => <PaymentModal isEmbedded={true} />;
const BranchPage = () => <BranchModal isEmbedded={true} />;
const CartMenuPage = () => <CartMenuModal isEmbedded={true} isOpen={true} />;
const ScanPage = () => <QuickScanModal isEmbedded={true} isOpen={true} />;
const ScannerPage = () => <ScannerModal isEmbedded={true} isOpen={true} />;
const LocationPage = () => <LocationPickerModal isEmbedded={true} isOpen={true} />;
const AdminBannerPage = () => <AdminBannerModal isEmbedded={true} isOpen={true} />;
const AdminContentPage = () => <AdminContentModal isEmbedded={true} isOpen={true} />;
const AdminMenuImagesPage = () => <AdminMenuImagesModal isEmbedded={true} isOpen={true} />;

// Loading component
const LoadingSpinner = () => (
  <div className="min-h-screen flex items-center justify-center bg-gray-50">
    <div className="w-10 h-10 border-4 border-costco-blue border-t-transparent rounded-full animate-spin"></div>
  </div>
);

function App() {
  const subscribeToWonRate = useProductStore(state => state.subscribeToWonRate);

  // Initialize exchange rate sync on app startup
  useEffect(() => {
    subscribeToWonRate();

    // Subscribe to general settings (shipping rates, etc)
    const unsubscribeSettings = useSettingsStore.getState().subscribeToSettings();

    // Debug: Verify Gemini Key presence
    const geminiKey = import.meta.env.VITE_GEMINI_API_KEY;
    console.log("🛠️ App Initialization: Gemini Key Present =", !!geminiKey);
    if (geminiKey) {
      console.log("🛠️ Key Sample:", geminiKey.substring(0, 5) + "...");
    }

    return () => unsubscribeSettings();
  }, [subscribeToWonRate]);

  return (
    <BrowserRouter>
      <ScrollToTop />
      <Suspense fallback={<LoadingSpinner />}>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="category/:mainId" element={<Home />} />
            <Route path="category/:mainId/:subId" element={<Home />} />
            <Route path="cart" element={<Cart />} />
            <Route path="saved" element={<Saved />} />
            <Route path="orders" element={<Orders />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="login" element={<Login />} />
            <Route path="profile" element={<Profile />} />
            <Route path="product/:id" element={<ProductDetail />} />
            <Route path="debug" element={<DebugPage />} />

            <Route path="privacy" element={<PrivacyPolicy />} />
            <Route path="terms" element={<TermsOfService />} />
            <Route path="delete-data" element={<DataDeletion />} />
            <Route path="about" element={<AboutUs />} />
            <Route path="chat" element={<Chat />} />

            {/* Modal-as-Page Routes */}
            <Route path="info" element={<InfoPage />} />
            <Route path="payment" element={<PaymentPage />} />
            <Route path="branch" element={<BranchPage />} />
            <Route path="cart-menu" element={<CartMenuPage />} />
            <Route path="scan" element={<ScanPage />} />
            <Route path="scanner" element={<ScannerPage />} />
            <Route path="location" element={<LocationPage />} />

            <Route element={<AdminRoute />}>
              <Route path="admin" element={<AdminPortal />} />
              <Route path="admin/products" element={<AdminDashboard />} />
              <Route path="admin/orders" element={<AdminOrders />} />
              <Route path="admin/add-product" element={<AdminProductAdd />} />
              <Route path="admin/chat" element={<AdminChat />} />
              <Route path="admin/sync" element={<AdminSync />} />
              <Route path="admin/inactive-products" element={<AdminInactiveProducts />} />
              <Route path="admin/gift-cards" element={<AdminGiftCards />} />
              <Route path="admin/settings" element={<AdminSettings />} />
              {/* Admin Modal-as-Page Routes */}
              <Route path="admin/banner" element={<AdminBannerPage />} />
              <Route path="admin/content" element={<AdminContentPage />} />
              <Route path="admin/menu-images" element={<AdminMenuImagesPage />} />
            </Route>
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
