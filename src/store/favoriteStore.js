import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useFavoriteStore = create(
    persist(
        (set, get) => ({
            favorites: [],
            toggleFavorite: (product) => {
                const { favorites } = get();
                const isExist = favorites.find((item) => item.id === product.id);
                if (isExist) {
                    set({ favorites: favorites.filter((item) => item.id !== product.id) });
                } else {
                    set({ favorites: [...favorites, product] });
                }
            },
            isFavorite: (productId) => {
                return get().favorites.some((item) => item.id === productId);
            },
        }),
        {
            name: 'favorite-storage',
        }
    )
);
