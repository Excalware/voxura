import { platform } from '@tauri-apps/api/os';
export const PLATFORM = await platform();

export const XBOX_AUTH_BASE = 'https://user.auth.xboxlive.com';
export const XSTS_AUTH_BASE = 'https://xsts.auth.xboxlive.com';
export const MINECRAFT_SERVICES_API = 'https://api.minecraftservices.com';

export const MINECRAFT_LIBRARIES_URL = 'https://libraries.minecraft.net';
export const MINECRAFT_RESOURCES_URL = 'https://resources.download.minecraft.net';

//idk why i did it like this
const instanceIconStart = 'img/icons/instances/default';
export const DEFAULT_INSTANCE_ICONS = [
    instanceIconStart + '1.svg',
    instanceIconStart + '2.svg',
    instanceIconStart + '3.svg',
    instanceIconStart + '4.svg',
    instanceIconStart + '5.svg',
    instanceIconStart + '6.svg',
    instanceIconStart + '7.svg',
    instanceIconStart + '8.svg',
];