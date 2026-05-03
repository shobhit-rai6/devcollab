# DevCollab – React Native App

A full React Native (Expo) port of the DevCollab web frontend.

## Project Structure

```
devcollab-rn/
├── App.js                          ← Root entry point
├── app.json                        ← Expo config
├── package.json
└── src/
    ├── theme.js                    ← Design tokens (colours, spacing, etc.)
    ├── config/
    │   ├── axios.js                ← Axios instance (AsyncStorage token)
    │   └── socket.js               ← Socket.io client
    ├── context/
    │   └── UserContext.js          ← Auth state (AsyncStorage persistence)
    ├── navigation/
    │   └── AppNavigator.js         ← React Navigation stack
    ├── components/
    │   └── UI.js                   ← Reusable components (buttons, inputs, etc.)
    └── screens/
        ├── LoginScreen.js
        ├── RegisterScreen.js
        ├── HomeScreen.js           ← Project list + create/delete
        └── ProjectScreen.js        ← Chat, file tree, AI messages, collaborators
```

## Feature Parity with Web App

| Feature                    | Web | React Native |
|----------------------------|-----|--------------|
| Login / Register           | ✅  | ✅           |
| Password strength meter    | ✅  | ✅           |
| Persist session on refresh | ✅  | ✅           |
| Project list               | ✅  | ✅           |
| Create / Delete project    | ✅  | ✅           |
| Pull-to-refresh            | –   | ✅           |
| Real-time chat (Socket.io) | ✅  | ✅           |
| AI message rendering       | ✅  | ✅ (text)    |
| File tree view             | ✅  | ✅           |
| File content preview       | ✅  | ✅           |
| Add collaborators modal    | ✅  | ✅           |
| Dark theme                 | ✅  | ✅           |
| WebContainer / iframe run  | ✅  | ❌ (N/A)     |

> **WebContainer** is a browser-only technology and cannot run in React Native.
> The mobile app shows generated files and chat, but doesn't execute the app in-device.

## Setup

### 1. Install dependencies
```bash
cd devcollab-rn
npm install
```

### 2. Set backend URL
Create a `.env` file (or `app.config.js`):
```
EXPO_PUBLIC_API_URL=http://<your-backend-ip>:3000
```

> Use your machine's LAN IP (e.g. `192.168.1.5:3000`), not `localhost`,
> when testing on a physical device.

### 3. Start the app
```bash
npx expo start
```
Scan the QR code with the **Expo Go** app (iOS / Android).

### 4. Build for production
```bash
npx expo build:android   # APK
npx expo build:ios       # IPA (requires Apple Developer account)
```

## Key Differences from the Web App

| Web                          | React Native                        |
|------------------------------|-------------------------------------|
| `localStorage`               | `AsyncStorage` (@react-native-async-storage) |
| `react-router-dom`           | `@react-navigation/native-stack`    |
| CSS / inline styles          | `StyleSheet.create`                 |
| `window.confirm`             | `Alert.alert`                       |
| `<iframe>` preview           | Not supported                       |
| `highlight.js` code blocks   | Monospace `Text` (selectable)       |
| `markdown-to-jsx`            | `react-native-markdown-display`     |
