# RESQNET — VS Code Web Prototype

A human-designed, offline-first emergency communication **web prototype** with:
- Community overview, SOS alerts, requests, resource offers, and local messages
- Local persistence using `localStorage`
- Multilingual voice input using the browser Speech Recognition API where supported
- Spoken output using browser speech synthesis and installed voices
- Guided rescue chatbot with scenario-based safety steps, emergency call access, and a local SOS shortcut
- Installable PWA with an offline-cached app shell
- Language selector with common Indian and international languages
- Export/delete local data
- Responsive desktop and mobile layout
- Explicit honesty about demo mode and browser peer-to-peer limitations

## Run in VS Code

1. Install Node.js 18 or newer.
2. Open a terminal in this folder.
3. Create a Gemini API key in [Google AI Studio](https://aistudio.google.com/apikey). Set it in the terminal environment, then start the app server:

	```sh
	read -s "GOOGLE_API_KEY?Google Gemini API key (input hidden): "
	export GOOGLE_API_KEY
	node server.js
	```

4. Open `http://127.0.0.1:5500`.

The default model is `gemini-3.8-flash`; set `GEMINI_MODEL` before starting the server to choose another Gemini API model. Never put the API key in `app.js`, `index.html`, or other browser files. Requests to Google Gemini may incur usage charges.

Opening `index.html` directly or using a static-only server will not enable the AI chatbot; it needs the Node server to keep the API key private. Localhost is also recommended because browser permissions and speech APIs may be restricted on `file://`.

## Android app

The Android app wraps the existing web UI with Capacitor. Install Android Studio with its Android SDK, then run:

```sh
npm install
npm run android:add
npm run android:open
```

In Android Studio, build the APK from **Build > Build Bundle(s) / APK(s) > Build APK(s)**. After changing the web UI, run `npm run android:sync` before rebuilding. A Java runtime and Android SDK are required for the APK build.

The app's Gemini proxy must be deployed separately on an HTTPS server with `GOOGLE_API_KEY` configured. In the Android app, open Settings and enter that server's HTTPS URL under **AI chat server**. The server allows the Capacitor localhost origin by default; set `CAPACITOR_ALLOWED_ORIGINS` to additional trusted origins if needed. Never ship the Gemini API key inside the Android app.

## Install as a web app

Serve the app over HTTPS (or localhost for testing), open it in a supported mobile browser, and choose **Install app** when the button appears. On iPhone/iPad, use Safari's **Share > Add to Home Screen**. The service worker caches the app shell and static files; Gemini chat still needs an internet connection and a configured backend.

## Voice input and every-language support

The app lets users select a language before speaking the message title or details. It uses:
- `SpeechRecognition` / `webkitSpeechRecognition` for voice-to-text
- `SpeechSynthesis` for reading messages aloud

**Important:** No web app can guarantee voice recognition and speech output in every language on every device. The browser, operating system, installed speech voices, region, and sometimes internet access determine language coverage. The app lists common languages but reports limitations and always allows typing as a fallback. To expand language coverage, add language codes to `LANGUAGES` in `app.js` after checking support on your target devices.

## Offline behavior and safety

This prototype stores messages on the current browser/device only. It does **not** send alerts to emergency services or implement real Bluetooth, Wi-Fi Direct, or multi-hop mesh relay. Demo Mode is a UI workflow only; it does not simulate real people or confirm real delivery.

The AI rescue assistant sends the chat conversation to Google Gemini. It does not automatically send the user's profile or GPS location, and it cannot assess an emergency, contact responders, dispatch a rescue team, or confirm that help is coming. Call local emergency services directly; the app includes a 112 call link for India. AI answers can be wrong, so follow emergency operator instructions.

For a real offline mesh, build a native Android application with a transport protocol, durable message queue, duplicate suppression, TTL, acknowledgments, and physical-device testing. Browser support for Bluetooth is limited and inconsistent.

## Files

- `index.html` — semantic screens and modal forms
- `styles.css` — responsive UI styling
- `app.js` — navigation, local storage, voice support, message logic
- `server.js` — local static server and private AI API proxy

## Suggested test

1. Create a medical request.
2. Refresh the page and confirm it remains saved.
3. Select Tamil, Hindi, or another language and test voice input/output if your browser/device supports it.
4. Export the local JSON file.
5. Confirm that the app clearly says messages are stored locally and have not reached another device.
