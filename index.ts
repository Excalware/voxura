import { version } from './package.json';
export * from './src/voxura';
export { default as Mod } from './src/platforms/mod';
export { AvatarType, AvatarStyle, default as Account } from './src/auth/account';
export { default as Project } from './src/platforms/project';
export { default as Platform } from './src/platforms';
export { default as Instance } from './src/instances/instance';
export { default as MinecraftExtension } from './src/instances/component/minecraft-extension';
export const VOXURA_VERSION = version;