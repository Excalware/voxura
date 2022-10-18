import { Voxura } from '../voxura';
import { exists, readDir, createDir } from '@tauri-apps/api/fs';

import Instance from './instance';
import EventEmitter from '../util/eventemitter';
import { clearInstances } from '../slices/instances';
export default class InstanceManager extends EventEmitter {
    public voxura: Voxura;
    private path: string;
    private instances: Array<Instance> = new Array<Instance>();

    constructor(voxura: Voxura, path: string) {
        super();
        this.voxura = voxura;
        this.path = path;
    }

    get(id: string): Instance | void {
        return this.instances.find(i => i.id === id);
    }

    getAll(): Instance[] {
        return this.instances;
    }

    getByName(name: string): Instance | void {
        return this.instances.find(i => i.name === name);
    }

    async loadInstances(): Promise<void> {
        const entries = await readDir(this.path);
        //i was supposed to do this for reading mods lol oops
        /*await Promise.all(entries.map(entry => new Promise<void>(async resolve => {
            if (entry.name)
                if (!this.instances.some(i => i.name == entry.name)) {
                    const instance = new Instance(this, entry.name, entry.path);
                    await instance.init();

                    this.instances.push(instance);
                }
            resolve();
        })));*/
        for (const entry of entries)
            if (entry.name)
                if (!this.instances.some(i => i.name == entry.name)) {
                    const instance = new Instance(this, entry.name, entry.path);
                    await instance.init();

                    this.instances.push(instance);
                }
        this.emitEvent('listChanged');
    }

    refreshInstances(): Promise<void> {
        this.instances = [];
        this.voxura.store.dispatch(clearInstances());
        return this.loadInstances();
    }

    async createInstance(name: string): Promise<Instance> {
        const path = `${this.path}/${name}`;
        if (!(await exists(path) as any))
            await createDir(path);

        const instance = new Instance(this, name, path);
        await instance.init();

        this.instances.push(instance);
        this.emitEvent('listChanged');
        
        return instance;
    }

    get assetsPath() {
        return this.voxura.rootPath + '/assets';
    }

    get versionsPath() {
        return this.voxura.rootPath + '/versions';
    }

    get librariesPath() {
        return this.voxura.rootPath + '/libraries';
    }
};