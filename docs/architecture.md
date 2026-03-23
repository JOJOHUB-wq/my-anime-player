# Architecture

## Why this stack

Use `react-native-vlc-media-player` as the primary playback engine.

Reason:

- iOS AVPlayer-based libraries are much easier for PiP, but they are the wrong choice if MKV plus embedded multi-audio is the hard requirement.
- VLC gives you MKV container support, multiple embedded audio tracks, background playback, and frame snapshots from one engine.
- Expo Go is not enough because VLC and system-volume control both require custom native code. This project is meant for a development build and EAS Build.

## High-level layers

### 1. App shell

- Expo Router for three routes:
  - `app/index.tsx`: library
  - `app/player/[id].tsx`: fullscreen playback
  - `app/settings.tsx`: gesture and theme settings
- `src/providers/app-provider.tsx` owns persistent library state, playback progress, and settings.

### 2. Storage and library

- Videos are imported from the iOS Files picker with `expo-document-picker`.
- Imported files are copied into `FileSystem.documentDirectory + "library"`.
- Metadata, thumbnails, and progress are persisted in `AsyncStorage`.
- If an item came from the media library and has a `mediaAssetId`, deletion can use `expo-media-library`.
- Sandbox files are deleted with `expo-file-system/legacy`.

### 3. Smart parsing

- `src/utils/parser.ts` strips release-group noise, resolution/codec tags, and bracket clutter.
- It extracts:
  - `seriesTitle`
  - `seasonNumber`
  - `episodeNumber`
  - `cleanTitle`
  - `groupKey`
- `groupKey` is the playlist key for automatic episode grouping in the library screen.

### 4. Playback engine

- `src/components/player/anime-video-player.tsx` renders `VLCPlayer`.
- Implemented features:
  - local MKV/MP4 playback
  - embedded audio-track switching
  - configurable double-tap seek
  - configurable skip intro / skip outro
  - left-side brightness gesture
  - right-side volume gesture
  - lock mode that disables all touch controls until unlocked
  - background audio session setup
  - thumbnail snapshots via `snapshot()`
  - resume from last saved position

### 5. Theme model

- Default visual mode is dark.
- Accent themes live in `src/theme/tokens.ts`.
- Included accents:
  - Blood Red
  - Light Blue
  - Steel

## PiP reality check

PiP is the one feature that is not fully solved by the VLC package alone.

- The React layer is ready for PiP through `src/native/picture-in-picture.ts`.
- For full iOS PiP on a VLC-rendered surface, add a local Expo module that bridges `AVPictureInPictureController`.
- If you want to build that bridge inside this app, use:

```bash
npx create-expo-module@latest --local
```

Why this split exists:

- VLC is the right engine for MKV and audio tracks.
- AVPlayer is the easy PiP engine on iOS.
- A custom app that wants both on the same surface typically needs native glue.

## Deletion behavior

- Photo library assets: use `MediaLibrary.deleteAssetsAsync`.
- App-private imported files: delete from sandbox storage.
- There is no public iOS API that lets a normal app move arbitrary sandbox files into the Files app trash or a system-wide "Recently Deleted" area.

## Build strategy

- Keep native directories out of the repo and let EAS prebuild them in the cloud.
- `newArchEnabled` is disabled in `app.json` for compatibility with the VLC stack.
- Use:
  - `development` profile for installing a dev client on your iPhone
  - `production` profile for the final `.ipa`
