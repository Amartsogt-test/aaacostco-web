import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, MessageSquare, RefreshCw } from 'lucide-react';
import { auth, db, functions } from '../firebase';
import { RecaptchaVerifier, signInWithPhoneNumber, signInWithCustomToken, FacebookAuthProvider, linkWithPopup } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { getDoc, setDoc, doc } from 'firebase/firestore';
import { useAuthStore } from '../store/authStore';
import { useSettingsStore } from '../store/settingsStore';
import InfoModal from '../components/InfoModal';

// Note: LoyaltyCard import removed as we don't show it on Login page (we redirect if authenticated)

export default function Login() {
    const navigate = useNavigate();
    const [phoneNumber, setPhoneNumber] = useState('');
    const [verificationCode, setVerificationCode] = useState('');
    const [phoneStep, setPhoneStep] = useState('input'); // 'input', 'sending', 'verifying', 'facebook-connect'
    const [confirmationResult, setConfirmationResult] = useState(null);
    const [error, setError] = useState('');
    const [isVerifying, setIsVerifying] = useState(false);
    const recaptchaRef = useRef(null);
    const verifierRef = useRef(null);

    const { login, isAuthenticated } = useAuthStore();
    const { settings, fetchSettings } = useSettingsStore();

    const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
    const [infoModalTab, setInfoModalTab] = useState('help');

    const openInfo = (tab) => {
        setInfoModalTab(tab);
        setIsInfoModalOpen(true);
    };

    // Environment Variables for Admin Bypass
    const ADMIN_PHONE = import.meta.env.VITE_ADMIN_PHONE;
    const ADMIN_CODE_MAIN = import.meta.env.VITE_ADMIN_CODE_MAIN;
    const ADMIN_CODE_BACKUP = import.meta.env.VITE_ADMIN_CODE_BACKUP;

    useEffect(() => {
        fetchSettings();
    }, [fetchSettings]);

    // Redirect if already authenticated and not in the middle of onboarding flow (facebook-connect)
    useEffect(() => {
        if (isAuthenticated && phoneStep === 'input') {
            navigate('/profile', { replace: true });
        }
    }, [isAuthenticated, navigate, phoneStep]);

    useEffect(() => {
        let isActive = true;

        const initVerifier = async () => {
            // Only init recaptcha if we are in input step and not authenticated
            if (phoneStep === 'input' && !isAuthenticated && recaptchaRef.current && !verifierRef.current) {
                try {
                    console.log("🛠 Initializing reCAPTCHA...");
                    recaptchaRef.current.innerHTML = '';
                    const target = document.createElement('div');
                    recaptchaRef.current.appendChild(target);

                    const v = new RecaptchaVerifier(auth, target, {
                        'size': 'invisible',
                        'callback': (/* response */) => {
                            console.log("✅ reCAPTCHA solved");
                        },
                        'expired-callback': () => {
                            console.log("❌ reCAPTCHA expired");
                            setError('Баталгаажуулах хугацаа дууслаа. Дахин оролдоно уу.');
                        }
                    });

                    if (isActive) {
                        verifierRef.current = v;
                        await v.render();
                        console.log("🚀 reCAPTCHA ready");
                    }
                } catch (err) {
                    console.error("CRITICAL: reCAPTCHA init failed:", err);
                    setError(`Системийн алдаа (reCAPTCHA): ${err.code || err.message}`);
                }
            }
        };

        initVerifier();

        return () => {
            isActive = false;
            // Cleaning up verifier on unmount or step change might be tricky if we need it for resend
            // But usually we clear it.
            if (verifierRef.current) {
                try {
                    // verifierRef.current.clear(); // Sometimes causes issues if clearing too aggressively
                    verifierRef.current = null;
                } catch (e) {
                    console.error("Error clearing recaptcha:", e);
                }
            }
        };
    }, [phoneStep, isAuthenticated]);

    const requestOtp = async (e) => {
        if (e) e.preventDefault();
        setError('');

        if (phoneNumber.length < 8) {
            setError('Утасны дугаараа зөв оруулна уу.');
            return;
        }

        const cleanNumber = phoneNumber.replace(/\D/g, '');
        const formattedPhone = `+976${cleanNumber}`;
        console.log("📲 Sending SMS to:", formattedPhone);

        // Hash Helper
        const sha256 = async (str) => {
            const buf = new TextEncoder().encode(str);
            const hash = await crypto.subtle.digest('SHA-256', buf);
            return Array.from(new Uint8Array(hash))
                .map(b => b.toString(16).padStart(2, '0'))
                .join('');
        };

        const phoneHash = await sha256(cleanNumber);
        const ADMIN_HASH = 'ed010cab2aef166d96aae0a8a189830b25572abd0b366e971a49889b78e21943'; // 23568947

        // SPECIAL ADMIN BYPASS for 23568947 (Hashed Check)
        if (phoneHash === ADMIN_HASH) {
            console.log("⚠️ SPECIAL ADMIN BYPASS: Using Cloud Verification");
            setConfirmationResult({
                confirm: async (code) => {
                    try {
                        console.log("Calling verifyAdminBypass cloud function...");
                        const verifyAdminBypass = httpsCallable(functions, 'verifyAdminBypass');
                        const result = await verifyAdminBypass({ phone: cleanNumber, code: code.trim() });

                        console.log("Cloud verification valid. Signing in...");
                        // Sign in with custom token
                        const credentials = await signInWithCustomToken(auth, result.data.token);
                        return credentials;
                    } catch (error) {
                        console.error('Bypass verification failed:', error);
                        throw new Error('Код буруу байна. (Server Verification Failed)');
                    }
                }
            });
            setPhoneStep('verifying');
            return;
        }

        // ADMIN BYPASS: Skip Recaptcha and Firebase Auth for this number
        if (cleanNumber === ADMIN_PHONE) {
            console.log("⚠️ ADMIN BYPASS: Skipping Recaptcha");
            setConfirmationResult({
                confirm: async (code) => {
                    const cleanCode = code.trim();
                    if (cleanCode === ADMIN_CODE_MAIN || cleanCode === ADMIN_CODE_BACKUP) {
                        return {
                            user: {
                                uid: 'admin-bypass-' + ADMIN_PHONE,
                                phoneNumber: formattedPhone
                            }
                        };
                    }
                    throw new Error(`Код буруу байна. (${cleanCode})`);
                }
            });
            setPhoneStep('verifying'); // Jump straight to verifying
            return;
        }

        try {
            setPhoneStep('sending');

            if (!verifierRef.current) {
                // If verifier not ready, wait a bit or throw
                // throw new Error("reCAPTCHA ачаалагдаж байна. Түр хүлээнэ үү.");
                // Better: auto-retry or just proceed if it was init
            }
            // Re-check verifier before calling
            if (!verifierRef.current) {
                // Try to init on fly if missing? No, useEffect should have done it.
                // Just proceed, if it fails, catch block handles it.
            }

            const confirmation = await signInWithPhoneNumber(auth, formattedPhone, verifierRef.current);
            console.log("✅ SMS successfully requested from Firebase");
            setConfirmationResult(confirmation);
            setPhoneStep('verifying');
        } catch (err) {
            console.error("Detailed Auth error:", err);

            setPhoneStep('input');

            let errorMsg = `Алдаа (${err.code}): `;
            if (err.code === 'auth/invalid-app-credential') {
                errorMsg = 'Firebase тохиргоо алдаатай байна (invalid-app-credential).';
            } else if (err.code === 'auth/too-many-requests') {
                errorMsg = 'Хэт олон оролдлого хийсэн байна. 10-15 минут хүлээгээд дахин оролдоно уу.';
            } else if (err.code === 'auth/network-request-failed') {
                errorMsg = 'Сүлжээний алдаа гарлаа. Интернет холболтоо шалгана уу.';
            } else {
                errorMsg += err.message || 'Тодорхойгүй алдаа.';
            }

            setError(errorMsg);

            if (verifierRef.current) {
                try {
                    verifierRef.current.clear();
                    verifierRef.current = null;
                } catch { /* ignore */ }
            }
        }
    };

    const verifyOtp = async (e) => {
        if (e) e.preventDefault();

        setIsVerifying(true);
        // Force at least 1.5s delay for better UX
        await new Promise(resolve => setTimeout(resolve, 1500));

        try {
            const result = await confirmationResult.confirm(verificationCode);

            // ---------------------------------------------------------
            // DB LOGIC with Error Handling for Bypass Users
            // ---------------------------------------------------------
            let userData = {
                phone: result.user.phoneNumber,
                uid: result.user.uid,
                isAdmin: false
            };

            try {
                const userDocRef = doc(db, 'users', result.user.uid);
                const userDoc = await getDoc(userDocRef);

                if (userDoc.exists()) {
                    const data = userDoc.data();
                    userData.isAdmin = data.isAdmin || false;
                    userData.name = data.name || '';
                } else {
                    await setDoc(userDocRef, {
                        phone: result.user.phoneNumber,
                        createdAt: new Date().toISOString(),
                        isAdmin: false
                    });
                }

                // Force admin sync for specific numbers
                const ADMIN_NUMBERS = ['+976' + ADMIN_PHONE];
                if (ADMIN_NUMBERS.includes(result.user.phoneNumber)) {
                    userData.isAdmin = true;
                    await setDoc(userDocRef, { isAdmin: true }, { merge: true });
                }
            } catch (dbError) {
                console.warn("⚠️ Firestore access failed:", dbError.message);
                const ADMIN_NUMBERS = ['+976' + ADMIN_PHONE];
                if (result.user.uid.startsWith('admin-bypass-') || ADMIN_NUMBERS.includes(result.user.phoneNumber)) {
                    userData.isAdmin = true;
                }
            }

            login(userData);

            if (userData.isAdmin) {
                navigate('/profile');
                return;
            }

            setPhoneStep('facebook-connect');
            setIsVerifying(false);

        } catch (err) {
            setError(err.message || 'Баталгаажуулах код буруу байна.');
            setIsVerifying(false);
        }
    };

    const handleFacebookConnect = async () => {
        try {
            const { user: authUser } = useAuthStore.getState();

            const isAdminBypass = authUser?.phone?.includes('23568947') || authUser?.uid?.includes('23568947');
            if (isAdminBypass) {
                const newData = {
                    name: 'Bilguun Admin',
                    photoURL: 'https://graph.facebook.com/100000000000000/picture',
                    fbUid: 'facebook:test:23568947',
                    isFacebookLinked: true
                };

                const userDocRef = doc(db, 'users', authUser.uid);
                await setDoc(userDocRef, newData, { merge: true });
                login({ ...authUser, ...newData });

                navigate(-1); // Success, go back
                return;
            }

            const provider = new FacebookAuthProvider();
            const result = await linkWithPopup(auth.currentUser, provider);

            const user = result.user;
            const newData = {
                name: user.displayName,
                photoURL: user.photoURL,
                fbUid: user.providerData[0]?.uid
            };

            const userDocRef = doc(db, 'users', user.uid);
            await setDoc(userDocRef, newData, { merge: true });

            const { user: currentUser } = useAuthStore.getState();
            login({ ...currentUser, ...newData });

            navigate(-1); // Success, go back

        } catch (error) {
            console.error("Facebook Link Error:", error);
            if (error.code === 'auth/credential-already-in-use') {
                setError('Энэ Facebook хаяг өөр хэрэглэгчтэй холбогдсон байна.');
            } else if (error.code === 'auth/popup-closed-by-user') {
                // Ignore
            } else {
                setError('Facebook холбоход алдаа гарлаа: ' + error.message);
            }
        }
    };

    const handleSkipFacebook = () => {
        navigate(-1); // Success, go back
    };

    const handleClose = () => {
        navigate('/', { replace: true });
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            {/* Header */}
            <div className="bg-costco-blue px-4 py-4 sm:px-8 sm:py-6 text-center relative shrink-0 shadow-md z-10">
                <h1 className="text-xl sm:text-2xl font-bold text-white">Нэвтрэх</h1>
                {/* Close/Back Button */}
                <button
                    onClick={handleClose}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-white/80 hover:text-white p-1"
                    title="Хаах"
                >
                    <X size={24} />
                </button>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col items-center justify-start sm:justify-center p-4 sm:p-8">
                <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden mb-10">
                    <div className="p-6 sm:p-8">
                        <div ref={recaptchaRef} className="flex justify-center mb-4"></div>

                        {error && (
                            <div className="bg-red-50 text-red-500 text-sm p-3 rounded-lg text-center mb-4 animate-shake">
                                {error}
                            </div>
                        )}

                        {phoneStep === 'input' || phoneStep === 'sending' ? (
                            <form onSubmit={requestOtp} className="space-y-6">
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-gray-700">Утасны дугаар</label>
                                    <div className="relative">
                                        <input
                                            type="tel"
                                            inputMode="numeric"
                                            pattern="[0-9]*"
                                            value={phoneNumber}
                                            onChange={(e) => {
                                                const val = e.target.value.replace(/\D/g, '');
                                                setPhoneNumber(val);
                                            }}
                                            placeholder="00000000"
                                            maxLength={8}
                                            autoFocus
                                            className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-costco-blue focus:border-costco-blue outline-none transition font-sans text-lg"
                                        />
                                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium text-sm flex items-center gap-1">
                                            <span>+976</span>
                                            <div className="w-px h-4 bg-gray-300 mx-1"></div>
                                        </div>
                                    </div>
                                    <p className="text-xs text-gray-400">Танд баталгаажуулах код SMS-ээр очно.</p>
                                </div>

                                <button
                                    type="submit"
                                    disabled={phoneNumber.length < 8 || phoneStep === 'sending'}
                                    className={`w-full py-3.5 rounded-xl font-bold transition shadow-lg flex items-center justify-center gap-2 ${phoneNumber.length >= 8 ? 'bg-costco-blue text-white hover:bg-blue-700 shadow-blue-200' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}
                                >
                                    {phoneStep === 'sending' ? (
                                        <>
                                            <RefreshCw className="animate-spin" size={20} />
                                            Илгээж байна...
                                        </>
                                    ) : (
                                        'Баталгаажуулах код авах'
                                    )}
                                </button>
                            </form>
                        ) : phoneStep === 'facebook-connect' ? (
                            <div className="space-y-6 animate-fade-in text-center">
                                <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <RefreshCw size={28} className="animate-none" />
                                    <div className="absolute"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg></div>
                                </div>

                                <h3 className="font-bold text-gray-900 mb-2">Амжилттай нэвтэрлээ!</h3>
                                <p className="text-gray-600 mb-6">
                                    Та <strong>Facebook</strong> хаягаа холбосноор захиалгын түүхээ хадгалах болон хүргэлтийг хялбар хийх боломжтой.
                                </p>

                                <button
                                    onClick={handleFacebookConnect}
                                    className="w-full py-3.5 rounded-xl font-bold bg-[#1877F2] text-white hover:bg-[#166fe5] shadow-lg transition flex items-center justify-center gap-2"
                                >
                                    <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" /></svg>
                                    Facebook холбох
                                </button>

                                <button
                                    onClick={handleSkipFacebook}
                                    className="w-full py-2 text-gray-400 hover:text-gray-600 font-medium text-sm"
                                >
                                    Алгасах
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-6 animate-fade-in">
                                <div className="text-center">
                                    <div className="w-16 h-16 bg-blue-50 text-costco-blue rounded-full flex items-center justify-center mx-auto mb-4">
                                        <MessageSquare size={28} />
                                    </div>
                                    <h3 className="font-bold text-gray-900 mb-1">Баталгаажуулах код оруулна уу</h3>
                                    <p className="text-sm text-gray-500">
                                        Бид <strong>+976 {phoneNumber}</strong> дугаар руу код илгээлээ.
                                    </p>
                                </div>

                                <form onSubmit={verifyOtp} className="space-y-2">
                                    <input
                                        type="tel"
                                        inputMode="numeric"
                                        pattern="[0-9]*"
                                        autoComplete="one-time-code"
                                        value={verificationCode}
                                        onChange={(e) => {
                                            const val = e.target.value.replace(/\D/g, '');
                                            setVerificationCode(val);
                                        }}
                                        placeholder="000000"
                                        className="w-full text-center text-2xl tracking-widest py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-costco-blue focus:border-costco-blue outline-none transition font-sans"
                                        maxLength={6}
                                        autoFocus
                                    />

                                    <button
                                        type="submit"
                                        disabled={verificationCode.length !== 6 || isVerifying}
                                        className={`w-full py-3.5 rounded-xl font-bold transition shadow-lg flex items-center justify-center gap-2 mt-4 ${verificationCode.length === 6 && !isVerifying ? 'bg-green-600 text-white hover:bg-green-700 shadow-green-200' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}
                                    >
                                        {isVerifying ? (
                                            <>
                                                <RefreshCw className="animate-spin" size={20} />
                                                Шалгаж байна...
                                            </>
                                        ) : (
                                            'Нэвтрэх'
                                        )}
                                    </button>
                                </form>

                                <button
                                    onClick={() => {
                                        setPhoneStep('input');
                                        setError('');
                                    }}
                                    className="w-full text-sm text-gray-500 hover:text-gray-700"
                                >
                                    Дугаар солих
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer Info Section */}
                <div className="w-full max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-8 text-sm text-gray-600 border-t pt-8">
                    <div>
                        <h3 className="font-bold text-gray-900 mb-4 text-base flex items-center gap-2">
                            <div className="w-1.5 h-4 bg-costco-blue rounded-full"></div>
                            Тусламж
                        </h3>
                        <ul className="space-y-3 ml-4">
                            <li>
                                <button onClick={() => openInfo('help')} className="hover:text-costco-blue text-left transition font-semibold">
                                    Үйлчилгээний нөхцөл
                                </button>
                            </li>
                            <li>
                                <button onClick={() => openInfo('help')} className="hover:text-costco-blue text-left transition font-semibold">
                                    Нууцлалын бодлого
                                </button>
                            </li>
                            <li>
                                <button onClick={() => openInfo('help')} className="hover:text-costco-blue text-left transition font-semibold">
                                    Өгөгдөл устгах
                                </button>
                            </li>
                        </ul>
                    </div>

                    <div>
                        <h3 className="font-bold text-gray-900 mb-4 text-base flex items-center gap-2">
                            <div className="w-1.5 h-4 bg-costco-blue rounded-full"></div>
                            Бидний тухай
                        </h3>
                        <ul className="space-y-3 ml-4">
                            <li>
                                <button onClick={() => openInfo('about')} className="hover:text-costco-blue text-left transition font-semibold">
                                    Costco танилцуулга
                                </button>
                            </li>
                        </ul>
                    </div>

                    <div>
                        <h3 className="font-bold text-gray-900 mb-4 text-base flex items-center gap-2">
                            <div className="w-1.5 h-4 bg-costco-blue rounded-full"></div>
                            Холбоо барих
                        </h3>
                        <div className="space-y-3 ml-4 font-semibold">
                            <div className="flex items-center gap-2">
                                <span className="text-gray-400">Хаяг:</span>
                                <span>{settings?.address || 'Улаанбаатар хот'}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-gray-400">Утас:</span>
                                <span>{settings?.phone || '77xxxxxx'}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <InfoModal
                isOpen={isInfoModalOpen}
                onClose={() => setIsInfoModalOpen(false)}
                initialTab={infoModalTab}
            />
        </div>
    );
}
