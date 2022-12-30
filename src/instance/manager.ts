import { Logger } from 'tslog';
import { readDir, createDir } from '@tauri-apps/api/fs';

import Instance from '.';
import { Voxura } from '../voxura';
import EventEmitter from '../util/eventemitter';
import { readJsonFile, writeJsonFile } from '../util';
export interface InstanceManagerStore {
    recent: string[]
};

const DEFAULT_STORE: InstanceManagerStore = {
    recent: []
};
export default class InstanceManager extends EventEmitter {
    public store: InstanceManagerStore = DEFAULT_STORE;
    public voxura: Voxura;
	public logger: Logger<unknown>;
	public loading: boolean = false;
    public instances: Array<Instance> = new Array<Instance>();
    private path: string;

    public constructor(voxura: Voxura, path: string) {
        super();
        this.path = path;
        this.voxura = voxura;
		this.logger = voxura.logger.getSubLogger({ name: 'instances' });
    }

    public async init() {
		await createDir(this.path, { recursive: true });
        this.store = await readJsonFile<InstanceManagerStore>(this.storePath).catch(console.log) ?? DEFAULT_STORE;
		
		this.logger.info('initialized');
	}

    public get(id: string): Instance | void {
        return this.instances.find(i => i.id === id);
    }

    public getAll(): Instance[] {
        return this.instances;
    }

    public getByName(name: string): Instance | void {
        return this.instances.find(i => i.name === name);
    }

    public getRecent(): Instance[] {
        return this.store.recent.map(id => this.get(id)).filter((s): s is Instance => !!s);
    }

    public async loadInstances(): Promise<void> {
		if (this.loading)
			throw new Error('already loading woo');
		this.loading = true;

        const entries = await readDir(this.path);
		const promises = [];
        for (const entry of entries)
            if (entry.name && entry.children)
                if (!this.instances.some(i => i.name == entry.name)) {
                    const instance = new Instance(this, entry.name, entry.path);
                    promises.push(instance.init());

                    this.instances.push(instance);
					this.logger.info('loaded', instance.name);
                }
		await Promise.all(promises);
		
		this.loading = false;
        this.emitEvent('listChanged');
    }

    public refreshInstances(): Promise<void> {
        this.instances = [];
        this.emitEvent('listChanged');

        return this.loadInstances();
    }

    public async createInstance(name: string): Promise<Instance> {
        const path = `${this.path}/${name}`;
        await createDir(path, { recursive: true });

        const instance = new Instance(this, name, path);
        await instance.init();

        this.instances.push(instance);
        this.emitEvent('listChanged');
        
        return instance;
    }

    public saveStore(): Promise<void> {
        return writeJsonFile(this.storePath, this.store);
    }

    public get assetsPath() {
        return this.voxura.rootPath + '/assets';
    }

    public get versionsPath() {
        return this.voxura.rootPath + '/components';
    }

    public get librariesPath() {
        return this.voxura.rootPath + '/libraries';
    }

    private get storePath() {
        return this.path + '/store.json';
    }
};