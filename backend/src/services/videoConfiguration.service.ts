import path from 'path';
import { env } from '../config/env';
import { badRequest } from '../utils/errors';
import { SettingsService } from './settings.service';

export const VideoConfigurationService = {
  get: (opts?: { fresh?: boolean }) => SettingsService.get('video', opts),

  // Storage root-ыг зөвхөн орчны хувьсагчаар зөвшөөрсөн жагсаалтаас сонгоно.
  assertAllowedRoot(root: string) {
    const allowed = env.videoAllowedRoots.map((r) => path.resolve(r));
    if (!allowed.includes(path.resolve(root))) {
      throw badRequest(`Видео хадгалах зам зөвшөөрөгдөөгүй байна. Зөвшөөрөгдсөн: ${allowed.join(', ')}`);
    }
  },

  dirs(root: string) {
    return {
      root,
      hls: path.join(root, 'hls'),
      posters: path.join(root, 'posters'),
      backdrops: path.join(root, 'backdrops'),
      temp: path.join(root, 'temp'),
    };
  },
};
