# Welcome to your Rork app
had to install nodejs and npm to install the package.json requirements
also had to install npm -g expo-cli for the server

The base is a native cross-platform mobile app created with [Rork](https://rork.com)

**Platform**: Native iOS & Android app, exportable to web
**Framework**: Expo Router + React Native

## How can I edit this code?

There are several ways of editing your native mobile application.

### **Use your preferred code editor**

If you want to work locally using your own code editor, you can clone this repo and push changes. Pushed changes will also be reflected in Rork.

## What technologies are used for this project?

This project is built with the most popular native mobile cross-platform technical stack:

- **React Native** - Cross-platform native mobile development framework created by Meta and used for Instagram, Airbnb, and lots of top apps in the App Store
- **Expo** - Extension of React Native + platform used by Discord, Shopify, Coinbase, Telsa, Starlink, Eightsleep, and more
- **Expo Router** - File-based routing system for React Native with support for web, server functions and SSR
- **TypeScript** - Type-safe JavaScript
- **React Query** - Server state management
- **Lucide React Native** - Beautiful icons

## How can I test this app?

### **On your phone (Recommended)**

1. **iOS**: Download the [Rork app from the App Store](https://apps.apple.com/app/rork) or [Expo Go](https://apps.apple.com/app/expo-go/id982107779)
2. **Android**: Download the [Expo Go app from Google Play](https://play.google.com/store/apps/details?id=host.exp.exponent)
3. Run `bun run start` and scan the QR code from your development server

### **In your browser**

Run `bun start-web` to test in a web browser. Note: The browser preview is great for quick testing, but some native features may not be available.

### **iOS Simulator / Android Emulator**

You can test Rork apps in Expo Go or Rork iOS app. You don't need XCode or Android Studio for most features.

**When do you need Custom Development Builds?**

- Native authentication (Face ID, Touch ID, Apple Sign In)
- In-app purchases and subscriptions
- Push notifications
- Custom native modules

Learn more: [Expo Custom Development Builds Guide](https://docs.expo.dev/develop/development-builds/introduction/)

If you have XCode (iOS) or Android Studio installed:

```bash
# iOS Simulator
bun run start -- --ios

# Android Emulator
bun run start -- --android
```

## How can I deploy this project?

### **Publish to App Store (iOS)**

1. **Install EAS CLI**:

   ```bash
   bun i -g @expo/eas-cli
   ```

2. **Configure your project**:

   ```bash
   eas build:configure
   ```

3. **Build for iOS**:

   ```bash
   eas build --platform ios
   ```

4. **Submit to App Store**:
   ```bash
   eas submit --platform ios
   ```

For detailed instructions, visit [Expo's App Store deployment guide](https://docs.expo.dev/submit/ios/).

### **Publish to Google Play (Android)**

1. **Build for Android**:

   ```bash
   eas build --platform android
   ```

2. **Submit to Google Play**:
   ```bash
   eas submit --platform android
   ```

For detailed instructions, visit [Expo's Google Play deployment guide](https://docs.expo.dev/submit/android/).

### **Publish as a Website**

Your React Native app can also run on the web:

1. **Build for web**:

   ```bash
   eas build --platform web
   ```

2. **Deploy with EAS Hosting**:
   ```bash
   eas hosting:configure
   eas hosting:deploy
   ```

Alternative web deployment options:

- **Vercel**: Deploy directly from your GitHub repository
- **Netlify**: Connect your GitHub repo to Netlify for automatic deployments

## App Features

This template includes:

- **Cross-platform compatibility** - Works on iOS, Android, and Web
- **File-based routing** with Expo Router
- **Tab navigation** with customizable tabs
- **Modal screens** for overlays and dialogs
- **TypeScript support** for better development experience
- **Async storage** for local data persistence
- **Vector icons** with Lucide React Native

## Project Structure

```
├── app/                    # App screens (Expo Router)
│   ├── (tabs)/            # Tab navigation screens
│   │   ├── _layout.tsx    # Tab layout configuration
│   │   └── index.tsx      # Home tab screen
│   ├── _layout.tsx        # Root layout
│   ├── modal.tsx          # Modal screen example
│   └── +not-found.tsx     # 404 screen
├── assets/                # Static assets
│   └── images/           # App icons and images
├── constants/            # App constants and configuration
├── app.json             # Expo configuration
├── package.json         # Dependencies and scripts
└── tsconfig.json        # TypeScript configuration
```

## Custom Development Builds

For advanced native features, you'll need to create a Custom Development Build instead of using Expo Go.

### **When do you need a Custom Development Build?**

- **Native Authentication**: Face ID, Touch ID, Apple Sign In, Google Sign In
- **In-App Purchases**: App Store and Google Play subscriptions
- **Advanced Native Features**: Third-party SDKs, platform-specifc features (e.g. Widgets on iOS)
- **Background Processing**: Background tasks, location tracking

### **Creating a Custom Development Build**

```bash
# Install EAS CLI
bun i -g @expo/eas-cli

# Configure your project for development builds
eas build:configure

# Create a development build for your device
eas build --profile development --platform ios
eas build --profile development --platform android

# Install the development build on your device and start developing
bun start --dev-client
```

**Learn more:**

- [Development Builds Introduction](https://docs.expo.dev/develop/development-builds/introduction/)
- [Creating Development Builds](https://docs.expo.dev/develop/development-builds/create-a-build/)
- [Installing Development Builds](https://docs.expo.dev/develop/development-builds/installation/)

## Advanced Features

### **Add a Database**

Integrate with backend services:

- **Supabase** - PostgreSQL database with real-time features
- **Firebase** - Google's mobile development platform
- **Custom API** - Connect to your own backend
