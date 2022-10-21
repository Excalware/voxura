import pmap from 'p-map-browser';
import { fetch } from '@tauri-apps/api/http';
import { Buffer } from 'buffer';
import { invoke } from '@tauri-apps/api';
import { listen } from '@tauri-apps/api/event';
import { gte, coerce } from 'semver';
import { v4 as uuidv4 } from 'uuid';
import { exists, readBinaryFile } from '@tauri-apps/api/fs';

import type Mod from '../util/mod';
import type Account from '../auth/account';
import EventEmitter from '../util/eventemitter';
import type { Voxura } from '../voxura';
import type PlatformMod from '../platforms/mod';
import type InstanceManager from './manager';
import { Download, DownloadType } from '../downloader';
import { MINECRAFT_RESOURCES_URL } from '../util/constants';
import { fileExists, filesExist, readJsonFile, getModByFile, mapLibraries, writeJsonFile } from '../util';

export enum InstanceState {
    None,
    Launching,
    GameRunning
};
enum InstanceGameType {
    MinecraftJava,
    MinecraftBedrock
};
enum InstanceLoaderType {
    Vanilla,
    Modified
};
export interface RustMod {
    name: string,
    path: string,
    icon?: number[],
    meta: string,
    meta_name: string
};
interface InstanceConfig {
    ram: number,
    loader: {
        game: string,
        type: string,
        version?: string
    },
    resolution: number[],
    modifications: string[][]
};
interface JavaVersionManifestDownload {
    url: string,
    sha1: string,
    size: number
};
interface JavaVersionManifest {
    id: string,
    type: string,
    assets: string,
    logging: any,
    downloads: {
        server: JavaVersionManifestDownload,
        client: JavaVersionManifestDownload,
        server_mappings: JavaVersionManifestDownload,
        client_mappings: JavaVersionManifestDownload
    },
    arguments: {
        jvm: string[],
        game: string[]
    },
    libraries: any[],
    javaVersion: {
        component: string,
        majorVersion: number
    },
    minecraftArguments: string,
    mainClass: string
};
interface JavaAssetIndex {
    objects: {
        [key: string]: {
            hash: string,
            size: number
        }
    }
};

const ARG_REGEX = /\${*(.*)}/;
const DEFAULT_CONFIG: InstanceConfig = {
    ram: 2,
    loader: {
        game: '1.0.0',
        type: 'java'
    },
    resolution: [900, 500],
    modifications: []
};
export default class Instance extends EventEmitter {
    public id: string;
    public name: string;
    public icon?: Uint8Array | void;
    public state: InstanceState = InstanceState.None;
    public config: InstanceConfig;
    public modifications: Mod[];
    private path: string;
    private voxura: Voxura
    private manager: InstanceManager;
    private gameType: InstanceGameType;
    private readingMods: boolean = false;
    
    public constructor(manager: InstanceManager, name: string, path: string) {
        super();
        this.manager = manager;
        this.voxura = manager.voxura;

        this.id = uuidv4();
        this.name = name;
        this.path = path;
        this.config = DEFAULT_CONFIG;
        this.gameType = InstanceGameType.MinecraftJava;
        this.modifications = [];
    }

    public async init(): Promise<void> {
        await this.refresh();

        console.log('Loaded', this.name);
    }

    public async refresh(): Promise<void> {
        this.icon = await readBinaryFile(this.path + '/icon.png').catch(console.log);
        this.config = await readJsonFile<InstanceConfig>(this.configPath).catch(console.log) ?? DEFAULT_CONFIG;
        this.manager.emitEvent('listChanged');
    }

    public async installMod(mod: PlatformMod<any>): Promise<void> {
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

    public async installGame(): Promise<void> {
        if (this.gameType === InstanceGameType.MinecraftJava) {
            const manifest = await this.getManifest();
            const artifact = {
                url: manifest.downloads.client.url,
                sha1: manifest.downloads.client.sha1,
                path: this.clientPath
            };

            const downloader = this.voxura.downloader;
            const version = this.config.loader.game;
            const download = new Download(downloader, artifact.path);
            download.displayName = `Minecraft: Java Edition ${version}`;
            download.displayIcon = 'img/icons/minecraft/java.png';

            downloader.downloads.push(download);
            downloader.emitEvent('changed');
            downloader.emitEvent('downloadStarted', download);

            if (!(await exists(artifact.path) as any)) {
                invoke('voxura_download_file', {
                    id: download.id,
                    url: artifact.url,
                    path: artifact.path
                });

                await new Promise<void>(async resolve => {
                    download.listenForEvent('finished', () => {
                        download.unlistenForEvent('finished', resolve);
                        resolve();
                    });
                });
            }

            const libraries = mapLibraries(manifest.libraries, this.manager.librariesPath);
            await this.downloadLibraries(libraries, download);

            this.extractNatives(download, libraries);

            if (libraries.some(l => l.natives))
                await download.waitForFinish();
        }
    }

    private extractNatives(download: Download, libraries: any[]): void {
        for (const { path, natives } of libraries)
            if (natives) {
                const sub = new Download(this.voxura.downloader, path);
                sub.type = DownloadType.Extract;
                sub.update(0, 2);

                console.log('native path:', path);
                invoke('voxura_extract_archive_contains', {
                    id: sub.id,
                    path: this.nativesPath,
                    target: path,
                    contains: '.dll'
                });

                download.addDownload(sub);
            }
    }

    private async downloadLibraries(libraries: any[], download?: Download): Promise<void> {
        const existing = await filesExist(libraries.filter(l => l.path && l.url).map(l => l.path));
        if (!download && Object.values(existing).some(e => !e)) {
            download = new Download(this.voxura.downloader, '');
            download.total = 0, download.progress = 0;
            download.displayName = `${this.config.loader.type} ${this.config.loader.game} Libraries`;

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
                    invoke('voxura_download_file', {
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

    private async getManifest(): Promise<JavaVersionManifest> {
        const manifestPath = this.manifestPath;
        if (await exists(manifestPath) as any)
            return readJsonFile<JavaVersionManifest>(manifestPath);

        const { data } = await fetch<any>('https://launchermeta.mojang.com/mc/game/version_manifest.json');
        
        const version = this.config.loader.game;
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

        switch (this.gameType) {
            case InstanceGameType.MinecraftJava:
                const { assetsPath, versionsPath } = this.manager;
                const manifest = await this.getManifest();
                const assetsIndex = await readJsonFile<JavaAssetIndex>(`${assetsPath}/indexes/${manifest.assets}.json`);
                if (!(await exists(this.clientPath) as any))
                    await this.installGame();

                const assets = Object.entries(assetsIndex.objects).map(
                    ([key, { hash }]) => ({
                        url: `${MINECRAFT_RESOURCES_URL}/${hash.substring(0, 2)}/${hash}`,
                        type: 'asset',
                        sha1: hash,
                        path: `${assetsPath}/objects/${hash.substring(0, 2)}/${hash}`,
                        legacyPath: `${assetsPath}/virtual/legacy/${key}`,
                        resourcesPath: `${this.path}/resources/${key}`
                    })
                );

                const artifact = {
                    url: manifest.downloads.client.url,
                    sha1: manifest.downloads.client.sha1,
                    path: this.clientPath
                }

                const { loader } = this.config;
                const libraries: any[] = [];
                if (this.loaderType === InstanceLoaderType.Modified) {
                    const loaderManifest = await readJsonFile<JavaVersionManifest>(`${versionsPath}/${loader.type}-${loader.game}-${loader.version}/manifest.json`);
                    manifest.mainClass = loaderManifest.mainClass;
                    libraries.push(...mapLibraries(loaderManifest.libraries, this.manager.librariesPath))

                    if(loaderManifest.minecraftArguments)
                        manifest.minecraftArguments = loaderManifest.minecraftArguments;
                }
                libraries.push(...mapLibraries(manifest.libraries, this.manager.librariesPath));

                await this.downloadLibraries(libraries);
                
                const javaArgs = await this.genArguments(manifest, artifact, libraries);
                console.log(javaArgs);

                const eventId: string = await invoke('voxura_launch', {
                    cwd: this.path,
                    args: javaArgs,
                    javaPath: await this.voxura.java.getExecutable(manifest.javaVersion.majorVersion)
                });
                this.setState(InstanceState.GameRunning);

                listen(eventId, ({ payload: { type, data }}: { payload: { type: string, data: string } }) => {
                    switch(type) {
                        case 'out':
                            console.log(data);
                            break;
                        case 'err':
                            console.warn(data);
                            break;
                        case 'exit':
                            console.warn('game exited');
                            this.setState(InstanceState.None);
                            break;
                    }
                });
                break;
            case InstanceGameType.MinecraftBedrock:
                break;
        }
    }

    private async genArguments(manifest: JavaVersionManifest, artifact: any, libraries: string[]) {
        const args: string[] = [];
        const memory = 4000;
        const account = this.voxura.auth.getCurrent();
        if (manifest.assets !== 'legacy' && gte(coerce(manifest.assets) as any, coerce('1.13') as any)) {
            args.push(...this.processArguments(account, artifact, manifest, libraries, manifest.arguments.jvm));

            args.push(`-Xmx${memory}m`, `-Xms${memory}m`);
            args.push(`-Dminecraft.applet.TargetDirectory="${this.path}"`);
            if (manifest.logging)
                args.push(manifest.logging.client?.argument ?? '');

            args.push(manifest.mainClass);
            args.push(...this.processArguments(account, artifact, manifest, libraries, manifest.arguments.game));
        } else {
            args.push('-cp');
            args.push([...libraries, artifact]
                .filter(l => !l.natives)
                .map(l => `"${l.path.replace(/\/+|\\+/g, '/')}"`)
                .join(';')
            );

            args.push(`-Xmx${memory}m`, `-Xms${memory}m`);
            //args.push(...this.processArguments(account, artifact, manifest, libraries, manifest.arguments.jvm));

            args.push(`-Djava.library.path="${this.path}/natives"`);
            args.push(`-Dminecraft.applet.TargetDirectory="${this.path}"`);
            if (manifest.logging)
                args.push(manifest.logging.client?.argument ?? '');

            args.push(manifest.mainClass);
            args.push(...this.processArguments(account, artifact, manifest, libraries, manifest.minecraftArguments.split(' ')));
        }
        return args.map(a => a.toString());
    }

    private processArguments(account: Account | undefined, artifact: any, manifest: JavaVersionManifest, libraries: string[], args: any[] = []) {
        const processedArgs: any[] = [];
        for (const arg of args) {
            const processed = this.processArgument(arg);
            processedArgs.push(...processed.map(arg => {
                if (ARG_REGEX.test(arg)) {
                    switch(arg.match(ARG_REGEX)?.[1]) {
                        case 'auth_player_name':
                            return account?.name;
                        case 'version_name':
                            return manifest.id;
                        case 'game_directory':
                            return `"${this.path}"`;
                        case 'assets_root':
                            return `"${this.manager.assetsPath}"`;
                        case 'assets_index_name':
                            return manifest.assets;
                        case 'auth_uuid':
                            return account?.uuid;
                        case 'auth_access_token':
                            return account?.minecraftToken;
                        case 'user_type':
                            return 'mojang';
                        case 'version_type':
                            return manifest.type;
                        case 'resolution_width':
                            return 800;
                        case 'resolution_height':
                            return 600;
                        case 'natives_directory':
                            return arg.replace(ARG_REGEX, '"./natives"');
                        case 'classpath':
                            return [...libraries, artifact]
                                .filter(l => !l.natives)
                                .map(l => `"${l.path.replace(/\/+|\\+/g, '/')}"`)
                                .join(';');
                    }
                }
                return arg;
            }));
        }
        return processedArgs;
    }

    private processArgument(arg: any): string[] {
        if (typeof arg === 'string')
            return [arg];
        if (arg.rules) {
            for (const { os, action, features } of arg.rules) {
                if (action === 'allow')
                    if (os) {
                        if (os.name && os.name !== 'windows')
                            return [];
                    } else if (features)
                        if (features.is_demo_user)
                            return [];
                        else if (features.has_custom_resolution)
                            return [];
            }
        }
        
        const array: string[] = Array.isArray(arg.value) ? arg.value : [arg.value];
        return array.map(a => `"${a}"`);
    }

    public async readMods(): Promise<Mod[]> {
        if (this.readingMods)
            throw new Error('mods are already beig read');

        this.readingMods = true;
        this.modifications = [];
        if (await fileExists(this.modsPath))
            this.modifications = await invoke<RustMod[]>('voxura_read_mods', {
                path: this.modsPath
            }).then(m => m.map(getModByFile));

        this.emitEvent('changed');
        this.readingMods = false;

        return this.modifications;
    }

    public changeLoader(type?: string, version?: string): Promise<void> {
        if (type)
            this.config.loader.type = type;
        if (version)
            this.config.loader.version = version;

        this.emitEvent('changed');
        return this.saveConfig();
    }

    public changeVersion(version: string): Promise<void> {
        this.config.loader.game = version;

        this.emitEvent('changed');
        return this.saveConfig();
    }

    private saveConfig(): Promise<void> {
        return writeJsonFile(this.configPath, this.config);
    }

    private setState(state: InstanceState) {
        this.state = state;
        this.emitEvent('changed');
    }

    public get modsPath() {
        return this.path + '/mods';
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
        return `${this.manager.versionsPath}/java-${this.config.loader.game}`;
    }

    public get loaderType() {
        if (this.config.loader.version)
            return InstanceLoaderType.Modified;
        return InstanceLoaderType.Vanilla;
    }

    public get isModded() {
        return this.loaderType === InstanceLoaderType.Modified;
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

    public get webIcon(): string {
        return this.icon ? `data:image/png;base64,${this.base64Icon}` : 'img/icons/unknown_mod.svg';
    }
};