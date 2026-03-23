# Linux to IPA Guide

This guide is written for a Linux machine like Nobara and assumes you do not have a Mac.

## 1. Prerequisites

Install Node.js, npm, git, and EAS CLI:

```bash
sudo dnf install -y git nodejs npm
npm install --global eas-cli
```

Confirm versions:

```bash
node -v
npm -v
eas --version
```

## 2. Create the Expo app

If you are starting from scratch:

```bash
npx create-expo-app@latest my-anime-player
cd my-anime-player
```

## 3. Install the exact stack

Use Expo packages for the SDK-bound modules:

```bash
npx expo install expo-dev-client expo-document-picker expo-media-library expo-brightness expo-build-properties
```

Install the non-Expo libraries:

```bash
npm install react-native-vlc-media-player react-native-volume-manager @react-native-async-storage/async-storage
```

Why this library choice:

- `react-native-vlc-media-player` is the correct choice here because MKV plus embedded audio-track switching is the main requirement.
- `react-native-video`, `expo-av`, and `expo-video` are better fits when you mainly want AVPlayer/ExoPlayer behavior, but they are not the safest choice for local MKV playback on iPhone.

## 4. Use the config already in this repo

This project already includes:

- `app.json`
  - `expo-dev-client`
  - `react-native-vlc-media-player`
  - `expo-build-properties`
  - iOS background audio mode
- `eas.json`
  - `development`
  - `preview`
  - `production`

## 5. Log in and connect the project to EAS

```bash
eas login
eas whoami
eas build:configure
```

If `eas build:configure` asks to create or link a project, accept it.

## 6. Create a development build first

Do this before the final production IPA. It is the fastest way to verify that VLC and volume control are compiled correctly.

```bash
eas build -p ios --profile development
```

What happens next:

- EAS builds the iOS app in the cloud.
- If this is your first internal iOS build, EAS will walk you through Apple credentials and device registration.
- When the build finishes, open the install link on your iPhone and install the dev client.

## 7. Run the app from Linux on your iPhone

Start Metro for the development build:

```bash
npm run start:dev-client
```

Then open the installed dev client on the iPhone and connect to the local bundler.

Important:

- Expo Go will not work for this app.
- Any time you add or change native dependencies, you must make a new development build.

## 8. Build the final IPA

When the development build is good, create the production artifact:

```bash
eas build -p ios --profile production
```

This produces the final iOS build in Expo's cloud. Download the `.ipa` from the build page when it completes.

## 9. Optional: create the PiP native bridge

If you want full VLC-surface PiP instead of leaving the JS PiP button as a bridge hook, add a local Expo module:

```bash
npx create-expo-module@latest --local
```

Then implement the iOS side with `AVPictureInPictureController` and rebuild with EAS:

```bash
eas build -p ios --profile development
```

## 10. Useful commands

Typecheck:

```bash
npm run typecheck
```

Lint:

```bash
npm run lint
```

Start bundler:

```bash
npm run start:dev-client
```

Create dev build:

```bash
eas build -p ios --profile development
```

Create final IPA:

```bash
eas build -p ios --profile production
```
