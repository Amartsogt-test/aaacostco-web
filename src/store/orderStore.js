import { create } from 'zustand';
import { orderService } from '../services/orderService';

export const useOrderStore = create((set, get) => ({
    orders: [],
    isLoading: false,
    error: null,

    fetchOrders: async () => {
        set({ isLoading: true, error: null });
        try {
            const orders = await orderService.getOrders();
            set({ orders, isLoading: false });
        } catch (error) {
            console.error("Failed to fetch orders:", error);
            set({ isLoading: false, error: error.message });
        }
    },

    createOrder: async (orderData, customId = null) => {
        set({ isLoading: true });
        try {
            const newOrder = await orderService.createOrder(orderData, customId);
            set(state => ({
                orders: [newOrder, ...state.orders],
                isLoading: false
            }));
        } catch (error) {
            console.error("Failed to create order:", error);
            set({ isLoading: false, error: error.message });
        }
    },

    updateOrderStatus: async (orderId, newStatus) => {
        // Optimistically update
        const originalOrders = get().orders;
        set(state => ({
            orders: state.orders.map(order =>
                order.id === orderId ? { ...order, status: newStatus } : order
            )
        }));

        try {
            await orderService.updateOrderStatus(orderId, newStatus);
        } catch (error) {
            // Revert on failure
            console.error("Failed to update order status:", error);
            set({ orders: originalOrders, error: error.message });
        }
    },

    deleteOrder: async (orderId) => {
        // Optimistically delete
        const originalOrders = get().orders;
        set(state => ({
            orders: state.orders.filter(order => order.id !== orderId)
        }));

        try {
            await orderService.deleteOrder(orderId);
        } catch (error) {
            // Revert on failure
            console.error("Failed to delete order:", error);
            set({ orders: originalOrders, error: error.message });
        }
    },
}));
