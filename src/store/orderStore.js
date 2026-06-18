import { create } from 'zustand';
import { orderService } from '../services/orderService';
import { buildTrackingUpdate } from '../utils/orderTracking';

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

    fetchUserOrders: async (userId, userPhone) => {
        set({ isLoading: true, error: null });
        try {
            const orders = await orderService.getUserOrders(userId, userPhone);
            set({ orders, isLoading: false });
        } catch (error) {
            console.error("Failed to fetch user orders:", error);
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
            return newOrder;
        } catch (error) {
            console.error("Failed to create order:", error);
            set({ isLoading: false, error: error.message });
            // Rethrow so the caller (e.g. PaymentPage) knows it failed and does NOT
            // clear the cart or show a success message for an order that wasn't saved.
            throw error;
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

    // Advance (or regress) an order to a fulfilment stage. The pipeline acts like
    // a slider — see buildTrackingUpdate. Optimistically updates the in-memory
    // order, then persists trackingStage/trackingHistory + the synced legacy
    // status. Used by the admin "tap a stage" tool.
    setOrderStage: async (orderId, stageKey, note = '') => {
        const order = get().orders.find(o => o.id === orderId);
        if (!order) return;
        const update = buildTrackingUpdate(order, stageKey, note);
        if (!update) return;

        const originalOrders = get().orders;
        set(state => ({
            orders: state.orders.map(o => o.id === orderId ? { ...o, ...update } : o)
        }));

        try {
            await orderService.updateOrderTracking(orderId, update);
        } catch (error) {
            console.error("Failed to set order stage:", error);
            set({ orders: originalOrders, error: error.message });
            throw error;
        }
    },

    // Bulk-advance many orders to the same stage at once (batch import workflow).
    // Each order's history is computed individually so timestamps/notes already on
    // a given order are preserved. Optimistically updates all, then persists in one
    // atomic batch; reverts everything on failure. Returns the count applied.
    setOrdersStage: async (orderIds, stageKey, note = '') => {
        const ids = Array.from(new Set(orderIds));
        const ordersById = new Map(get().orders.map(o => [o.id, o]));
        const items = [];
        for (const id of ids) {
            const order = ordersById.get(id);
            if (!order) continue;
            const update = buildTrackingUpdate(order, stageKey, note);
            if (update) items.push({ orderId: id, ...update });
        }
        if (items.length === 0) return 0;

        const originalOrders = get().orders;
        const updateById = new Map(items.map(it => [it.orderId, it]));
        set(state => ({
            orders: state.orders.map(o => updateById.has(o.id) ? { ...o, ...updateById.get(o.id) } : o)
        }));

        try {
            await orderService.bulkUpdateOrderTracking(items);
            return items.length;
        } catch (error) {
            console.error("Failed to bulk-set order stages:", error);
            set({ orders: originalOrders, error: error.message });
            throw error;
        }
    },

    // Patch arbitrary fields on a single order (e.g. courier trackingNumber).
    patchOrder: async (orderId, patch) => {
        const originalOrders = get().orders;
        set(state => ({
            orders: state.orders.map(o => o.id === orderId ? { ...o, ...patch } : o)
        }));
        try {
            await orderService.updateOrder(orderId, patch);
        } catch (error) {
            console.error("Failed to patch order:", error);
            set({ orders: originalOrders, error: error.message });
            throw error;
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
