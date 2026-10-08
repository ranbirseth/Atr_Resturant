const API_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";
export const SOCKET_URL = import.meta.env.VITE_API_BASE_URL ? import.meta.env.VITE_API_BASE_URL.replace('/api', '') : "http://localhost:5000";

export default API_URL;
