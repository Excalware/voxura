import pmap from 'p-map-browser';
import { t } from 'i18next';
import { fetch } from '@tauri-apps/api/http';
import { Buffer } from 'buffer';
import { v4 as uuidv4 } from 'uuid';
import type { Child } from '@tauri-apps/api/shell';
import { exists, removeDir, readBinaryFile } from '@tauri-apps/api/fs';

import type Mod from '../util/mod';
import { Download } from '../downloader';
import EventEmitter from '../util/eventemitter';
import MinecraftJava from './component/minecraft-java';
import GameComponent from './component/game-component';
import type PlatformMod from '../platforms/mod';
import VersionedComponent from './component/versioned-component';
import type InstanceManager from './manager';
import UnknownGameComponent from './component/unknown-game';
import { getStoredValue, setStoredValue } from '../storage';
import { Voxura, getComponent, VoxuraStore } from '../voxura';
import Component, { ComponentType, ComponentJson } from './component';
import { InstanceState, InstanceStoreType, JavaVersionManifest } from '../types';
import { fileExists, filesExist, invokeTauri, readJsonFile, getModByFile, writeJsonFile, getDefaultIcon } from '../util';

export interface RustMod {
	md5: string;
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

	public abstract get category(): string;
    public abstract set category(value: string);
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
	category: string;
    components: ComponentJson[];
    gameResolution: [number, number];
    memoryAllocation: number;
}
export class DefaultInstanceStore extends InstanceStore {
    public type = InstanceStoreType.Default;
    public readonly data: DefaultInstanceStoreData = {
        dates: [Date.now(), Date.now()],
		category: t('mdpkm:instance_category.default'),
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

	public get category() {
        return this.data.category ?? t('mdpkm:instance_category.default');
    }
    public set category(value: string) {
        this.data.category = value;
    }

    public get memoryAllocation() {
        return this.data.memoryAllocation ?? 2;
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
	category: string;
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
		category: t('mdpkm:instance_category.default'),
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

	public get category() {
        return this.data.category ?? t('mdpkm:instance_category.default');
    }
    public set category(value: string) {
        this.data.category = value;
    }
    public get memoryAllocation() {
        return this.data.ram ?? 2;
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
	public banner?: Uint8Array | void;
    public manager: InstanceManager;
	public processes: Child[] = [];
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
		await this.readIcon();
		await this.readBanner();

        let configChanged = false;        
        if (await fileExists(this.configPath) && !await fileExists(this.storePath)) {
            const storeData = await readJsonFile<any>(this.configPath).catch(console.log);
            this.store = new mdpkmInstanceConfig(this, storeData);
        } else {
            const storeData = await readJsonFile<any>(this.storePath).catch(console.log);
            this.store = typeof storeData?.storeType === 'number' ? new STORE_CLASS[storeData.storeType](this, storeData) : new DefaultInstanceStore(this);
        }
        this.storeType = this.store.type;

		this.emitEvent('changed');
        this.manager.emitEvent('listChanged');

        if (this.store.id)
            this.id = this.store.id;
        else
            this.store.data.id = this.id, configChanged = true;
        if (configChanged)
            await this.saveConfig();
    }

	public async readIcon() {
		if (await exists(this.iconPath))
			this.icon = await readBinaryFile(this.iconPath).catch(console.warn);
	}

	public async readBanner() {
		if (await exists(this.bannerPath))
			this.banner = await readBinaryFile(this.bannerPath).catch(console.warn);
	}

	public async setCategory(value: string) {
		this.store.category = value;
		await this.saveConfig();
		
		this.manager.emitEvent('listChanged');
	}

	public async killProcess(process: Child) {
		process.kill();
		this.processes = this.processes.filter(p => p !== process);
		this.state = this.processes.length ? InstanceState.GameRunning : InstanceState.None;

		this.emitEvent('changed');
	}

    public async installMod(mod: PlatformMod): Promise<void> {
        console.log(mod);
        const version = await mod.getLatestVersion(this);
        console.log('latest version:', version);

        const file = version?.files?.find((f: any) => f.primary && (f.url ?? f.downloadUrl)) ?? version?.files?.find((f: any) => f.url ?? f.downloadUrl) ?? version;
        const name = file.filename ?? file.fileName;
        const url = file.url ?? file.downloadUrl;
        console.log('file:', file);

		const path = `${this.modsPath}/${name}`;
        await this.voxura.downloader.downloadFile(path, url,
            `${mod.displayName} (Game Modification)`, mod.webIcon
        );

		const modData = await invokeTauri<RustMod>('read_mod', { path });
		await getStoredValue<VoxuraStore["projects"]>('projects', {}).then(projects => {
			projects[modData.md5] = {
				id: mod.id,
				version: version.id,
				platform: mod.source.id,
				cached_icon: modData.icon,
				cached_metadata: modData.meta,
				cached_metaname: modData.meta_name
			};
			return setStoredValue('projects', projects);
		});

		this.modifications.push(getModByFile(modData));
		this.emitEvent('changed');
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

	public get iconPath() {
		return this.path + '/icon.png';
	}

	public get bannerPath() {
		return this.path + '/banner.png';
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

	public get isFavourite() {
		return this.store.category === t('mdpkm:instance_category.favorites');
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