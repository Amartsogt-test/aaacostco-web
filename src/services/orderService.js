// orderService — Cloudflare Worker only (Firestore removed).
// Orders live in D1; reads/writes go through the Worker order + admin APIs.
import { orderApi, adminApi } from './apiClient';

export const orderService = {
    // All orders (admin).
    async getOrders() {
        try { return (await adminApi.orders())?.orders || []; }
        catch (error) { console.error('Error fetching orders:', error); throw error; }
    },

    // The signed-in user's own orders (D1 returns them by uid + phone from the JWT).
    async getUserOrders(/* userId, userPhone */) {
        try { return (await orderApi.list())?.orders || []; }
        catch (error) { console.error('Error fetching user orders:', error); throw error; }
    },

    // Create an order server-side (mints the id, stamps uid, seeds the timeline).
    async createOrder(orderData) {
        try { const r = await orderApi.create(orderData); return { id: r?.id, ...orderData }; }
        catch (error) { console.error('Error creating order:', error); throw error; }
    },

    // Admin status / tracking updates — the Worker advances the stage + history server-side.
    async updateOrderStatus(orderId, status) {
        try { await adminApi.patchOrder(orderId, { status }); return { id: orderId, status }; }
        catch (error) { console.error('Error updating order status:', error); throw error; }
    },

    async updateOrderTracking(orderId, update) {
        try {
            await adminApi.setStage(orderId, update.trackingStage, update.note || '');
            return { id: orderId, trackingStage: update.trackingStage };
        } catch (error) { console.error('Error updating order tracking:', error); throw error; }
    },

    // Bulk tracking update — many orders advance together (the import workflow).
    async bulkUpdateOrderTracking(items) {
        try {
            for (const it of items) await adminApi.setStage(it.orderId, it.trackingStage, it.note || '');
            return items.length;
        } catch (error) { console.error('Error bulk-updating order tracking:', error); throw error; }
    },

    // Patch arbitrary safe fields (e.g. courier tracking number).
    async updateOrder(orderId, patch) {
        try { await adminApi.patchOrder(orderId, patch); return { id: orderId, ...patch }; }
        catch (error) { console.error('Error updating order:', error); throw error; }
    },

    // Hard delete is not supported on the Worker (orders are never destroyed; use a
    // cancelled status instead). Kept for call-site compatibility.
    async deleteOrder(orderId) {
        try { await adminApi.patchOrder(orderId, { status: 'Cancelled', trackingStage: 'cancelled' }); return orderId; }
        catch (error) { console.error('Error cancelling order:', error); throw error; }
    },

    // Client-side lifetime spend (₩) for display before the server value exists. The Worker
    // is the source of truth (users.totalSpendKRW); this mirrors it from the user's orders.
    async calculateUserSpend(/* uid, phone */) {
        const QUALIFYING = ['confirmed', 'purchased', 'warehouse', 'shipped', 'customs', 'arrived_ub', 'out_for_delivery', 'delivered'];
        const counts = (o) => QUALIFYING.includes(o.trackingStage) || (!o.trackingStage && o.status === 'Хүргэгдсэн');
        try {
            const orders = (await orderApi.list())?.orders || [];
            let totalSpend = 0;
            for (const order of orders) {
                if (!counts(order)) continue;
                const serverKRW = Number(order.priceAudit?.serverSubtotalKRW) || 0;
                if (serverKRW > 0) { totalSpend += serverKRW; continue; }
                if (!order.items) continue;
                totalSpend += order.items.reduce((acc, item) => {
                    const p = Number(item?.price?.value ?? item?.price) || 0;
                    return acc + p * (Number(item?.quantity) || 0);
                }, 0);
            }
            return Math.round(totalSpend);
        } catch (error) { console.error('Error calculating user spend:', error); return 0; }
    },
};
