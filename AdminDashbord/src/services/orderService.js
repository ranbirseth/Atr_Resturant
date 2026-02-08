import api from '../utils/api';

export const getOrders = async () => {
    const response = await api.get('/orders');
    return response.data;
};

export const getGroupedOrders = async () => {
    const response = await api.get('/orders/grouped');
    return response.data;
};

export const updateOrderStatus = async (id, statusData) => {
    const response = await api.put(`/orders/${id}/status`, statusData);
    return response.data;
};

export const getAnalytics = async (range = '30d') => {
    const response = await api.get(`/orders/analytics?range=${range}`);
    return response.data;
};
