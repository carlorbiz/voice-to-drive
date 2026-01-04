/**
 * Voice to Drive - Configuration
 * Loads environment variables from .env file
 * 
 * For development: Create a .env file in the project root with:
 * VITE_SUPABASE_URL=your_url
 * VITE_SUPABASE_ANON_KEY=your_key
 * 
 * For plain HTML/JS (no bundler), this file provides a fallback mechanism.
 */

const CONFIG = {
    // Supabase Configuration
    // These will be loaded from window.ENV if available (set by a build process)
    // Otherwise, they must be set manually before the app initializes
    SUPABASE_URL: window.ENV?.SUPABASE_URL || localStorage.getItem('supabase_url') || 'YOUR_SUPABASE_URL',
    SUPABASE_ANON_KEY: window.ENV?.SUPABASE_ANON_KEY || localStorage.getItem('supabase_anon_key') || 'YOUR_SUPABASE_ANON_KEY',
    
    // Google OAuth Configuration
    GOOGLE_CLIENT_ID: '45424427828-jus2sj7li3iabnmff4bu1t81fkf88sbr.apps.googleusercontent.com',
    GOOGLE_API_KEY: '', // Optional for Drive API
    
    // Recording settings
    DEFAULT_BITRATE: 64000,
    AUTOSAVE_ENABLED: true,
    
    // Sync settings
    SYNC_INTERVAL_MS: 30000,
    MAX_RETRY_COUNT: 5,
    
    /**
     * Set Supabase credentials (useful for runtime configuration)
     */
    setSupabaseCredentials(url, anonKey) {
        this.SUPABASE_URL = url;
        this.SUPABASE_ANON_KEY = anonKey;
        // Optionally save to localStorage for persistence
        localStorage.setItem('supabase_url', url);
        localStorage.setItem('supabase_anon_key', anonKey);
    },
    
    /**
     * Validate that required credentials are set
     */
    validate() {
        if (this.SUPABASE_URL === 'YOUR_SUPABASE_URL' || this.SUPABASE_ANON_KEY === 'YOUR_SUPABASE_ANON_KEY') {
            throw new Error(
                'Supabase credentials not configured. ' +
                'Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file, ' +
                'or call CONFIG.setSupabaseCredentials(url, key) before initializing the app.'
            );
        }
    }
};
