import axios from 'axios';

const api = axios.create({
    baseURL: 'https://resturent-billing.onrender.com/api',
});

export const getMenuItems = (category) => api.get('/menu-items', { params: { category } });
export const createMenuItem = (itemData) => api.post('/menu-items', itemData);
export const updateMenuItem = (id, itemData) => api.put(`/menu-items/${id}`, itemData);
export const toggleMenuItem = (id) => api.patch(`/menu-items/${id}/toggle`);
export const deleteMenuItem = (id) => api.delete(`/menu-items/${id}`);

export const createOrder = (orderData) => api.post('/orders', orderData);
export const getOrderById = (id) => api.get(`/orders/${id}`);

export default api;
