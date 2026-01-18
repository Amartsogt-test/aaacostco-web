import { useState } from 'react';
import { X, Facebook, Instagram, Loader2 } from 'lucide-react';
import { signInWithPopup } from 'firebase/auth';
import { auth, facebookProvider } from '../firebase';
import { useAuthStore } from '../store/authStore';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

export default function SocialLoginModal({ isOpen, onClose, onSuccess }) {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [showFollowPrompt, setShowFollowPrompt] = useState(false);
    const [selectedPlatform, setSelectedPlatform] = useState(null);
    const { login } = useAuthStore();

    const FB_PAGE_URL = 'https://www.facebook.com/costcomongolia'; // Update with your page
    const IG_PAGE_URL = 'https://www.instagram.com/costcomongolia'; // Update with your page

    const handleFacebookLogin = async () => {
        setIsLoading(true);
        setError(null);
        setSelectedPlatform('facebook');

        try {
            const result = await signInWithPopup(auth, facebookProvider);
            const user = result.user;

            // Save user to Firestore
            const userRef = doc(db, 'users', user.uid);
            const userDoc = await getDoc(userRef);

            const userData = {
                uid: user.uid,
                name: user.displayName,
                email: user.email,
                photoURL: user.photoURL,
                loginProvider: 'facebook',
                lastLogin: serverTimestamp()
            };

            if (!userDoc.exists()) {
                // New user - set followStatus as null (unknown)
                userData.followStatus = { facebook: null, instagram: null };
                userData.createdAt = serverTimestamp();
            }

            await setDoc(userRef, userData, { merge: true });

            // Login to local store
            login({
                uid: user.uid,
                name: user.displayName,
                email: user.email,
                photoURL: user.photoURL,
                loginProvider: 'facebook',
                followStatus: userDoc.exists() ? userDoc.data().followStatus : { facebook: null, instagram: null }
            });

            // Show follow prompt
            setShowFollowPrompt(true);
            setIsLoading(false);

        } catch (err) {
            console.error('Facebook login error:', err);
            setError(err.message || 'Нэвтрэхэд алдаа гарлаа');
            setIsLoading(false);
        }
    };

    const handleInstagramRedirect = () => {
        // Instagram uses Facebook's OAuth, so we use the same flow
        // But we track it as Instagram for follow status purposes
        setSelectedPlatform('instagram');
        handleFacebookLogin();
    };

    const handleFollowConfirm = async (didFollow) => {
        const user = auth.currentUser;
        if (user && selectedPlatform) {
            const userRef = doc(db, 'users', user.uid);
            await setDoc(userRef, {
                followStatus: {
                    [selectedPlatform]: didFollow
                }
            }, { merge: true });
        }

        setShowFollowPrompt(false);
        onSuccess?.();
        onClose();
    };

    const openPageInNewTab = () => {
        const url = selectedPlatform === 'instagram' ? IG_PAGE_URL : FB_PAGE_URL;
        window.open(url, '_blank');
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4">
            <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b">
                    <h2 className="text-lg font-bold text-gray-900">
                        {showFollowPrompt ? 'Пэйжийг дагах' : 'Нэвтрэх'}
                    </h2>
                    <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full">
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6">
                    {!showFollowPrompt ? (
                        <>
                            <p className="text-sm text-gray-600 text-center mb-6">
                                Админтай чатлахын тулд нэвтэрнэ үү
                            </p>

                            {error && (
                                <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg">
                                    {error}
                                </div>
                            )}

                            <div className="space-y-3">
                                <button
                                    onClick={handleFacebookLogin}
                                    disabled={isLoading}
                                    className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-[#1877F2] text-white font-bold rounded-xl hover:bg-[#166FE5] transition disabled:opacity-50"
                                >
                                    {isLoading && selectedPlatform === 'facebook' ? (
                                        <Loader2 size={20} className="animate-spin" />
                                    ) : (
                                        <Facebook size={20} />
                                    )}
                                    Facebook-ээр нэвтрэх
                                </button>

                                <button
                                    onClick={handleInstagramRedirect}
                                    disabled={isLoading}
                                    className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-gradient-to-r from-[#833AB4] via-[#FD1D1D] to-[#F77737] text-white font-bold rounded-xl hover:opacity-90 transition disabled:opacity-50"
                                >
                                    {isLoading && selectedPlatform === 'instagram' ? (
                                        <Loader2 size={20} className="animate-spin" />
                                    ) : (
                                        <Instagram size={20} />
                                    )}
                                    Instagram-ээр нэвтрэх
                                </button>
                            </div>

                            <p className="text-[10px] text-gray-400 text-center mt-4">
                                Нэвтрэснээр та үйлчилгээний нөхцөлийг зөвшөөрч байна
                            </p>
                        </>
                    ) : (
                        <>
                            <div className="text-center mb-6">
                                <div className="w-16 h-16 mx-auto bg-blue-100 rounded-full flex items-center justify-center mb-4">
                                    {selectedPlatform === 'instagram' ? (
                                        <Instagram size={32} className="text-pink-500" />
                                    ) : (
                                        <Facebook size={32} className="text-blue-600" />
                                    )}
                                </div>
                                <p className="text-sm text-gray-600">
                                    Манай {selectedPlatform === 'instagram' ? 'Instagram' : 'Facebook'} хуудсыг дагаарай!
                                </p>
                            </div>

                            <button
                                onClick={openPageInNewTab}
                                className="w-full py-3 px-4 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition mb-3"
                            >
                                Пэйж рүү очих
                            </button>

                            <div className="flex gap-2">
                                <button
                                    onClick={() => handleFollowConfirm(true)}
                                    className="flex-1 py-2 px-4 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 transition text-sm"
                                >
                                    ✓ Дагасан
                                </button>
                                <button
                                    onClick={() => handleFollowConfirm(false)}
                                    className="flex-1 py-2 px-4 bg-gray-200 text-gray-700 font-bold rounded-lg hover:bg-gray-300 transition text-sm"
                                >
                                    Дараа дагана
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
