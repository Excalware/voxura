import { arch, platform } from '@tauri-apps/api/os';
export const ARCH = await arch();
export const PLATFORM = await platform();

export { version as VOXURA_VERSION } from '../../package.json';

export const XBOX_AUTH_BASE = 'https://user.auth.xboxlive.com';
export const XSTS_AUTH_BASE = 'https://xsts.auth.xboxlive.com';
export const MICROSOFT_LOGIN_URL = 'https://login.live.com/oauth20_authorize.srf';
export const MINECRAFT_SERVICES_API = 'https://api.minecraftservices.com';

export const MINECRAFT_LIBRARIES_URL = 'https://libraries.minecraft.net';
export const MINECRAFT_RESOURCES_URL = 'https://resources.download.minecraft.net';
export const MINECRAFT_VERSION_MANIFEST = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';

export const AZURE_CLIENT_ID = 'be7dfb6a-789c-4622-8c97-dcd963ae0f89';
export const AZURE_LOGIN_SCOPE = "Xboxlive.signin,Xboxlive.offline_access";

//idk why did i do it like this :(
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