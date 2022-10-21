import Downloader from './downloader';
import JavaManager from './java';
import Authentication from './auth';
import InstanceManager from './instances/manager';

import Modrinth from './platforms/modrinth';
import type Platform from './platforms';
import type Instance from './instances/instance';
enum InstanceConfigType {
    Default, // not actually a thing yet!
    mdpkm
};
export interface VoxuraConfig {
    instanceConfigType: InstanceConfigType
};
export class Voxura {
    public auth: Authentication;
    public java: JavaManager;
    public config: VoxuraConfig;
    public rootPath: string;
    public platforms: { [key: string]: Platform };
    public instances: InstanceManager;
    public downloader: Downloader;

    public constructor(path: string, config?: VoxuraConfig) {
        this.rootPath = path.replace(/\/+|\\+/g, '/').replace(/\/$/g, '');
        this.java = new JavaManager(this, path + '/java');
        this.auth = new Authentication(this);
        this.downloader = new Downloader(this);
        this.platforms = {
            modrinth: new Modrinth()
        };
        this.config = config ?? {
            instanceConfigType: InstanceConfigType.Default
        };
    }

    public addPlatform(platform: Platform) {
        this.platforms[platform.id] = platform;
    }

    public getPlatform(id: string): Platform {
        return this.platforms[id];
    }

    public async startInstances(): Promise<void> {
        this.instances = new InstanceManager(this, this.rootPath + '/instances');
        this.instances.loadInstances();
    }

    public getInstance(id: string): Instance | void {
        return this.instances.get(id);
    }

    public getInstances(): Instance[] {
        return this.instances.getAll();
    }

    public get tempPath(): string {
        return this.rootPath + '/temp';
    }
};