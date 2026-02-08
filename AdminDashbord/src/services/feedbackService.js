import API_URL from '../config';

const API_BASE_URL = `${API_URL}/feedback`;

export const getFeedbacks = async () => {
    try {
        const response = await fetch(API_BASE_URL, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                // If there's a token required, it should be added here. 
                // Based on useAdminAuth, it seems authentication is handled at the app level.
            },
        });

        if (!response.ok) {
            throw new Error('Failed to fetch feedback');
        }

        return await response.json();
    } catch (error) {
        console.error('Error fetching feedback:', error);
        throw error;
    }
};
