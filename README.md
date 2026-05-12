# Chatus — Private Encrypted Messenger

> **Private. Encrypted. Yours.**

Chatus is a full-featured, end-to-end encrypted messaging PWA (Progressive Web App) built with React, Firebase, and TweetNaCl. It installs on iOS and Android like a native app — no App Store required.

---

## Feature Checklist

| Feature | Status | Notes |
|---|---|---|
| Sign Up | ✅ | Email + password via Firebase Auth |
| Sign In | ✅ | Persistent session (localStorage) |
| Sign Out | ✅ | Clears Firebase session |
| End-to-end encryption (text) | ✅ | TweetNaCl X25519 + XSalsa20-Poly1305 |
| End-to-end encryption (files) | ✅ | Per-file symmetric key, key-wrapped per recipient |
| Text messages | ✅ | Real-time via Firestore |
| Emoji picker | ✅ | Full emoji-mart picker (2,000+ emojis) |
| Photo messages | ✅ | Encrypted before upload → Firebase Storage |
| Video messages | ✅ | Encrypted before upload → Cloudinary |
| Voice notes | ✅ | MediaRecorder API, encrypted → Firebase Storage |
| Conversations list | ✅ | Real-time, sorted by latest message |
| Start new conversation | ✅ | Search by email address |
| Push notifications | ✅ | FCM web push (foreground + background) |
| Dark mode | ✅ | System-aware toggle |
| Offline support | ✅ | Workbox service worker, cached assets |
| Installable (Add to Home Screen) | ✅ | Full PWA manifest |
| Date separators in chat | ✅ | "Today", "Yesterday", date |
| Read receipts (data model) | ✅ | `readBy` field tracked per message |

---

## How End-to-End Encryption Works

1. **Registration:** A `X25519` key pair is generated in-browser (TweetNaCl). The **public key** is stored in Firestore. The **private key** is stored only in `localStorage` on your device — the server never sees it.
2. **Sending a text:** The message is encrypted using `nacl.box` (Diffie-Hellman shared secret between sender private key + recipient public key). Only the ciphertext and nonce reach Firestore.
3. **Sending media:** A random 32-byte symmetric key encrypts the file bytes. That file key is then "wrapped" (encrypted) with the recipient's public key. The encrypted bytes go to cloud storage; the wrapped key goes to Firestore. The recipient unwraps the file key with their private key, then decrypts the file locally.
4. **Decryption:** Always happens client-side. The server only stores ciphertext.

> ⚠️ **Important:** Your private key lives in `localStorage`. If you clear browser/app data or change devices, you lose the ability to decrypt old messages. There is no key recovery.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS |
| Auth + DB | Firebase Auth + Firestore |
| File storage | Firebase Storage (images, audio) + Cloudinary (video) |
| Encryption | TweetNaCl (nacl.box / nacl.secretbox) |
| Push notifications | Firebase Cloud Messaging (FCM) |
| PWA / offline | Workbox (via vite-plugin-pwa) |
| Emoji | @emoji-mart/react |

---

## Environment Setup

Copy `.env.example` to `.env` and fill in all values:

```bash
cp .env.example .env
```

### Firebase (required)

1. Go to [Firebase Console](https://console.firebase.google.com/) → Create a project
2. Enable **Authentication** → Email/Password sign-in
3. Create a **Firestore** database (start in test mode, then apply security rules below)
4. Enable **Storage**
5. In Project Settings → Your Apps → add a Web app → copy the config values into `.env`
6. In Project Settings → Cloud Messaging → Web Push certificates → **Generate key pair** → paste as `VITE_FIREBASE_VAPID_KEY`

### Cloudinary (required for video)

1. Create a free account at [cloudinary.com](https://cloudinary.com)
2. Go to Settings → Upload → Add upload preset (set to **Unsigned**)
3. Copy your cloud name and preset name into `.env`

### Firestore Security Rules

Paste these rules in Firebase Console → Firestore → Rules:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    match /users/{uid} {
      allow read: if request.auth != null;
      allow write: if request.auth.uid == uid;
    }

    match /conversations/{convId} {
      allow read, write: if request.auth != null
        && request.auth.uid in resource.data.participants;
      allow create: if request.auth != null
        && request.auth.uid in request.resource.data.participants;

      match /messages/{msgId} {
        allow read, write: if request.auth != null
          && request.auth.uid in get(/databases/$(database)/documents/conversations/$(convId)).data.participants;
      }
    }
  }
}
```

### Firebase Storage Rules

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /media/{conversationId}/{allPaths=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

---

## Running Locally

```bash
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

---

## Building for Production

```bash
npm run build
# Output is in ./dist — deploy to any static host
```

### Recommended hosts

- **Firebase Hosting** — `firebase deploy --only hosting`
- **Vercel** — drag & drop `dist/`
- **Netlify** — connect repo, build command `npm run build`, publish dir `dist`

---

## Testing on iOS

### Requirements
- iPhone with **iOS 16.4 or later** (for push notification support)
- Safari browser

### Steps

1. **Deploy** the app to a public HTTPS URL (Vercel/Netlify/Firebase Hosting).
2. Open the URL in **Safari** on your iPhone.
3. Tap the **Share** button (box with arrow).
4. Tap **"Add to Home Screen"**.
5. Tap **Add** — the Chatus icon appears on your home screen.
6. Open it from the home screen (it now runs as a standalone app, full screen).
7. **Register** an account with your email.
8. **Allow notifications** when prompted.
9. Open the app on a second device (or ask a friend) and **register a second account**.
10. Tap the ✏️ button → enter the other user's email → Start Chat.
11. Send a text, an emoji, a photo, a voice note, and a video to test all features.

### iOS Limitations
- **Push notifications** only work after "Add to Home Screen" — not in Safari browser tabs.
- Voice recording uses `audio/mp4` on iOS (detected automatically). This is normal.
- Camera access requires you to tap the 📷 icon and select "Take Photo" or choose from library.

---

## Testing on Android

### Requirements
- Android phone with Chrome (recommended) or Firefox

### Steps

1. **Deploy** to a public HTTPS URL.
2. Open the URL in **Chrome** on your Android phone.
3. Chrome will show a banner **"Add Chatus to Home screen"** — tap it.  
   *Or:* tap the ⋮ menu → "Add to Home screen".
4. Confirm — the Chatus icon appears in your app drawer and home screen.
5. Open it from the home screen (runs full screen, standalone).
6. **Register** an account and **allow notifications** when prompted.
7. Test the same flow as iOS: text, emoji, photo, voice, video.

### Android Advantages over iOS
- Push notifications work in Chrome without extra steps.
- Voice recording works with `audio/webm;codecs=opus` (higher quality).
- Full PWA install banner shown automatically.

---

## Testing Checklist (End-to-End)

Run through this on both devices:

- [ ] **Sign Up** — create account with name, email, password
- [ ] **Sign In** — sign out, then sign back in
- [ ] **Start conversation** — tap ✏️, enter another user's email
- [ ] **Send text** — type and press Enter or ↑ button
- [ ] **Send emoji** — tap 😊, pick emoji, send
- [ ] **Send photo** — tap 📷, choose image
- [ ] **Send video** — tap 🎥, choose video
- [ ] **Send voice note** — tap 🎤, tap "Tap to record", record, tap Send
- [ ] **Play voice note** — tap ▶️ on received voice note
- [ ] **View photo** — tap "Tap to decrypt" on received photo
- [ ] **Dark mode** — tap 🌙 / ☀️ toggle
- [ ] **Notification** — send a message from device A while device B is in background; check banner appears
- [ ] **Offline** — turn off WiFi; open the app — it should still load

---

## Known Limitations

| Issue | Impact | Workaround |
|---|---|---|
| Private key in `localStorage` | Clearing app data = lost key, can't decrypt old messages | Export/backup key (not yet implemented) |
| Push on iOS requires PWA install | Users who browse in Safari tab won't get push | Install via "Add to Home Screen" |
| No key rotation | Same key pair for life of the account | Re-register with new email to get new keys |
| No message deletion | Sent messages stay in Firestore | Manual Firestore deletion |
| No read receipt UI | Data tracked but not shown | Future enhancement |
| No typing indicator | — | Future enhancement |

---

## Project Structure

```
src/
├── components/
│   ├── EmojiPicker.tsx      # emoji-mart wrapper
│   ├── MessageBubble.tsx    # text / image / video / audio bubbles
│   ├── ProtectedRoute.tsx   # auth guard
│   └── VoiceRecorder.tsx    # microphone recorder with timer
├── context/
│   └── ThemeContext.tsx     # dark/light mode
├── hooks/
│   ├── useAuth.ts           # Firebase auth state
│   └── useMessages.ts       # real-time Firestore + decrypt
├── pages/
│   ├── LoginPage.tsx
│   ├── RegisterPage.tsx
│   ├── ConversationsPage.tsx
│   └── ChatPage.tsx
├── services/
│   ├── cloudinary.ts        # video upload
│   ├── crypto.ts            # TweetNaCl E2EE helpers
│   ├── firebase.ts          # Firebase init
│   ├── keyStore.ts          # private key in localStorage
│   └── notifications.ts     # FCM web push
├── utils/
│   ├── avatar.ts            # color + initials from name
│   └── formatTime.ts        # time formatting
└── sw.ts                    # Workbox service worker
```
