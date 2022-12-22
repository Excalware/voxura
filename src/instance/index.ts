import { t } from 'i18next';
import { Buffer } from 'buffer';
import type { Child } from '@tauri-apps/api/shell';
import { v4 as uuidv4 } from 'uuid';
import { exists, removeDir, readBinaryFile } from '@tauri-apps/api/fs';

import type Mod from '../util/mod';
import { Download } from '../downloader';
import EventEmitter from '../util/eventemitter';
import type PlatformMod from '../platform/mod';
import { InstanceState } from '../types';
import { ComponentType } from '../component';
import mdpkmInstanceConfig from './store/mdpkm';
import type InstanceManager from './manager';
import DefaultInstanceStore from './store/default';
import { Voxura, VoxuraStore } from '../voxura';
import { getStoredValue, setStoredValue } from '../storage';
import InstanceStore, { InstanceStoreType } from './store';
import { fileExists, invokeTauri, readJsonFile, getModByFile, writeJsonFile, createSymlink } from '../util';

export interface RustMod {
	md5: string
    name: string
    path: string
    meta: string
	icon?: number[]
    meta_name: string
}

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
		await Promise.all([this.readIcon(), this.readBanner()]);

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

    public async installMod(mod: PlatformMod, link: boolean = true): Promise<void> {
        console.log(mod);
        const version = await mod.getLatestVersion(this);
        console.log('latest version:', version);

        const file = version?.files?.find((f: any) => f.primary && (f.url ?? f.downloadUrl)) ?? version?.files?.find((f: any) => f.url ?? f.downloadUrl) ?? version;
        const name = file.filename ?? file.fileName;
        const url = file.url ?? file.downloadUrl;
        console.log('file:', file);

		const path = `${link ? this.voxura.linkedPath : this.modsPath}/${name}`;
		const download = new Download('game_mod', [mod.displayName], this.voxura.downloader);
		await download.download(url, path);
		
		if (link)
			await createSymlink(path, `${this.modsPath}/${name}`);

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

		const mod2 = getModByFile(modData);
		mod2.source = mod.source;

		this.modifications.push(mod2);
		this.emitEvent('changed');
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

		const projects = await getStoredValue<VoxuraStore["projects"]>('projects', {});
		for (const mod of this.modifications)
			mod.source = this.voxura.getPlatform(projects[mod.md5]?.platform);

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
		this.emitEvent('changed');
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
        return '';
    }

    public get webIcon(): string {
        return this.icon ? `data:image/png;base64,${this.base64Icon}` : this.defaultIcon;
    }
};