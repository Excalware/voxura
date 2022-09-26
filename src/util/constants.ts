import { platform } from '@tauri-apps/api/os';
export const PLATFORM = await platform();

export const XBOX_AUTH_BASE = 'https://user.auth.xboxlive.com';
export const XSTS_AUTH_BASE = 'https://xsts.auth.xboxlive.com';
export const MINECRAFT_SERVICES_API = 'https://api.minecraftservices.com';

export const MINECRAFT_LIBRARIES_URL = 'https://libraries.minecraft.net';
export const MINECRAFT_RESOURCES_URL = 'https://resources.download.minecraft.net';