import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useEffect, lazy, Suspense } from 'react';
import { useProductStore } from './store/productStore';
import { useSettingsStore } from './store/settingsStore';
import Layout from './components/Layout';

import ScrollToTop from './components/ScrollToTop';

// Lazy load pages
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

// Full Page components (converted from modals)
const InfoPage = lazy(() => import('./pages/InfoPage'));
const PaymentPage = lazy(() => import('./pages/PaymentPage'));
const BranchPage = lazy(() => import('./pages/BranchPage'));
const CartMenuPage = lazy(() => import('./pages/CartMenuPage'));
const QuickScanPage = lazy(() => import('./pages/QuickScanPage'));
const ScannerPage = lazy(() => import('./pages/ScannerPage'));
const LocationPage = lazy(() => import('./pages/LocationPage'));
const SalesSummaryPage = lazy(() => import('./pages/SalesSummaryPage'));

// Admin Full Pages
const AdminBanner = lazy(() => import('./pages/AdminBanner'));
const AdminContent = lazy(() => import('./pages/AdminContent'));
const AdminMenuImagesPage = lazy(() => import('./pages/AdminMenuImagesPage'));

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

            {/* Full Page Routes (converted from modals) */}
            <Route path="info" element={<InfoPage />} />
            <Route path="payment" element={<PaymentPage />} />
            <Route path="branch" element={<BranchPage />} />
            <Route path="cart-menu" element={<CartMenuPage />} />
            <Route path="scan" element={<QuickScanPage />} />
            <Route path="scanner" element={<ScannerPage />} />
            <Route path="location" element={<LocationPage />} />
            <Route path="sales-summary" element={<SalesSummaryPage />} />

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
              {/* Admin Full Pages */}
              <Route path="admin/banner" element={<AdminBanner />} />
              <Route path="admin/content" element={<AdminContent />} />
              <Route path="admin/menu-images" element={<AdminMenuImagesPage />} />
            </Route>
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;

