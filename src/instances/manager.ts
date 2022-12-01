import { exists, readDir, createDir } from '@tauri-apps/api/fs';

import Instance from './instance';
import { Voxura } from '../voxura';
import EventEmitter from '../util/eventemitter';
import { readJsonFile, writeJsonFile } from '../util';
interface InstanceManagerStore {
    recent: string[]
};

const DEFAULT_STORE: InstanceManagerStore = {
    recent: []
};
export default class InstanceManager extends EventEmitter {
    public store: InstanceManagerStore = DEFAULT_STORE;
    public voxura: Voxura;
    public instances: Array<Instance> = new Array<Instance>();
    private path: string;

    public constructor(voxura: Voxura, path: string) {
        super();
        this.path = path;
        this.voxura = voxura;
    }

    public async init() {
        this.store = await readJsonFile<InstanceManagerStore>(this.storePath).catch(console.log) ?? DEFAULT_STORE;
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
        const entries = await readDir(this.path);
        for (const entry of entries)
            if (entry.name && entry.children)
                if (!this.instances.some(i => i.name == entry.name)) {
                    const instance = new Instance(this, entry.name, entry.path);
                    await instance.init();

                    this.instances.push(instance);
                }
        this.emitEvent('listChanged');
    }

    public refreshInstances(): Promise<void> {
        this.instances = [];
        this.emitEvent('listChanged');

        return this.loadInstances();
    }

    public async createInstance(name: string): Promise<Instance> {
        const path = `${this.path}/${name}`;
        if (!(await exists(path) as any))
            await createDir(path);

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