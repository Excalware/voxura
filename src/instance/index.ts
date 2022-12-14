import { t } from 'i18next';
import { Buffer } from 'buffer';
import { satisfies } from 'semver';
import type { Child } from '@tauri-apps/api/shell';
import { v4 as uuidv4 } from 'uuid';
import { fetch as fetch2, ResponseType } from '@tauri-apps/api/http';
import { exists, createDir, removeDir, removeFile, readBinaryFile } from '@tauri-apps/api/fs';

import type Mod from '../util/mod';
import { Download } from '../downloader';
import EventEmitter from '../util/eventemitter';
import MinecraftJava from '../component/minecraft-java';
import { InstanceState } from '../types';
import VersionedComponent from '../component/versioned-component';
import mdpkmInstanceConfig from './store/mdpkm';
import type InstanceManager from './manager';
import DefaultInstanceStore from './store/default';
import { Voxura, VoxuraStore } from '../voxura';
import Project, { ProjectType } from '../platform/project';
import { getStoredValue, setStoredValue } from '../storage';
import InstanceStore, { InstanceStoreType } from './store';
import InstanceComponent, { ComponentType } from '../component';
import { fileExists, invokeTauri, readJsonFile, getModByFile, writeJsonFile } from '../util';

export interface RustMod {
	md5: string
    name: string
    path: string
    meta: string
	icon?: number[]
    meta_name: string
}

export const STORE_CLASS = [DefaultInstanceStore, mdpkmInstanceConfig]
export default abstract class Instance extends EventEmitter {
    public id: string
    public name: string
    public path: string
    public icon?: Uint8Array | void
    public store: InstanceStore
    public state: InstanceState = InstanceState.None
	public voxura: Voxura
	public banner?: Uint8Array | void
    public manager: InstanceManager
	public processes: Child[] = []
	public iconFormat: string = 'png'
    public readingMods: boolean = false
    public hasReadMods: boolean = false
	public bannerFormat: string = 'png'
    public modifications: Mod[]
	public abstract type: InstanceType
    
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
    }

    public async refresh(): Promise<void> {
		await Promise.all([this.readIcon(), this.readBanner()]);

        let configChanged = false;        
        if (await fileExists(this.configPath) && !await fileExists(this.storePath)) {
            const storeData = await readJsonFile<any>(this.configPath).catch(console.log);
            this.store = new mdpkmInstanceConfig(this, storeData);
        } else {
            let storeData = await readJsonFile<any>(this.storePath).catch(console.log);
			if (storeData?.storeType === InstanceStoreType.mdpkm) {
				storeData = {
					dates: [Date.now(), Date.now()],
					storeType: InstanceStoreType.Default,
					components: [{
						id: MinecraftJava.id,
						version: storeData.loader.game
					}],
					gameResolution: storeData.resolution
				};
				configChanged = true;
			}
            this.store = typeof storeData?.storeType === 'number' ? new STORE_CLASS[storeData.storeType](this, storeData) : new DefaultInstanceStore(this);
        }

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
		for (const format of ALLOWED_ICON_FORMATS) {
			const path = this.iconPath + format;
			if (await exists(path)) {
				this.icon = await readBinaryFile(path).catch(console.warn);
				this.iconFormat = format;
			}
		}
	}

	public async readBanner() {
		for (const format of ALLOWED_ICON_FORMATS) {
			const path = this.bannerPath + format;
			if (await exists(path)) {
				this.banner = await readBinaryFile(path).catch(console.warn);
				this.bannerFormat = format;
			}
		}
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

	public getComponentByType<T extends InstanceComponent, P extends typeof InstanceComponent<any>>(type: P): T | undefined {
		return this.store.components.find(c => c instanceof type) as any;
	}

    public async installProject(project: Project<any>): Promise<void> {
		console.log(project);
        const version = await project.getLatestVersion(this);
        if (!version)
			throw new CompatibilityError(`${project.displayName} is incompatible with ${this.name}`);

        const file = version.files.find((f: any) => f.primary && f.url) ?? version.files[0];
        const name = file.filename;
        const url = file.url;

		const dir = `${this.path}/${PROJECT_TYPE_DIR[project.type]}`;
		await createDir(dir, { recursive: true });

		const path = `${dir}/${name}`;
		const download = new Download('game_mod', [project.displayName, project.source.id], this.voxura.downloader);
		await download.download(url, path).await();

		if (project.type === ProjectType.Mod) {
			const modData = await invokeTauri<RustMod>('read_mod', { path });
			await getStoredValue<VoxuraStore["projects"]>('projects', {}).then(async projects => {
				let icon = modData.icon;
				const { webIcon } = project;
				if (webIcon)
					if (webIcon.startsWith('http'))
						icon = await fetch2<number[]>(webIcon, { method: 'GET', responseType: ResponseType.Binary }).then(r => r.data);
					else
						icon = await fetch(webIcon).then(r => r.arrayBuffer()).then(a => [...new Uint8Array(a)]);
				projects[modData.md5] = {
					id: project.id,
					version: version.id,
					platform: project.source.id,
					cached_icon: icon,
					cached_metadata: modData.meta,
					cached_metaname: modData.meta_name
				};
				modData.icon = icon;
				return setStoredValue('projects', projects);
			});

			const mod = getModByFile(modData);
			mod.source = project.source;

			this.modifications.push(mod);
		}
		this.emitEvent('changed');
    }

	public async removeMod(mod: Mod) {
		await removeFile(mod.path);

		this.modifications = this.modifications.filter(m => m !== mod);
		this.emitEvent('changed');
	}

    public async launch(): Promise<void> {
        this.manager.logger.info('launching', this.name);
        this.setState(InstanceState.Launching);

		const { components } = this.store;
		for (const component of components) {
			const dependencies = await component.getDependencies().catch(err => {
				this.setState(InstanceState.None);
				throw err;
			});
			for (const dep of dependencies) {
				const found = components.find(c => dep.id.includes(c.id));
				if (found && found instanceof VersionedComponent) {
					if (!satisfies(found.version, dep.versionRange)) {
						this.setState(InstanceState.None);
						throw new LaunchError('dependency_version_unsatisfied', [component.id, dep.id, dep.versionRange, found.version]);
					}
				} else
					throw new LaunchError('missing_dependency', [component.id, dep.id, dep.versionRange]);
			}
		}

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
		for (const mod of this.modifications) {
			const project = projects[mod.md5];
			if (project)
				mod.source = this.voxura.getPlatform(project.platform);
		}

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
		return this.path + '/icon.';
	}

	public get bannerPath() {
		return this.path + '/banner.';
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
        return this.icon ? `data:image/${this.iconFormat};base64,${this.base64Icon}` : this.defaultIcon;
    }

	public get storeType() {
		return this.store?.type ?? InstanceStoreType.Default;
	}
}

export const PROJECT_TYPE_DIR: Record<number, string> = {
	[ProjectType.Mod]: 'mods',
	[ProjectType.Shader]: 'shaderpacks',
	[ProjectType.ResourcePack]: 'resourcepacks'
}

export class CompatibilityError extends Error {}
export class DependencyError extends Error {}
export class LaunchError extends Error {
	public readonly extraData?: any[]
	public constructor(message: string, extraData?: any[]) {
		super(message);
		this.extraData = extraData;
	}
}
export enum InstanceType {
	Client,
	Server
}

export const ALLOWED_ICON_FORMATS = ['png', 'gif'];