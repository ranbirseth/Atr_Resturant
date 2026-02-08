import API_URL from '../config';
const API_BASE_URL = API_URL;

/**
 * Verify admin secret code
 * @param {string} code - The admin secret code to verify
 * @returns {Promise<{success: boolean, message: string}>}
 */
export const verifyAdminCode = async (code) => {
    try {
        console.log('Verifying admin code at:', `${API_BASE_URL}/admin/verify-code`);
        const response = await fetch(`${API_BASE_URL}/admin/verify-code`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ code }),
        });

        const data = await response.json();

        if (!response.ok) {
            return {
                success: false,
                message: data.message || 'Authentication failed',
            };
        }

        return {
            success: true,
            message: data.message || 'Authentication successful',
        };
    } catch (error) {
        console.error('Admin auth API error:', error);
        return {
            success: false,
            message: 'Network error. Please check if the server is running.',
        };
    }
};
