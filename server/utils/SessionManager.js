/**
 * SessionManager - Utility for managing customer session IDs
 * 
 * Session Strategy: Day-based
 * - All orders from the same customer on the same calendar day share a sessionId
 * - New day = new session
 * - Format: user_{userId}_date_{YYYYMMDD}
 */

class SessionManager {
    /**
     * Generate a session ID for a user based on current date
     * @param {String} userId - MongoDB ObjectId as string
     * @param {Date} date - Optional date, defaults to current date
     * @returns {String} sessionId
     */
    static generateSessionId(userId, date = new Date()) {
        const dateStr = this.formatDate(date);
        return `user_${userId}_date_${dateStr}`;
    }

    /**
     * Get current active session ID for a user
     * @param {String} userId - MongoDB ObjectId as string
     * @returns {String} sessionId for today
     */
    static getCurrentSessionId(userId) {
        return this.generateSessionId(userId, new Date());
    }

    /**
     * Format date to YYYYMMDD
     * @param {Date} date - Date object
     * @returns {String} formatted date string
     */
    static formatDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}${month}${day}`;
    }

    /**
     * Extract userId from sessionId
     * @param {String} sessionId - Session ID
     * @returns {String|null} userId or null if invalid format
     */
    static extractUserId(sessionId) {
        const match = sessionId.match(/^user_([a-f0-9]+)_date_\d{8}$/);
        return match ? match[1] : null;
    }

    /**
     * Extract date from sessionId
     * @param {String} sessionId - Session ID
     * @returns {Date|null} Date object or null if invalid
     */
    static extractDate(sessionId) {
        const match = sessionId.match(/^user_[a-f0-9]+_date_(\d{8})$/);
        if (!match) return null;

        const dateStr = match[1];
        const year = parseInt(dateStr.substring(0, 4));
        const month = parseInt(dateStr.substring(4, 6)) - 1;
        const day = parseInt(dateStr.substring(6, 8));

        return new Date(year, month, day);
    }

    /**
     * Check if a session is still active (same day)
     * @param {String} sessionId - Session ID
     * @returns {Boolean} true if session is for today
     */
    static isSessionActive(sessionId) {
        const sessionDate = this.extractDate(sessionId);
        if (!sessionDate) return false;

        const today = new Date();
        return (
            sessionDate.getFullYear() === today.getFullYear() &&
            sessionDate.getMonth() === today.getMonth() &&
            sessionDate.getDate() === today.getDate()
        );
    }

    /**
     * Validate sessionId format
     * @param {String} sessionId - Session ID
     * @returns {Boolean} true if valid format
     */
    static isValidFormat(sessionId) {
        return /^user_[a-f0-9]+_date_\d{8}$/.test(sessionId);
    }

    /**
     * Generate legacy sessionId for migration
     * @param {String} orderId - Order MongoDB ObjectId
     * @returns {String} legacy sessionId
     */
    static generateLegacySessionId(orderId) {
        return `legacy_${orderId}`;
    }
}

module.exports = SessionManager;
