export * from './src/voxura';

export { default as Mod } from './src/platform/mod';
export { AvatarType, AvatarStyle, default as Account } from './src/auth/account';
export { default as Project } from './src/platform/project';
export { default as Platform } from './src/platform';

export { default as Instance } from './src/instance';
export { default as InstanceManager } from './src/instance/manager';

export { default as GameComponent } from './src/component/game-component';
export { default as MinecraftJava } from './src/component/minecraft-java';
export { default as MinecraftQuilt } from './src/component/minecraft-quilt';
export { default as MinecraftFabric } from './src/component/minecraft-fabric';
export { default as MinecraftExtension } from './src/component/minecraft-extension';
export { default as VersionedComponent } from './src/component/versioned-component';
export { default as PlaceholderComponent } from './src/component/placeholder';
export { ComponentType, default as Component } from './src/component';

export * from './src/types';
export * as Util from './src/util';
export { version as VOXURA_VERSION } from './package.json';