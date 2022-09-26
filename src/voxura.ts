import JavaManager from './java';
import Authentication from './auth';
import InstanceManager from './instances/manager';

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
    public store;
    public config: VoxuraConfig;
    public rootPath: string;
    public instances: InstanceManager;

    constructor(path: string, config?: VoxuraConfig) {
        this.rootPath = path.replace(/\/+|\\+/g, '/').replace(/\/$/g, '');
        this.java = new JavaManager(path + '/java');
        this.auth = new Authentication(this);
        this.config = config ?? {
            instanceConfigType: InstanceConfigType.Default
        };
    }

    useStore(store) {
        this.store = store;
    }

    async startInstances(): Promise<void> {
        this.instances = new InstanceManager(this, this.rootPath + '/instances');
        this.instances.loadInstances();
    }

    getInstance(id: string): Instance | void {
        return this.instances.get(id);
    }

    getInstances(): Instance[] {
        return this.instances.getAll();
    }
};