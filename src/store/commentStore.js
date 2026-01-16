import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useCommentStore = create(
    persist(
        (set, get) => ({
            comments: [
                { id: 1, productId: 1, user: 'Boldoo', text: 'This TV is amazing!', date: '2025-12-10' },
                { id: 2, productId: 1, user: 'Saraa', text: 'Good quality, fast delivery.', date: '2025-12-12' },
            ],
            addComment: (productId, text, user = 'Зочин') => {
                const newComment = {
                    id: Date.now(),
                    productId,
                    user,
                    text: text,
                    date: new Date().toISOString().split('T')[0],
                };
                set({ comments: [newComment, ...get().comments] });
            },
            getCommentsByProduct: (productId) => {
                return get().comments.filter((c) => c.productId === productId);
            },
        }),
        {
            name: 'comment-storage',
        }
    )
);
