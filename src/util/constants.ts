import { fetch } from '@tauri-apps/api/http';
import { arch, platform } from '@tauri-apps/api/os';
export const ARCH = await arch();
export const PLATFORM = await platform();

export { version as VOXURA_VERSION } from '../../package.json';

export const XBOX_AUTH_BASE = 'https://user.auth.xboxlive.com';
export const XSTS_AUTH_BASE = 'https://xsts.auth.xboxlive.com';
export const MICROSOFT_LOGIN_URL = 'https://login.live.com/oauth20_authorize.srf';
export const MINECRAFT_SERVICES_API = 'https://api.minecraftservices.com';

export const AZURE_CLIENT_ID = 'be7dfb6a-789c-4622-8c97-dcd963ae0f89';
export const AZURE_LOGIN_SCOPE = 'Xboxlive.signin,Xboxlive.offline_access';

const API_BASE = '/api/v1';
const DEFAULT_URL = 'https://mdpkm.voxelified.com';
const FALLBACK_URL = 'https://mdpkm-site-blookers.vercel.app';
export const MDPKM_SITE_BASE = await fetch(DEFAULT_URL).then(() => DEFAULT_URL + API_BASE).catch(() => FALLBACK_URL + API_BASE);