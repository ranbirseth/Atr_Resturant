import { api } from './apiClient';

// Reviews service for the Expo admin app.
// Reuses the existing feedback endpoint (read-only):
//   GET /api/feedback -> feedbacks with populated order + user
//   Response item: { _id, orderId, userId: {name, mobile} | null,
//                    rating (1-5), message, tags[], createdAt, updatedAt }
export async function getFeedbacks() {
  const data = await api.get('/feedback');
  return Array.isArray(data) ? data : [];
}
