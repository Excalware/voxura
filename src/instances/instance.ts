import pmap from 'p-map-browser';
import { fetch } from '@tauri-apps/api/http';
import { Buffer } from 'buffer';
import { v4 as uuidv4 } from 'uuid';
import { exists, removeDir, readBinaryFile } from '@tauri-apps/api/fs';

import type Mod from '../util/mod';
import { Download } from '../downloader';
import EventEmitter from '../util/eventemitter';
import MinecraftJava from './component/minecraft-java';
import GameComponent from './component/game-component';
import type { Voxura } from '../voxura';
import { getComponent } from '../voxura';
import type PlatformMod from '../platforms/mod';
import VersionedComponent from './component/versioned-component';
import type InstanceManager from './manager';
import UnknownGameComponent from './component/unknown-game';
import Component, { ComponentType, ComponentJson } from './component';
import { InstanceState, InstanceStoreType, JavaVersionManifest } from '../types';
import { fileExists, filesExist, invokeTauri, readJsonFile, getModByFile, writeJsonFile, getDefaultIcon } from '../util';

export interface RustMod {
    name: string;
    path: string;
    icon?: number[];
    meta: string;
    meta_name: string;
};
export abstract class InstanceStore {
    public instance: Instance;
    public components: Component[] = [];
    public abstract type: InstanceStoreType;
    public readonly data: InstanceStoreData = {
        storeType: InstanceStoreType.Default
    };
    constructor(instance: Instance, data?: InstanceStoreData | void) {
        this.instance = instance;
        if (data)
            this.data = data;
    }

    public save() {
        return writeJsonFile(this.instance.storePath, this.data);
    }

    public get id() {
        return this.data.id;
    }

    public abstract get memoryAllocation(): number;
    public abstract set memoryAllocation(value: number);
    public abstract get gameResolution(): [number, number];
    public abstract get dateCreated(): number;
    public abstract get dateUpdated(): number;
    public abstract get dateLaunched(): number;
    public abstract set dateLaunched(value: number);

    public get gameComponent() {
        const component = this.components.find(c => c.type === ComponentType.Game);
        if (!(component instanceof GameComponent))
            return new UnknownGameComponent(this.instance, {
                version: '0.0.0'
            });
        return component;
    }
};
export type InstanceStoreData = {
    id?: string;
    storeType: InstanceStoreType;
};
export type DefaultInstanceStoreData = InstanceStoreData & {
    dates: number[];
    components: ComponentJson[];
    gameResolution: [number, number];
    memoryAllocation: number;
}
export class DefaultInstanceStore extends InstanceStore {
    public type = InstanceStoreType.Default;
    public readonly data: DefaultInstanceStoreData = {
        dates: [Date.now(), Date.now()],
        storeType: InstanceStoreType.Default,
        components: [],
        gameResolution: [800, 600],
        memoryAllocation: 2
    };
    constructor(instance: Instance, data?: DefaultInstanceStoreData | void) {
        super(instance, data);
        if (data)
            this.data = data;

        for (const data of this.data.components) {
            if (data.id) {
                const component = getComponent(data.id) as any;
                if (component)
                    this.components.push(new component(instance, data));
            }
        }
    }

    public save() {
        this.data.components = this.components.map(c => c.toJSON());
        return super.save();
    }

    public get memoryAllocation() {
        return this.data.memoryAllocation;
    }
    public set memoryAllocation(value: number) {
        this.data.memoryAllocation = value;
    }

    public get gameResolution() {
        return this.data.gameResolution;
    }

    public get dateCreated() {
        return this.dates[0] ?? Date.now();
    }
    public get dateUpdated() {
        return this.dates[1] ?? Date.now();
    }

    public get dateLaunched() {
        return this.dates[2] ?? 0;
    }
    public set dateLaunched(value: number) {
        this.dates[2] = value;
    }

    private get dates() {
        return this.data.dates;
    }
};
export type mdpkmConfigData = InstanceStoreData & {
    ram: number;
    loader: {
        game: string,
        type: string,
        version?: string
    };
    resolution: [number, number];
    dateCreated: number;
    dateUpdated: number;
    dateLaunched?: number;
    modifications: string[][];
};
export class mdpkmInstanceConfig extends InstanceStore {
    public type = InstanceStoreType.mdpkm;
    public readonly data: mdpkmConfigData = {
        ram: 2,
        loader: {
            game: '1.0.0',
            type: 'minecraft-java-vanilla'
        },
        storeType: InstanceStoreType.mdpkm,
        resolution: [900, 500],
        dateCreated: Date.now(),
        dateUpdated: Date.now(),
        modifications: []
    };
    constructor(instance: Instance, data?: mdpkmConfigData | void) {
        super(instance, data);
        if (data)
            this.data = data;

        this.components = [
            new MinecraftJava(instance, {
                version: this.data.loader.game
            })
        ];

        if (this.data.loader.version) {
            const loader = getComponent(this.data.loader.type);
            if (loader?.type === ComponentType.Loader)
                this.components.push(new loader(instance, {
                    version: this.data.loader.version
                }));
        }
    }

    public save() {
        this.data.loader.game = this.gameComponent.version;

        const loader = this.components[1];
        if (loader instanceof VersionedComponent)
            this.data.loader.type = loader.id, this.data.loader.version = loader.version;
        return super.save();
    }

    public get memoryAllocation() {
        return this.data.ram;
    }
    public set memoryAllocation(value: number) {
        this.data.ram = value;
    }

    public get gameResolution() {
        return this.data.resolution;
    }

    public get dateCreated() {
        return this.data.dateCreated;
    }
    public get dateUpdated() {
        return this.data.dateUpdated;
    }

    public get dateLaunched() {
        return this.data.dateLaunched ?? 0;
    }
    public set dateLaunched(value: number) {
        this.data.dateLaunched = value;
    }
};

const STORE_CLASS = [
    DefaultInstanceStore,
    mdpkmInstanceConfig
];
export default class Instance extends EventEmitter {
    public id: string;
    public name: string;
    public path: string;
    public icon?: Uint8Array | void;
    public store: InstanceStore;
    public state: InstanceState = InstanceState.None;
    public manager: InstanceManager;
    public storeType: InstanceStoreType = InstanceStoreType.Default;
    public readingMods: boolean = false;
    public hasReadMods: boolean = false;
    public modifications: Mod[];
    private voxura: Voxura
    
    public constructor(manager: InstanceManager, name: string, path: string) {
        super();
        this.voxura = manager.voxura;
        this.manager = manager;

        this.id = uuidv4();
        this.name = name;
        this.path = path;
        this.store = new STORE_CLASS[this.storeType](this);
        this.modifications = [];
    }

    public async init(): Promise<void> {
        await this.refresh();

        console.log('Loaded', this.name);
    }

    public async refresh(): Promise<void> {
        let configChanged = false;
        this.icon = await readBinaryFile(this.path + '/icon.png').catch(console.log);
        
        if (await fileExists(this.configPath) && !await fileExists(this.storePath)) {
            const storeData = await readJsonFile<any>(this.configPath).catch(console.log);
            this.store = new mdpkmInstanceConfig(this, storeData);
        } else {
            const storeData = await readJsonFile<any>(this.storePath).catch(console.log);
            this.store = typeof storeData?.storeType === 'number' ? new STORE_CLASS[storeData.storeType](this, storeData) : new DefaultInstanceStore(this);
        }
        this.storeType = this.store.type;

        /*const loader = getLoaderById(this.config.loader.type);
        this.loader = new loader(this);*/
        this.manager.emitEvent('listChanged');

        if (this.store.id)
            this.id = this.store.id;
        else
            this.store.data.id = this.id, configChanged = true;
        if (configChanged)
            await this.saveConfig();
    }

    public async installMod(mod: PlatformMod): Promise<void> {
        console.log(mod);
        const version = await mod.getLatestVersion(this);
        console.log('latest version:', version);

        const file = version?.files?.find((f: any) => f.primary && (f.url ?? f.downloadUrl)) ?? version?.files?.find((f: any) => f.url ?? f.downloadUrl) ?? version;
        const name = file.filename ?? file.fileName;
        const url = file.url ?? file.downloadUrl;
        console.log('file:', file);

        this.voxura.downloader.downloadFile(`${this.modsPath}/${name}`, url,
            `${mod.displayName} (Game Modification)`, mod.webIcon
        );
    }

    public async downloadLibraries(libraries: any[], download?: Download): Promise<void> {
        const component = this.gameComponent;
        const existing = await filesExist(libraries.filter(l => l.path && l.url).map(l => l.path));
        if (!download && Object.values(existing).some(e => !e)) {
            download = new Download(this.voxura.downloader, '');
            download.total = 0, download.progress = 0;
            download.displayName = `${component.id} ${component.version} Libraries`;

            const downloader = this.voxura.downloader;
            downloader.downloads.push(download);
            downloader.emitEvent('changed');
            downloader.emitEvent('downloadStarted', download);
        }

        await pmap(Object.entries(existing), async([path, exists]: [path: string, exists: boolean]) => {
            if (!exists) {
                const library = libraries.find(l => l.path === path);
                if (library) {
                    const sub = new Download(this.voxura.downloader, path);
                    invokeTauri('download_file', {
                        id: sub.id,
                        url: library.url,
                        path
                    });

                    (download as any).addDownload(sub);
                    await sub.waitForFinish();
                }
            }
        }, { concurrency: 25 });
    }

    public async getManifest(): Promise<JavaVersionManifest> {
        const component = this.gameComponent;

        const manifestPath = this.manifestPath;
        if (await exists(manifestPath) as any)
            return readJsonFile<JavaVersionManifest>(manifestPath);

        const { data } = await fetch<any>('https://launchermeta.mojang.com/mc/game/version_manifest.json');
        
        const version = component.version;
        const manifest = data.versions.find((manifest: any) => manifest.id === version);
        if (!manifest)
            throw new Error(`Could not find manifest for ${version}`);

        await this.voxura.downloader.downloadFile(manifestPath, manifest.url,
            `Minecraft: Java Edition ${version} Manifest`, 'img/icons/minecraft/java.png'
        );

        return readJsonFile<JavaVersionManifest>(manifestPath);
    }

    public async launch(): Promise<void> {
        if (this.state !== InstanceState.None)
            throw new Error('Instance state must be InstanceState.None');

        console.log('[voxura.instances]: Launching', this);
        this.setState(InstanceState.Launching);

        this.store.dateLaunched = Date.now();
        await this.saveConfig();

        this.manager.store.recent = [this.id, ...this.manager.store.recent.filter(r => r !== this.id)];
        this.manager.saveStore().then(() => this.manager.emitEvent('changed'));

        /*await this.loader.launch().catch(err => {
            this.setState(InstanceState.None);
            throw err;
        });*/
        await this.gameComponent.launch().catch(err => {
            this.setState(InstanceState.None);
            throw err;
        });
    }

    public async readMods(): Promise<Mod[]> {
        if (this.readingMods)
            throw new Error('mods are already beig read');

        this.readingMods = true;
        this.modifications = [];
        this.emitEvent('changed');

        if (await fileExists(this.modsPath))
            this.modifications = await invokeTauri<RustMod[]>('read_mods', {
                path: this.modsPath
            }).then(m => m.map(getModByFile));

        this.readingMods = false;
        this.hasReadMods = true;
        this.emitEvent('changed');

        return this.modifications;
    }

    public changeLoader(type?: any, version?: string): Promise<void> {
        /*if (type) {
            this.loader = new type(this);
            this.config.loader.type = type.id;
        }
        if (version)
            this.config.loader.version = version;*/

        this.emitEvent('changed');
        return this.saveConfig();
    }

    public changeVersion(version: string): Promise<void> {
        //this.config.loader.game = version;

        this.emitEvent('changed');
        return this.saveConfig();
    }

    public saveConfig(): Promise<void> {
        return writeJsonFile(this.storePath, this.store.data);
    }

    public setState(state: InstanceState) {
        this.state = state;
        this.emitEvent('changed');
    }

    public async delete() {
        await removeDir(this.path, { recursive: true });
        this.manager.instances = this.manager.instances.filter(i => i !== this);
        this.manager.emitEvent('listChanged');
    }

    public get gameComponent() {
        return this.store.gameComponent;
    }

    public get modsPath() {
        return this.path + '/mods';
    }

    public get storePath() {
        return this.path + '/store.json';
    }

    public get configPath() {
        return this.path + '/config.json';
    }

    public get nativesPath() {
        return this.path + '/natives';
    }

    public get clientPath() {
        return this.versionPath + '/client.jar';
    }

    public get manifestPath() {
        return this.versionPath + '/manifest.json';
    }

    public get versionPath() {
        const component = this.gameComponent;
        return `${this.manager.versionsPath}/${component.id}-${component.version}`;
    }

    public get isModded() {
        return this.store.components.some(c => c.type === ComponentType.Loader);
    }

    public get isRunning() {
        return this.state === InstanceState.GameRunning;
    }

    public get isLaunching() {
        return this.state === InstanceState.Launching;
    }

    public get base64Icon(): string | null {
        return this.icon ? Buffer.from(this.icon).toString('base64') : null;
    }

    public get defaultIcon(): string {
        return getDefaultIcon(this.name);
    }

    public get webIcon(): string {
        return this.icon ? `data:image/png;base64,${this.base64Icon}` : this.defaultIcon;
    }
};