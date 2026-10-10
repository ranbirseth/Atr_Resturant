import { api } from './apiClient';

// Menu & Categories service for the Expo admin app.
// Item mutations require the dual-price fields; category mutations carry the
// per-audience visibility flags. Staff listing is requested explicitly.

export async function getItems(audience) {
  const target = audience === 'staff' ? 'staff' : 'customer';
  const data = await api.get(`/items?audience=${target}`);
  return Array.isArray(data) ? data : [];
}

export async function createItem(payload) {
  return api.post('/items', payload);
}

export async function updateItem(id, payload) {
  if (!id) {
    throw new Error('updateItem requires an item id');
  }
  return api.put(`/items/${id}`, payload);
}

export async function deleteItem(id) {
  if (!id) {
    throw new Error('deleteItem requires an item id');
  }
  return api.delete(`/items/${id}`);
}

export async function getCategories() {
  const data = await api.get('/categories');
  return Array.isArray(data) ? data : [];
}

export async function createCategory(payload) {
  return api.post('/categories', payload);
}

export async function updateCategory(id, payload) {
  if (!id) {
    throw new Error('updateCategory requires a category id');
  }
  return api.put(`/categories/${id}`, payload);
}

export async function deleteCategory(id) {
  if (!id) {
    throw new Error('deleteCategory requires a category id');
  }
  return api.delete(`/categories/${id}`);
}
