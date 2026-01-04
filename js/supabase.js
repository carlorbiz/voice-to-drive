/**
 * Voice to Drive - Supabase Service
 * Handles two-stage sync:
 * 1. Uploads audio blob to Supabase Storage (immediate cloud backup)
 * 2. Inserts/updates metadata in Supabase PostgreSQL
 */
const SupabaseService = (function() {
    // NOTE: Replace with actual Supabase URL and Anon Key in app.js CONFIG
    let supabaseUrl = null;
    let supabaseAnonKey = null;
    let supabase = null;

    function init(url, anonKey) {
        supabaseUrl = url;
        supabaseAnonKey = anonKey;
        if (typeof supabase === 'undefined' && typeof window.supabase !== 'undefined') {
            // Assumes Supabase client library is loaded in index.html
            supabase = window.supabase.createClient(supabaseUrl, supabaseAnonKey);
            console.log('Supabase client initialized.');
        } else {
            console.error('Supabase client library not loaded.');
        }
    }

    /**
     * Uploads an audio blob to Supabase Storage and inserts a record into PostgreSQL.
     * @param {Blob} audioBlob - The audio data to upload.
     * @param {string} recordId - The unique ID of the recording.
     * @param {number} duration - The duration of the recording in seconds.
     * @returns {Promise<object>} - The Supabase record data.
     */
    async function uploadAndInsertMetadata(audioBlob, recordId, duration) {
        if (!supabase) {
            throw new Error('Supabase service not initialized.');
        }

        const fileName = `${recordId}.webm`;
        const bucketName = 'recordings'; // Assumes a 'recordings' bucket exists
        const storagePath = `${recordId}/${fileName}`;

        // 1. Upload to Supabase Storage
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from(bucketName)
            .upload(storagePath, audioBlob, {
                cacheControl: '3600',
                upsert: true,
                contentType: 'audio/webm'
            });

        if (uploadError) {
            console.error('Supabase Storage Upload Error:', uploadError);
            throw uploadError;
        }

        // 2. Insert metadata into PostgreSQL
        const { data: metadata, error: insertError } = await supabase
            .from('recordings') // Assumes a 'recordings' table exists
            .insert([
                {
                    id: recordId,
                    duration: duration,
                    storage_path: storagePath,
                    synced_to_drive: 0, // 0 = false, 1 = true (numeric for IndexedDB compatibility)
                    transcription_status: 'PENDING',
                    created_at: new Date().toISOString()
                }
            ]);

        if (insertError) {
            console.error('Supabase Metadata Insert Error:', insertError);
            throw insertError;
        }

        return metadata;
    }

    /**
     * Retrieves all records that have not been synced to Google Drive.
     * This is the queue for the Drive sync logic.
     * @returns {Promise<Array>} - List of records.
     */
    async function getUnsyncedToDriveRecords() {
        if (!supabase) {
            throw new Error('Supabase service not initialized.');
        }

        const { data, error } = await supabase
            .from('recordings')
            .select('*')
            .eq('synced_to_drive', 0)
            .order('created_at', { ascending: true });

        if (error) {
            console.error('Supabase Query Error:', error);
            throw error;
        }

        return data;
    }

    /**
     * Updates the synced_to_drive status for a record.
     * @param {string} recordId - The unique ID of the recording.
     * @param {string} driveId - The Google Drive file ID.
     * @returns {Promise<object>} - The updated Supabase record data.
     */
    async function markSyncedToDrive(recordId, driveId) {
        if (!supabase) {
            throw new Error('Supabase service not initialized.');
        }

        const { data, error } = await supabase
            .from('recordings')
            .update({ 
                synced_to_drive: 1,
                drive_file_id: driveId
            })
            .eq('id', recordId);

        if (error) {
            console.error('Supabase Update Error:', error);
            throw error;
        }

        return data;
    }

    return {
        init: init,
        uploadAndInsertMetadata: uploadAndInsertMetadata,
        getUnsyncedToDriveRecords: getUnsyncedToDriveRecords,
        markSyncedToDrive: markSyncedToDrive
    };
})();
