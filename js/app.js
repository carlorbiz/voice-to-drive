/**
 * Voice to Drive - Main Application
 * Coordinates all services: Storage, Recorder, Drive, UI
 */

const App = (function() {
    const Supabase = SupabaseService;
    // Configuration
    const CONFIG = {
        // Replace with your Google Cloud credentials
        SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
        SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
        GOOGLE_CLIENT_ID: '45424427828-jus2sj7li3iabnmff4bu1t81fkf88sbr.apps.googleusercontent.com',
        GOOGLE_API_KEY: '', // Optional for Drive API
        
        // Recording settings
        DEFAULT_BITRATE: 64000,
        AUTOSAVE_ENABLED: true,
        
        // Sync settings
        SYNC_INTERVAL_MS: 30000,
        MAX_RETRY_COUNT: 5
    };
    
    // State
    let isReady = false;
    let selectedMicId = null;
    let syncInterval = null;
    let isSyncing = false;
    
    /**
     * Initialise the application
     */
    async function init() {
        try {
            console.log('Initialising Voice to Drive...');
            
            // Initialise UI
            UIService.init();
            Supabase.init(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
            
            // Initialise storage
            await StorageService.init();
            console.log('Storage initialised');
            
            // Load saved settings
            selectedMicId = await StorageService.getSetting('selectedMic');
            
            // Configure Drive service
            DriveService.configure(CONFIG.GOOGLE_CLIENT_ID, CONFIG.GOOGLE_API_KEY);
            
            // Check for orphaned sessions (crash recovery)
            await checkForRecovery();
            
            // Set up event listeners
            setupEventListeners();
            
            // Update network status
            updateNetworkStatus();
            window.addEventListener('online', updateNetworkStatus);
            window.addEventListener('offline', updateNetworkStatus);
            
            // Check if setup is needed
            const setupComplete = await StorageService.getSetting('setupComplete');
            
            if (setupComplete) {
                await startApp();
            } else {
                await showSetup();
            }
            
            console.log('App initialised successfully');
            
        } catch (error) {
            console.error('Failed to initialise app:', error);
            UIService.toast('Failed to start app: ' + error.message, 'error');
        }
    }
    
    /**
     * Show setup screen
     */
    async function showSetup() {
        UIService.showScreen('setup');
        
        // Get available microphones
        try {
            const devices = await RecorderService.getAudioDevices();
            UIService.populateMicrophoneSelect(devices, selectedMicId);
        } catch (error) {
            UIService.showMicTestResult('error', 'Microphone access denied. Please allow microphone access.');
        }
        
        // Check Drive connection
        try {
            const signedIn = await DriveService.init();
            if (signedIn) {
                const user = DriveService.getCurrentUser();
                UIService.showDriveStatus('success', `Connected as ${user?.email || 'Unknown'}`);
                checkSetupComplete();
            }
        } catch (error) {
            console.error('Drive init error:', error);
        }
    }
    
    /**
     * Start the main app
     */
    async function startApp() {
        UIService.showScreen('main');
        
        // Initialise Drive if not already
        if (!DriveService.isAuthenticated()) {
            try {
                await DriveService.init();
            } catch (error) {
                console.error('Drive init error:', error);
            }
        }
        
        // Initialise recorder with saved mic
        try {
            await RecorderService.init(selectedMicId, CONFIG.DEFAULT_BITRATE);
            
            // Set up recorder callbacks
            RecorderService.setCallbacks({
                onAudioLevel: (level) => {
                    if (RecorderService.getState() === 'recording') {
                        UIService.updateVisualiser(level);
                    }
                },
                onChunkSaved: (info) => {
                    console.log('Chunk saved:', info);
                },
                onError: (error) => {
                    console.error('Recorder error:', error);
                    UIService.toast('Recording error: ' + error.message, 'error');
                }
            });
        } catch (error) {
            UIService.toast('Failed to access microphone', 'error');
        }
        
        // Start sync interval
        startSyncInterval();
        
        // Update UI
        await updateRecordingsList();
        await updateSyncStatus();
        
        isReady = true;
    }
    
    /**
     * Set up event listeners
     */
    function setupEventListeners() {
        // Setup screen
        UIService.elements.micSelect?.addEventListener('change', handleMicChange);
        UIService.elements.btnTestMic?.addEventListener('click', handleTestMic);
        UIService.elements.btnConnectDrive?.addEventListener('click', handleConnectDrive);
        UIService.elements.btnStartApp?.addEventListener('click', handleStartApp);
        
        // Main screen
        UIService.elements.btnRecord?.addEventListener('click', handleRecordToggle);
        UIService.elements.btnStop?.addEventListener('click', handleStop);
        UIService.elements.btnCancel?.addEventListener('click', handleCancel);
        UIService.elements.btnSettings?.addEventListener('click', () => showSettings(true));
        UIService.elements.btnToggleRecordings?.addEventListener('click', () => UIService.toggleRecordingsPanel());
        
        // Settings modal
        UIService.elements.settingsModal?.querySelector('.modal-backdrop')?.addEventListener('click', () => showSettings(false));
        UIService.elements.btnCloseSettings?.addEventListener('click', () => showSettings(false));
        UIService.elements.settingsMic?.addEventListener('change', handleSettingsMicChange);
        UIService.elements.settingsQuality?.addEventListener('change', handleSettingsQualityChange);
        UIService.elements.settingsAutosave?.addEventListener('change', handleSettingsAutosaveChange);
        UIService.elements.btnDisconnectDrive?.addEventListener('click', handleDisconnectDrive);
        UIService.elements.btnClearSynced?.addEventListener('click', handleClearSynced);
        
        // Keyboard shortcuts
        document.addEventListener('keydown', handleKeydown);
        
        // Visibility change (for pause on tab switch)
        document.addEventListener('visibilitychange', handleVisibilityChange);
        
        // Before unload (save any in-progress recording)
        window.addEventListener('beforeunload', handleBeforeUnload);
    }
    
    // Event Handlers
    
    async function handleMicChange(e) {
        selectedMicId = e.target.value;
        await StorageService.setSetting('selectedMic', selectedMicId);
        UIService.showMicTestResult('', '');
        checkSetupComplete();
    }
    
    async function handleTestMic() {
        const deviceId = UIService.elements.micSelect.value;
        
        UIService.showMicTestResult('listening', 'Listening... Speak now');
        UIService.elements.btnTestMic.disabled = true;
        
        try {
            const result = await RecorderService.testMicrophone(deviceId, 3000);
            
            if (result.detected) {
                UIService.showMicTestResult('success', `✓ Audio detected! Level: ${Math.round(result.level * 100)}%`);
            } else {
                UIService.showMicTestResult('error', 'No audio detected. Check your microphone.');
            }
        } catch (error) {
            UIService.showMicTestResult('error', 'Failed to test microphone: ' + error.message);
        }
        
        UIService.elements.btnTestMic.disabled = false;
        checkSetupComplete();
    }
    
    async function handleConnectDrive() {
        try {
            UIService.elements.btnConnectDrive.disabled = true;
            UIService.elements.btnConnectDrive.textContent = 'Connecting...';
            
            await DriveService.signIn();
            
            const user = DriveService.getCurrentUser();
            UIService.showDriveStatus('success', `Connected as ${user?.email || 'Unknown'}`);
            checkSetupComplete();
            
        } catch (error) {
            console.error('Drive sign in error:', error);
            UIService.showDriveStatus('error', 'Failed to connect: ' + error.message);
            UIService.elements.btnConnectDrive.disabled = false;
            UIService.elements.btnConnectDrive.textContent = 'Connect to Google Drive';
        }
    }
    
    async function handleStartApp() {
        await StorageService.setSetting('setupComplete', true);
        await startApp();
    }
    
    function checkSetupComplete() {
        const micSelected = UIService.elements.micSelect.value;
        const driveConnected = DriveService.isAuthenticated();
        
        UIService.enableStartApp(micSelected && driveConnected);
    }
    
    async function handleRecordToggle() {
        const state = RecorderService.getState();
        
        if (state === 'inactive') {
            // Start recording
            try {
                RecorderService.start();
                UIService.setRecordingState('recording');
                UIService.startTimer(() => RecorderService.getElapsedTime());
                UIService.toast('Recording started', 'success');
            } catch (error) {
                UIService.toast('Failed to start recording: ' + error.message, 'error');
            }
        } else if (state === 'recording') {
            // Pause recording
            RecorderService.pause();
            UIService.setRecordingState('paused');
            UIService.toast('Recording paused', 'info');
        } else if (state === 'paused') {
            // Resume recording
            RecorderService.resume();
            UIService.setRecordingState('recording');
            UIService.toast('Recording resumed', 'success');
        }
    }
    
    async function handleStop() {
        try {
            UIService.updateStatusMessage('Saving...');
            UIService.setRecordingState('saving');
            
            const recording = await RecorderService.stop();
            
            if (recording) {
                // Save to IndexedDB
                await StorageService.saveRecording(recording);
                
                // Save to Supabase
                await Supabase.uploadAndInsertMetadata(recording.blob, recording.id, recording.duration);
                
                UIService.toast('Recording saved locally and backed up to Supabase!', 'success');
                await updateRecordingsList();
                await updateSyncStatus();
                
                // Attempt immediate Drive sync
                await syncRecordings();
            }
            
            UIService.setRecordingState('inactive');
            UIService.stopTimer();
            
        } catch (error) {
            console.error('Failed to stop recording:', error);
            UIService.toast('Failed to stop recording: ' + error.message, 'error');
            UIService.setRecordingState('inactive');
            UIService.stopTimer();
        }
    }
    
    async function handleCancel() {
        if (RecorderService.getState() !== 'inactive') {
            RecorderService.cancel();
            UIService.setRecordingState('inactive');
            UIService.stopTimer();
            UIService.toast('Recording cancelled', 'info');
        }
    }
    
    async function handleSettingsMicChange(e) {
        const newMicId = e.target.value;
        await StorageService.setSetting('selectedMic', newMicId);
        selectedMicId = newMicId;
        
        // Re-initialise recorder with new mic
        try {
            await RecorderService.init(selectedMicId, CONFIG.DEFAULT_BITRATE);
            UIService.toast('Microphone updated', 'success');
        } catch (error) {
            UIService.toast('Failed to switch microphone', 'error');
        }
    }
    
    async function handleSettingsQualityChange(e) {
        const newBitrate = parseInt(e.target.value);
        await StorageService.setSetting('defaultBitrate', newBitrate);
        CONFIG.DEFAULT_BITRATE = newBitrate;
        
        // Re-initialise recorder with new bitrate
        try {
            await RecorderService.init(selectedMicId, CONFIG.DEFAULT_BITRATE);
            UIService.toast('Recording quality updated', 'success');
        } catch (error) {
            UIService.toast('Failed to update quality', 'error');
        }
    }
    
    async function handleSettingsAutosaveChange(e) {
        const autosaveEnabled = e.target.checked;
        await StorageService.setSetting('autosaveEnabled', autosaveEnabled);
        CONFIG.AUTOSAVE_ENABLED = autosaveEnabled;
        UIService.toast(`Autosave ${autosaveEnabled ? 'enabled' : 'disabled'}`, 'info');
    }
    
    async function handleDisconnectDrive() {
        try {
            await DriveService.signOut();
            UIService.toast('Disconnected from Google Drive', 'info');
            await updateSyncStatus();
        } catch (error) {
            UIService.toast('Failed to disconnect Drive', 'error');
        }
    }
    
    async function handleClearSynced() {
        if (confirm('Are you sure you want to clear all synced recordings from local storage? This will not delete files from Google Drive.')) {
            try {
                await StorageService.clearSyncedRecordings();
                await updateRecordingsList();
                UIService.toast('Cleared synced recordings from local storage', 'success');
            } catch (error) {
                UIService.toast('Failed to clear recordings', 'error');
            }
        }
    }
    
    function handleKeydown(e) {
        if (e.key === ' ' && isReady) { // Spacebar to toggle record
            e.preventDefault();
            handleRecordToggle();
        } else if (e.key === 'Escape' && RecorderService.getState() !== 'inactive') { // Escape to cancel
            e.preventDefault();
            handleCancel();
        }
    }
    
    function handleVisibilityChange() {
        if (document.visibilityState === 'hidden' && RecorderService.getState() === 'recording' && CONFIG.AUTOSAVE_ENABLED) {
            // Auto-save on tab switch if autosave is enabled
            handleStop();
        }
    }
    
    async function handleBeforeUnload(e) {
        if (RecorderService.getState() !== 'inactive') {
            e.preventDefault();
            e.returnValue = 'You have an active recording. Are you sure you want to leave?';
            
            // Attempt to auto-save before closing
            if (CONFIG.AUTOSAVE_ENABLED) {
                await handleStop();
            }
        }
    }
    
    // Sync Logic
    
    function startSyncInterval() {
        if (syncInterval) {
            clearInterval(syncInterval);
        }
        syncInterval = setInterval(syncRecordings, CONFIG.SYNC_INTERVAL_MS);
    }
    
    async function syncRecordings() {
        if (isSyncing || !DriveService.isAuthenticated()) {
            return;
        }
        
        isSyncing = true;
        UIService.setSyncStatus('syncing');
        
        try {
            // Use Supabase as the source of truth for unsynced recordings
            const unsynced = await Supabase.getUnsyncedToDriveRecords();
            
            if (unsynced.length === 0) {
                UIService.setSyncStatus('synced');
                isSyncing = false;
                return;
            }
            
            console.log(`Starting sync for ${unsynced.length} recordings...`);
            
            for (const recording of unsynced) {
                // 1. Upload to Drive
                const driveFile = await DriveService.uploadRecording(recording);
                
                // 2. Update local storage with Drive ID and synced status
                await StorageService.markRecordingAsSynced(recording.id, driveFile.id);
                
                // 3. Update Supabase with Drive ID
                await Supabase.markSyncedToDrive(recording.id, driveFile.id);
                
                UIService.toast(`Synced: ${recording.title}`, 'info');
            }
            
            await updateRecordingsList();
            UIService.setSyncStatus('synced');
            
        } catch (error) {
            console.error('Sync failed:', error);
            UIService.setSyncStatus('error');
            UIService.toast('Sync failed: ' + error.message, 'error');
        } finally {
            isSyncing = false;
        }
    }
    
    // UI Updates
    
    async function updateRecordingsList() {
        const recordings = await StorageService.getAllRecordings();
        UIService.updateRecordingsList(recordings);
    }
    
    async function updateSyncStatus() {
        const isAuthenticated = DriveService.isAuthenticated();
        let unsyncedCount = 0;
        try {
            unsyncedCount = (await StorageService.getUnsyncedRecordings()).length;
        } catch (e) {
            console.error('Failed to get unsynced count:', e);
        }
        
        if (!isAuthenticated) {
            UIService.setSyncStatus('disconnected');
        } else if (unsyncedCount > 0) {
            UIService.setSyncStatus('pending', unsyncedCount);
        } else {
            UIService.setSyncStatus('synced');
        }
    }
    
    function updateNetworkStatus() {
        if (navigator.onLine) {
            UIService.setNetworkStatus('online');
        } else {
            UIService.setNetworkStatus('offline');
        }
    }
    
    // Recovery
    
    async function checkForRecovery() {
        const recoveryData = await StorageService.getRecoveryData();
        if (recoveryData) {
            UIService.showRecoveryPrompt(recoveryData.title, async () => {
                // Resume recording from recovery data
                try {
                    await RecorderService.resumeFromRecovery(recoveryData);
                    UIService.setRecordingState('recording');
                    UIService.startTimer(() => RecorderService.getElapsedTime());
                    UIService.toast('Recording resumed from crash recovery', 'warning');
                } catch (error) {
                    UIService.toast('Failed to resume recording', 'error');
                    await StorageService.clearRecoveryData();
                }
            }, async () => {
                // Discard recording
                await StorageService.clearRecoveryData();
                UIService.toast('Discarded recovered recording', 'info');
            });
        }
    }
    
    // Public API
    return {
        init: init,
        handleRecordToggle: handleRecordToggle,
        handleStop: handleStop,
        handleCancel: handleCancel,
        showSettings: UIService.showSettings,
        handleConnectDrive: handleConnectDrive,
        handleDisconnectDrive: handleDisconnectDrive,
        handleClearSynced: handleClearSynced,
        handleStartApp: handleStartApp,
        checkSetupComplete: checkSetupComplete,
        updateRecordingsList: updateRecordingsList,
        updateSyncStatus: updateSyncStatus
    };
})();

window.addEventListener('load', App.init);
