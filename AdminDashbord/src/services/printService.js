import axios from 'axios';
import API_URL from '../config';

// Local Print Service URL
const PRINT_SERVICE_URL = 'http://localhost:6000';

/**
 * Sends a print job to the local print service
 * @param {Object} order - The order object
 * @param {String} type - 'KITCHEN', 'ADMIN', or 'BOTH'
 */
export const printOrder = async (order, type = 'BOTH') => {
    try {
        const response = await axios.post(`${PRINT_SERVICE_URL}/print`, {
            order,
            type
        });
        return response.data;
    } catch (error) {
        console.error('Print Service Error:', error);
        throw new Error('Failed to connect to Local Print Service. Is it running?');
    }
};

/**
 * Confirms to the backend that printing was successful
 * @param {Array} orderIds - List of order IDs (from session)
 * @param {String} printId - The print job ID
 */
export const confirmPrintSuccess = async (orderIds, printId) => {
    try {
        const response = await axios.put(`${API_URL}/orders/print-success`, {
            orderIds,
            printId
        });
        return response.data;
    } catch (error) {
        console.error('Backend Confirmation Error:', error);
        // Don't throw here, as printing already happened physically.
        // We just want to log it.
        return null;
    }
};
