import { useState, useEffect } from 'react';
import { Star, ThumbsUp, Trash2, Send } from 'lucide-react';
import { reviewService } from '../services/reviewService';
import { useAuthStore } from '../store/authStore';

// Star Rating Input Component
function StarInput({ rating, setRating, size = 24 }) {
    return (
        <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
                <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    aria-label={`${star} од`}
                    className="transition-transform hover:scale-110 active:scale-95"
                >
                    <Star
                        size={size}
                        fill={star <= rating ? '#f59e0b' : 'none'}
                        className={star <= rating ? 'text-amber-400' : 'text-gray-300'}
                    />
                </button>
            ))}
        </div>
    );
}

// Full Review Section Component
export default function ProductReviews({ productId }) {
    const { user, isAuthenticated } = useAuthStore();
    const [reviews, setReviews] = useState([]);
    const [rating, setRating] = useState(5);
    const [comment, setComment] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    useEffect(() => {
        if (productId) loadReviews();
    }, [productId]); // eslint-disable-line react-hooks/exhaustive-deps

    const loadReviews = async () => {
        const data = await reviewService.getProductReviews(productId);
        setReviews(data);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!isAuthenticated) {
            setError('Сэтгэгдэл бичихийн тулд нэвтэрнэ үү.');
            return;
        }
        if (rating < 1) {
            setError('Одоор үнэлнэ үү.');
            return;
        }

        setIsSubmitting(true);
        setError('');
        try {
            await reviewService.addReview({
                productId,
                userId: user.uid,
                userName: user.name || user.phone || 'Хэрэглэгч',
                userPhone: user.phone || '',
                rating,
                comment
            });
            setSuccess('Сэтгэгдэл амжилттай нэмэгдлээ!');
            setComment('');
            setRating(5);
            await loadReviews();
            setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
            setError(err.message || 'Алдаа гарлаа');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (reviewId) => {
        if (!window.confirm('Устгахдаа итгэлтэй байна уу?')) return;
        await reviewService.deleteReview(reviewId, productId);
        await loadReviews();
    };

    // Track which reviews this browser already marked helpful so a single click
    // can't be spammed to inflate the count. (Server-side dedupe would need a
    // per-user subdoc; this is a lightweight, good-enough guard.)
    const getVoted = () => {
        try { return new Set(JSON.parse(localStorage.getItem('helpful-reviews') || '[]')); }
        catch { return new Set(); }
    };
    const [votedHelpful, setVotedHelpful] = useState(getVoted);

    const handleHelpful = async (reviewId) => {
        if (votedHelpful.has(reviewId)) return; // already voted on this device
        // Optimistic: bump the local count immediately, no full reload needed.
        const next = new Set(votedHelpful);
        next.add(reviewId);
        setVotedHelpful(next);
        try { localStorage.setItem('helpful-reviews', JSON.stringify([...next])); } catch { /* ignore */ }
        setReviews(prev => prev.map(r => r.id === reviewId ? { ...r, helpful: (r.helpful || 0) + 1 } : r));
        try {
            await reviewService.markHelpful(reviewId);
        } catch {
            // Roll back on failure
            setReviews(prev => prev.map(r => r.id === reviewId ? { ...r, helpful: Math.max(0, (r.helpful || 1) - 1) } : r));
        }
    };

    const avgRating = reviews.length > 0
        ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
        : 0;

    return (
        <div className="mt-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                Сэтгэгдэл ({reviews.length})
                {reviews.length > 0 && (
                    <span className="text-sm font-normal text-gray-500 flex items-center gap-1">
                        <Star size={14} fill="#f59e0b" className="text-amber-400" />
                        {avgRating.toFixed(1)}
                    </span>
                )}
            </h3>

            {/* Write Review */}
            {isAuthenticated && (
                <form onSubmit={handleSubmit} className="bg-gray-50 rounded-xl p-4 mb-4 border">
                    <div className="flex items-center gap-3 mb-3">
                        <span className="text-sm font-medium text-gray-600">Үнэлгээ:</span>
                        <StarInput rating={rating} setRating={setRating} />
                    </div>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            placeholder="Сэтгэгдэл бичих..."
                            className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                            maxLength={500}
                        />
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="px-4 py-2 bg-costco-blue text-white rounded-lg text-sm font-bold hover:bg-blue-700 transition disabled:opacity-50 flex items-center gap-1"
                        >
                            <Send size={14} />
                        </button>
                    </div>
                    {error && <p className="text-red-500 text-xs mt-2">{error}</p>}
                    {success && <p className="text-green-600 text-xs mt-2">{success}</p>}
                </form>
            )}

            {/* Guest prompt — invite login to leave a review */}
            {!isAuthenticated && (
                <div className="bg-gray-50 rounded-xl p-3 mb-4 border text-center text-sm text-gray-500">
                    Сэтгэгдэл бичихийн тулд <span className="font-semibold text-costco-blue">нэвтэрнэ</span> үү.
                </div>
            )}

            {/* Review List */}
            {reviews.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-6">Сэтгэгдэл байхгүй байна.</p>
            ) : (
                <div className="space-y-3">
                    {reviews.map((review) => (
                        <div key={review.id} className="bg-white rounded-xl p-4 border border-gray-100">
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-xs font-bold">
                                        {(review.userName || 'У').charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <span className="text-sm font-bold text-gray-900">{review.userName}</span>
                                        <div className="flex gap-0.5">
                                            {[1, 2, 3, 4, 5].map((s) => (
                                                <Star key={s} size={12} fill={s <= review.rating ? '#f59e0b' : 'none'} className={s <= review.rating ? 'text-amber-400' : 'text-gray-200'} />
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-gray-400">
                                        {new Date(review.createdAt).toLocaleDateString('mn-MN')}
                                    </span>
                                    {(user?.isAdmin || user?.uid === review.userId) && (
                                        <button onClick={() => handleDelete(review.id)} aria-label="Сэтгэгдэл устгах" className="text-gray-300 hover:text-red-500 transition">
                                            <Trash2 size={14} />
                                        </button>
                                    )}
                                </div>
                            </div>
                            {review.comment && (
                                <p className="text-sm text-gray-700 mb-2">{review.comment}</p>
                            )}
                            <button
                                onClick={() => handleHelpful(review.id)}
                                disabled={votedHelpful.has(review.id)}
                                aria-label="Энэ сэтгэгдэл хэрэгтэй"
                                className={`flex items-center gap-1 text-xs transition ${votedHelpful.has(review.id) ? 'text-blue-500 font-semibold cursor-default' : 'text-gray-400 hover:text-blue-500'}`}
                            >
                                <ThumbsUp size={12} fill={votedHelpful.has(review.id) ? 'currentColor' : 'none'} />
                                <span>Хэрэгтэй ({review.helpful || 0})</span>
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
