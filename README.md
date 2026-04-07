# My Anime Player

An Expo Router project scaffolded for an iPhone-first anime and series player with:

- `react-native-vlc-media-player` for MKV/MP4 playback and embedded audio tracks
- gesture-driven brightness and volume control
- configurable double-tap seek and intro/outro skips
- lock mode, resume progress, thumbnail snapshots, and optional auto-delete
- EAS Build profiles for Linux-to-iOS cloud builds

Read these first:

- [Architecture](./docs/architecture.md)
- [Linux to IPA Guide](./docs/linux-to-ipa.md)

Core code locations:

- [Parser](./src/utils/parser.ts)
- [Player component](./src/components/player/anime-video-player.tsx)
- [App state](./src/providers/app-provider.tsx)
- [Build config](./app.json)
- [EAS profiles](./eas.json)
# my-anime-player
# my-anime-player
