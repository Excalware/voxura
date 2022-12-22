export enum LoaderType {
    Vanilla,
    Modified,
    Unknown
};
export enum LoaderSetupType {
    Versions,
    Custom,
    Unknown
};
export enum InstanceState {
    None,
    Launching,
    GameRunning
};
export enum LoaderSetupFieldType {
    Text,
    File,
    Folder,
    Select
};
export type ComponentVersion = {
    id: string,
    category: number,
    dateCreated: Date
};
export type ComponentVersions = ComponentVersion[][];

export interface MinecraftProfile {
	id: string
	name: string
	skins: MinecraftSkin[]
	capes: MinecraftCape[]
};
export interface MinecraftSkin {
	id: string
	url: string
	state: 'ACTIVE' | 'INACTIVE'
	variant: 'SLIM' | 'CLASSIC'
};
export interface MinecraftCape {
	id: string
	url: string
	alias: string
	state: 'ACTIVE' | 'INACTIVE'
};