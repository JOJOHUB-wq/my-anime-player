import { NativeModules, Platform } from 'react-native';

type PictureInPictureModule = {
  isSupported?: () => Promise<boolean>;
  start?: () => Promise<boolean>;
  stop?: () => Promise<boolean>;
};

const nativeModule = NativeModules.AnimePictureInPicture as PictureInPictureModule | undefined;

export async function isPictureInPictureAvailable() {
  if (Platform.OS !== 'ios' || !nativeModule?.isSupported) {
    return false;
  }

  try {
    return await nativeModule.isSupported();
  } catch {
    return false;
  }
}

export async function startPictureInPicture() {
  if (Platform.OS !== 'ios' || !nativeModule?.start) {
    return false;
  }

  try {
    return await nativeModule.start();
  } catch {
    return false;
  }
}

export async function stopPictureInPicture() {
  if (Platform.OS !== 'ios' || !nativeModule?.stop) {
    return false;
  }

  try {
    return await nativeModule.stop();
  } catch {
    return false;
  }
}
