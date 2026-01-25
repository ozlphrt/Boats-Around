# Setup Instructions

## API Key Configuration

**This app requires an AISStream API key to receive vessel data.**

### Quick Setup

1. **Get an API key** (free):
   - Go to https://aisstream.io/
   - Sign up for a free account
   - Copy your API key

2. **Create `.env` file** in the root directory:
   ```bash
   VITE_AISSTREAM_API_KEY=your_actual_api_key_here
   ```

3. **Restart the dev server**:
   ```bash
   # Stop current server (Ctrl+C)
   npm run dev
   ```

### Verification

After setup, check the browser console for:
- `[App] API Key configured: xxxxxxxx...` ✓
- `[AIS] ✓ Received PositionReport for XXXXXXX` ✓

If you see:
- `[AIS] ⚠️ API KEY IS MISSING!` - Create/check `.env` file
- `Missing API Key` status - API key not loaded, restart dev server

### Troubleshooting

**No vessels appearing?**
1. Check console for API key warnings
2. Verify `.env` file exists in root directory
3. Restart dev server to load environment variables
4. Wait 30-60 seconds for data to flow
5. Try searching for busy ports (Singapore, Rotterdam)

**Connection issues?**
1. Ensure proxy server is running: `npm run start:proxy`
2. Or use: `npm run dev:full` (after `npm install`)
