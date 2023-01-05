import { Logger } from 'tslog';
import { createDir } from '@tauri-apps/api/fs';

import Modrinth from './platform/modrinth';
import Downloader from './downloader';
import type Instance from './instance';
import type Platform from './platform';
import Authentication from './auth';
import type Component from './component';
import InstanceManager from './instance/manager';

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
	public logger: Logger<unknown>;
    public config: VoxuraConfig;
    public rootPath: string;
    public platforms: Record<string, Platform<any>>;
    public instances!: InstanceManager;
    public downloader: Downloader;

    public constructor(path: string, config?: VoxuraConfig) {
		this.logger = new Logger({
			name: 'voxura',
			prettyLogTemplate: '{{logLevelName}} [{{name}}]: ',
			hideLogPositionForProduction: true
		});
        this.rootPath = path.replace(/\/+|\\+/g, '/').replace(/\/$/g, '');

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
		this.logger.info('initialized');
	}

    public addPlatform(platform: Platform<any>) {
        this.platforms[platform.id] = platform;
    }

    public getPlatform(id: string): Platform<any> {
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
}

import JavaAgent from './component/java-agent';
import JavaTemurin from './component/java-temurin';
import MinecraftPaper from './component/minecraft-paper';
import MinecraftQuilt from './component/minecraft-quilt';
import MinecraftFabric from './component/minecraft-fabric';
import MinecraftJavaServer from './component/minecraft-java-server';
import MinecraftJavaClient from './component/minecraft-java-client';
import PlaceholderComponent from './component/placeholder';

export const COMPONENT_MAP: typeof Component<any>[] = [
	MinecraftJavaServer,
	MinecraftJavaClient,
	MinecraftPaper,
	MinecraftQuilt,
	MinecraftFabric,
	JavaTemurin,
	JavaAgent
]
export function getComponent(id: string) {
    return COMPONENT_MAP.find(c => c.id === id) ?? PlaceholderComponent;
}