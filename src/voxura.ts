import { createDir } from '@tauri-apps/api/fs';

import Downloader from './downloader';
import JavaManager from './java';
import Authentication from './auth';
import InstanceManager from './instances/manager';

import Modrinth from './platforms/modrinth';
import type Platform from './platforms';
import type Instance from './instances/instance';
export type VoxuraStore = {
	projects: Record<string, CachedProject>;
};
export type CachedProject = {
	id: string;
	version: string;
	platform: string;
	cached_icon?: number[];
	cached_metadata?: string;
	cached_metaname?: string;
};
export interface VoxuraConfig {
    
};
export class Voxura {
    public auth: Authentication;
    public java: JavaManager;
    public config: VoxuraConfig;
    public rootPath: string;
    public platforms: Record<string, Platform>;
    public instances!: InstanceManager;
    public downloader: Downloader;

    public constructor(path: string, config?: VoxuraConfig) {
        this.rootPath = path.replace(/\/+|\\+/g, '/').replace(/\/$/g, '');
        this.java = new JavaManager(this, path + '/java');
        this.auth = new Authentication(this);
		this.instances = new InstanceManager(this, this.rootPath + '/instances');
        this.downloader = new Downloader(this);
        this.platforms = {
            modrinth: new Modrinth()
        };
        this.config = config ?? {};
    }

	public async init() {
		await createDir(this.rootPath, { recursive: true });
	}

    public addPlatform(platform: Platform) {
        this.platforms[platform.id] = platform;
    }

    public getPlatform(id: string): Platform {
        return this.platforms[id];
    }

    public async startInstances(): Promise<void> {
        await this.instances.init();
        await this.instances.loadInstances();
    }

    public getInstance(id: string): Instance | void {
        return this.instances.get(id);
    }

    public getInstances(): Instance[] {
        return this.instances.getAll();
    }

    public get tempPath() {
        return this.rootPath + '/temp';
    }

	public get storePath() {
		return this.rootPath + '/voxura.json';
	}

	public get linkedPath() {
		return this.rootPath + '/linked';
	}
};
export * as Util from './util';

import QuiltLoader from './instances/component/quilt-loader';
import FabricLoader from './instances/component/fabric-loader';
import MinecraftJava from './instances/component/minecraft-java';
import PlaceholderComponent from './instances/component/placeholder';
import { readJsonFile, writeJsonFile } from './util';

export const COMPONENT_MAP = [MinecraftJava, FabricLoader, QuiltLoader];
export function getComponent(id: string) {
    return COMPONENT_MAP.find(c => c.id === id) ?? PlaceholderComponent;
};