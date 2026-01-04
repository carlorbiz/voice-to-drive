/**
 * Voice to Drive - Recorder Service
 * Handles continuous audio recording with:
 * - Device selection (supports headphones)
 * - Chunked saves for crash protection
 * - Audio level monitoring for visualisation
 * - Letterly-style manual pause/resume
 */

const RecorderService = (function() {
    // State
    let mediaRecorder = null;
    let audioContext = null;
    let analyser = null;
    let mediaStream = null;
    let chunks = [];
    let sessionId = null;
    let chunkSequence = 0;
    let chunkInterval = null;
    let startTime = null;
    let pausedDuration = 0;
    let pauseStartTime = null;
    
    // Configuration
    const config = {
        mimeType: 'audio/webm;codecs=opus',
        audioBitsPerSecond: 64000, // Default, can be changed
        chunkIntervalMs: 30000, // Save chunk every 30 seconds
        timeslice: 1000 // Data available every second
    };
    
    // Callbacks
    let onAudioLevel = null;
    let onChunkSaved = null;
    let onError = null;
    
    /**
     * Get available audio input devices
     */
    async function getAudioDevices() {
        try {
            // Need to request permission first to get device labels
            const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            tempStream.getTracks().forEach(track => track.stop());
            
            const devices = await navigator.mediaDevices.enumerateDevices();
            const audioInputs = devices.filter(device => device.kind === 'audioinput');
            
            return audioInputs.map(device => ({
                deviceId: device.deviceId,
                label: device.label || `Microphone ${device.deviceId.slice(0, 8)}`,
                groupId: device.groupId
            }));
        } catch (error) {
            console.error('Failed to get audio devices:', error);
            throw error;
        }
    }
    
    /**
     * Test a specific microphone - returns promise that resolves with audio level
     */
    async function testMicrophone(deviceId, durationMs = 3000) {
        return new Promise(async (resolve, reject) => {
            let testStream = null;
            let testContext = null;
            let testAnalyser = null;
            let maxLevel = 0;
            
            try {
                testStream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        deviceId: deviceId ? { exact: deviceId } : undefined,
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true
                    }
                });
                
                testContext = new (window.AudioContext || window.webkitAudioContext)();
                testAnalyser = testContext.createAnalyser();
                testAnalyser.fftSize = 256;
                
                const source = testContext.createMediaStreamSource(testStream);
                source.connect(testAnalyser);
                
                const dataArray = new Uint8Array(testAnalyser.frequencyBinCount);
                
                const checkLevel = () => {
                    testAnalyser.getByteFrequencyData(dataArray);
                    const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
                    const level = average / 255;
                    if (level > maxLevel) maxLevel = level;
                };
                
                const interval = setInterval(checkLevel, 100);
                
                setTimeout(() => {
                    clearInterval(interval);
                    
                    // Cleanup
                    testStream.getTracks().forEach(track => track.stop());
                    testContext.close();
                    
                    resolve({
                        success: true,
                        level: maxLevel,
                        detected: maxLevel > 0.01 // Some threshold
                    });
                }, durationMs);
                
            } catch (error) {
                if (testStream) testStream.getTracks().forEach(track => track.stop());
                if (testContext) testContext.close();
                reject(error);
            }
        });
    }
    
    /**
     * Initialise the recorder with a specific device
     */
    async function init(deviceId = null, bitrate = 64000) {
        try {
            config.audioBitsPerSecond = bitrate;
            
            // Get audio stream from specified device
            const constraints = {
                audio: {
                    deviceId: deviceId ? { exact: deviceId } : undefined,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: 48000
                }
            };
            
            mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
            
            // Set up audio context for level monitoring
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.8;
            
            const source = audioContext.createMediaStreamSource(mediaStream);
            source.connect(analyser);
            
            console.log('Recorder initialised with device:', deviceId || 'default');
            return true;
            
        } catch (error) {
            console.error('Failed to initialise recorder:', error);
            if (onError) onError(error);
            throw error;
        }
    }
    
    /**
     * Start recording
     */
    function start() {
        if (!mediaStream) {
            throw new Error('Recorder not initialised. Call init() first.');
        }
        
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            console.warn('Already recording');
            return;
        }
        
        // Generate new session ID
        sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        chunks = [];
        chunkSequence = 0;
        pausedDuration = 0;
        pauseStartTime = null;
        
        // Check supported MIME type
        const mimeType = MediaRecorder.isTypeSupported(config.mimeType) 
            ? config.mimeType 
            : 'audio/webm';
        
        mediaRecorder = new MediaRecorder(mediaStream, {
            mimeType,
            audioBitsPerSecond: config.audioBitsPerSecond
        });
        
        mediaRecorder.ondataavailable = handleDataAvailable;
        mediaRecorder.onerror = handleError;
        mediaRecorder.onstop = handleStop;
        
        // Start recording with timeslice for regular data
        mediaRecorder.start(config.timeslice);
        startTime = Date.now();
        
        // Start chunk save interval for crash protection
        startChunkInterval();
        
        // Start audio level monitoring
        monitorAudioLevel();
        
        console.log('Recording started, session:', sessionId);
    }
    
    /**
     * Pause recording
     */
    function pause() {
        if (!mediaRecorder || mediaRecorder.state !== 'recording') {
            console.warn('Not recording, cannot pause');
            return;
        }
        
        mediaRecorder.pause();
        pauseStartTime = Date.now();
        
        // Save current chunk immediately when pausing
        saveCurrentChunk();
        
        console.log('Recording paused');
    }
    
    /**
     * Resume recording
     */
    function resume() {
        if (!mediaRecorder || mediaRecorder.state !== 'paused') {
            console.warn('Not paused, cannot resume');
            return;
        }
        
        if (pauseStartTime) {
            pausedDuration += Date.now() - pauseStartTime;
            pauseStartTime = null;
        }
        
        mediaRecorder.resume();
        console.log('Recording resumed');
    }
    
    /**
     * Stop recording and return the blob
     */
    async function stop() {
        return new Promise((resolve, reject) => {
            if (!mediaRecorder) {
                reject(new Error('No recording in progress'));
                return;
            }
            
            // Stop chunk interval
            stopChunkInterval();
            
            // Store completion handler
            mediaRecorder.onstop = async (event) => {
                try {
                    // Create final blob from all chunks
                    const blob = new Blob(chunks, { type: mediaRecorder.mimeType });
                    const duration = getElapsedTime();
                    
                    // Clear chunks from storage (recording completed successfully)
                    await StorageService.clearSessionChunks(sessionId);
                    
                    console.log('Recording stopped, duration:', duration, 'size:', blob.size);
                    
                    resolve({
                        blob,
                        duration,
                        sessionId,
                        mimeType: mediaRecorder.mimeType
                    });
                    
                    // Reset state
                    chunks = [];
                    sessionId = null;
                    
                } catch (error) {
                    reject(error);
                }
            };
            
            // Request any remaining data and stop
            if (mediaRecorder.state !== 'inactive') {
                mediaRecorder.stop();
            }
        });
    }
    
    /**
     * Cancel recording and discard
     */
    async function cancel() {
        stopChunkInterval();
        
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.onstop = null; // Remove handler to prevent processing
            mediaRecorder.stop();
        }
        
        // Clear saved chunks
        if (sessionId) {
            await StorageService.clearSessionChunks(sessionId);
        }
        
        // Reset state
        chunks = [];
        sessionId = null;
    }
    
    /**
     * Resume recording from crash recovery data
     */
    async function resumeFromRecovery(recoveryData) {
        // 1. Restore state
        sessionId = recoveryData.sessionId;
        startTime = recoveryData.startTime;
        pausedDuration = recoveryData.pausedDuration;
        chunkSequence = recoveryData.chunkSequence;
        
        // 2. Load chunks from storage
        const loadedChunks = await StorageService.loadSessionChunks(sessionId);
        chunks = loadedChunks.map(c => c.blob);
        
        // 3. Re-initialise MediaRecorder
        const mimeType = MediaRecorder.isTypeSupported(config.mimeType) 
            ? config.mimeType 
            : 'audio/webm';
            
        mediaRecorder = new MediaRecorder(mediaStream, {
            mimeType,
            audioBitsPerSecond: config.audioBitsPerSecond
        });
        
        mediaRecorder.ondataavailable = handleDataAvailable;
        mediaRecorder.onerror = handleError;
        mediaRecorder.onstop = handleStop;
        
        // 4. Resume recording
        mediaRecorder.start(config.timeslice);
        
        // 5. Restart interval and monitoring
        startChunkInterval();
        monitorAudioLevel();
        
        console.log('Resumed from recovery, session:', sessionId);
    }
    
    /**
     * Get current state of the recorder
     */
    function getState() {
        if (!mediaRecorder) {
            return 'inactive';
        }
        return mediaRecorder.state;
    }
    
    /**
     * Get elapsed time in seconds
     */
    function getElapsedTime() {
        if (!startTime) return 0;
        
        let elapsed = Date.now() - startTime;
        
        // Subtract time spent paused
        elapsed -= pausedDuration;
        
        // If currently paused, subtract time since pause started
        if (mediaRecorder && mediaRecorder.state === 'paused' && pauseStartTime) {
            elapsed -= Date.now() - pauseStartTime;
        }
        
        return Math.floor(elapsed / 1000);
    }
    
    /**
     * Set callbacks
     */
    function setCallbacks(callbacks) {
        onAudioLevel = callbacks.onAudioLevel;
        onChunkSaved = callbacks.onChunkSaved;
        onError = callbacks.onError;
    }
    
    // Internal Handlers
    
    function handleDataAvailable(event) {
        if (event.data.size > 0) {
            chunks.push(event.data);
        }
    }
    
    function handleError(event) {
        console.error('MediaRecorder Error:', event.error);
        if (onError) onError(event.error);
        stopChunkInterval();
    }
    
    function startChunkInterval() {
        if (chunkInterval) {
            clearInterval(chunkInterval);
        }
        chunkInterval = setInterval(saveCurrentChunk, config.chunkIntervalMs);
    }
    
    function stopChunkInterval() {
        if (chunkInterval) {
            clearInterval(chunkInterval);
            chunkInterval = null;
        }
    }
    
    /**
     * Saves the current recording state and accumulated chunks to IndexedDB for crash recovery.
     */
    async function saveCurrentChunk() {
        if (chunks.length === 0) return;
        
        // 1. Save accumulated chunks
        const chunkBlob = new Blob(chunks, { type: mediaRecorder.mimeType });
        const chunkInfo = {
            sessionId,
            sequence: chunkSequence++,
            blob: chunkBlob,
            timestamp: Date.now()
        };
        
        await StorageService.saveChunk(chunkInfo);
        if (onChunkSaved) onChunkSaved(chunkInfo);
        
        // Clear in-memory chunks after saving
        chunks = [];
        
        // 2. Save recovery data
        const recoveryData = {
            sessionId,
            startTime,
            pausedDuration,
            chunkSequence,
            timestamp: Date.now()
        };
        await StorageService.saveRecoveryData(recoveryData);
    }
    
    function monitorAudioLevel() {
        if (!analyser || !onAudioLevel) return;
        
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        
        const checkLevel = () => {
            if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                analyser.getByteFrequencyData(dataArray);
                const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
                const level = average / 255;
                onAudioLevel(level);
                requestAnimationFrame(checkLevel);
            }
        };
        
        requestAnimationFrame(checkLevel);
    }
    
    // Public API
    return {
        init: init,
        start: start,
        pause: pause,
        resume: resume,
        stop: stop,
        cancel: cancel,
        getState: getState,
        getElapsedTime: getElapsedTime,
        getAudioDevices: getAudioDevices,
        testMicrophone: testMicrophone,
        setCallbacks: setCallbacks,
        resumeFromRecovery: resumeFromRecovery
    };
})();
