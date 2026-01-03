# Voice to Drive

A hands-free Progressive Web App (PWA) for recording voice notes with automatic Google Drive sync. Designed for recording thoughts while driving, walking, or whenever you need voice capture without touching your phone.

## Features

- **Continuous Recording** - Start once, record for up to 90+ minutes
- **Hands-Free Operation** - One tap to start, one tap to stop
- **Device Selection** - Works with headphones, Bluetooth mics, and built-in mics
- **Offline-First** - Records locally, syncs when online
- **Crash Protection** - Chunks saved every 30 seconds
- **Organised Storage** - Auto-creates Year/Month/Day folders in Google Drive
- **Dark Mode** - Easy on the eyes, perfect for driving
- **Glanceable UI** - Large status indicators visible at a glance

## Screenshots

[Coming soon]

## Quick Start

### 1. Get Google Cloud Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (e.g., "Voice to Drive")
3. Enable the **Google Drive API**:
   - Go to APIs & Services > Library
   - Search for "Google Drive API"
   - Click Enable
4. Create OAuth 2.0 credentials:
   - Go to APIs & Services > Credentials
   - Click "Create Credentials" > "OAuth client ID"
   - Choose "Web application"
   - Add authorized JavaScript origins:
     - `http://localhost:3000` (for development)
     - `https://your-domain.com` (for production)
   - Save the **Client ID**

### 2. Configure the App

Edit `js/app.js` and replace the placeholder credentials:

```javascript
const CONFIG = {
    GOOGLE_CLIENT_ID: 'YOUR_CLIENT_ID.apps.googleusercontent.com',
    // ... other settings
};
```

### 3. Run Locally

**Option A: Simple HTTP Server (Python)**
```bash
cd voice-to-drive
python3 -m http.server 3000
```

**Option B: Node.js Server**
```bash
npx serve -l 3000
```

**Option C: VS Code Live Server**
- Install the Live Server extension
- Right-click `index.html` > "Open with Live Server"

### 4. Open in Browser

Navigate to `http://localhost:3000`

> **Note**: For full PWA features (install, offline), you'll need HTTPS. Use a service like [ngrok](https://ngrok.com/) for local testing with HTTPS.

## Deployment

### Netlify (Recommended)

1. Push code to GitHub
2. Connect repo to [Netlify](https://netlify.com)
3. Deploy settings:
   - Build command: (leave empty)
   - Publish directory: `.`
4. Add your Netlify URL to Google OAuth authorized origins

### Vercel

```bash
npm i -g vercel
vercel
```

### GitHub Pages

1. Push to GitHub
2. Go to Settings > Pages
3. Select branch and root folder
4. Add GitHub Pages URL to OAuth origins

### Self-Hosted

Any static file server with HTTPS will work:
- Nginx
- Apache
- Caddy

## Usage

### First Time Setup

1. **Select Microphone** - Choose your preferred input device
2. **Test Microphone** - Verify audio is being detected
3. **Connect Google Drive** - Authorise access to your Drive
4. **Get Started** - Begin using the app

### Recording

1. **Tap the red button** to start recording
2. **Speak naturally** - record as long as you need
3. **Tap Stop** when finished
4. Recording saves locally immediately
5. Uploads to Drive when online

### Controls

| Button | Action |
|--------|--------|
| Record (red) | Start/stop recording |
| Pause | Pause/resume recording |
| Stop & Save | End recording and save |
| Cancel | Discard current recording |

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Space | Toggle recording |
| Escape | Close settings |

## File Organisation

Recordings are saved to Google Drive with this structure:

```
Voice Recordings/
└── 2026/
    └── 01/
        └── 03/
            ├── 2026-01-03_14-23-45.webm
            ├── 2026-01-03_15-10-22.webm
            └── 2026-01-03_16-45-00.webm
```

## Technical Details

### Audio Format

- Format: WebM with Opus codec
- Bitrate: 64 kbps (default), configurable up to 192 kbps
- Sample rate: 48 kHz

### Offline Storage

- Uses IndexedDB for local recording queue
- Chunks saved every 30 seconds for crash protection
- Automatic sync when connection restored

### Browser Support

| Browser | Support |
|---------|---------|
| Chrome | ✅ Full |
| Edge | ✅ Full |
| Firefox | ✅ Full |
| Safari | ⚠️ Limited (no background) |

### PWA Features

- Installable to home screen
- Offline capable
- Standalone display mode

## Troubleshooting

### "Microphone access denied"

1. Click the lock icon in the address bar
2. Set Microphone to "Allow"
3. Refresh the page

### "No audio detected" during test

1. Check microphone is connected
2. Check system volume/mute settings
3. Try a different microphone
4. Check browser is using correct device

### Recordings not syncing

1. Check internet connection
2. Check Google Drive is connected (Settings)
3. Check pending count in header
4. Try manual refresh

### PWA not installing

1. Must be served over HTTPS
2. Check manifest.json is accessible
3. Check service worker is registered (DevTools > Application)

## Development

### Project Structure

```
voice-to-drive/
├── index.html          # Main HTML shell
├── manifest.json       # PWA manifest
├── sw.js               # Service Worker
├── css/
│   └── styles.css      # All styles
├── js/
│   ├── app.js          # Main coordinator
│   ├── recorder.js     # Audio recording
│   ├── storage.js      # IndexedDB
│   ├── drive.js        # Google Drive API
│   └── ui.js           # UI updates
└── icons/
    └── icon.svg        # App icon
```

### Building Icons

Generate PNG icons from SVG:

```bash
# Using ImageMagick
for size in 72 96 128 144 152 192 384 512; do
  convert -background none icons/icon.svg -resize ${size}x${size} icons/icon-${size}.png
done
```

Or use an online tool like [RealFaviconGenerator](https://realfavicongenerator.net/).

## Future Plans

- [ ] Transcription integration (Whisper API)
- [ ] AI summaries and action items
- [ ] Supabase backend for enterprise features
- [ ] Team sharing capabilities
- [ ] Custom folder organisation
- [ ] Voice commands

## Contributing

Contributions welcome! Please read our contributing guidelines first.

## License

MIT License - see LICENSE file for details.

## Support

- **Issues**: [GitHub Issues](https://github.com/your-repo/issues)
- **Email**: support@example.com

---

Built with ❤️ for hands-free productivity
