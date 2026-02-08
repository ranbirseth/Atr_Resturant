import { useState, useEffect } from 'react';

const ADMIN_AUTH_KEY = 'adminAuthenticated';

/**
 * Custom hook for managing admin authentication state
 * @returns {Object} Authentication state and methods
 */
export const useAdminAuth = () => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    // Check authentication status on mount
    useEffect(() => {
        const authStatus = sessionStorage.getItem(ADMIN_AUTH_KEY);
        setIsAuthenticated(authStatus === 'true');
        setIsLoading(false);
    }, []);

    /**
     * Set authentication status
     * @param {boolean} status - Authentication status
     */
    const setAuthStatus = (status) => {
        setIsAuthenticated(status);
        if (status) {
            sessionStorage.setItem(ADMIN_AUTH_KEY, 'true');
        } else {
            sessionStorage.removeItem(ADMIN_AUTH_KEY);
        }
    };

    /**
     * Login with admin code
     */
    const login = () => {
        setAuthStatus(true);
    };

    /**
     * Logout and clear session
     */
    const logout = () => {
        setAuthStatus(false);
    };

    return {
        isAuthenticated,
        isLoading,
        login,
        logout,
    };
};
