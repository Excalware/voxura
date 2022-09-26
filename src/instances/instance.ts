import { Buffer } from 'buffer/';
import { invoke } from '@tauri-apps/api';
import { listen } from '@tauri-apps/api/event';
import { gte, coerce } from 'semver';
import { v4 as uuidv4 } from 'uuid';
import { readDir, readBinaryFile } from '@tauri-apps/api/fs';

import { MINECRAFT_RESOURCES_URL } from '../util/constants';
import { fileExists, readJsonFile, mapLibraries } from '../util';
import type Account from '../auth/account';
import type { Voxura } from '../voxura';
import type InstanceManager from './manager';

enum InstanceGameType {
    MinecraftJava,
    MinecraftBedrock
};
enum InstanceLoaderType {
    Vanilla,
    Modified
};
interface Modification {
    name: string,
    path: string
};
interface InstanceConfig {
    loader: {
        game: string,
        type: string,
        version?: string
    }
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
    minecraftArguments: string[],
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
    loader: {
        game: '1.0.0',
        type: 'vanilla'
    }
};
export default class Instance {
    public id: string;
    public name: string;
    public icon: Uint8Array | void;
    public modifications: Modification[];
    private path: string;
    private voxura: Voxura
    private config: InstanceConfig;
    private manager: InstanceManager;
    private gameType: InstanceGameType;
    
    constructor(manager: InstanceManager, name: string, path: string) {
        this.manager = manager;
        this.voxura = manager.voxura;

        this.id = uuidv4();
        this.name = name;
        this.path = path;
        this.config = DEFAULT_CONFIG;
        this.gameType = InstanceGameType.MinecraftJava;
        this.modifications = [];
    }

    async init(): Promise<void> {
        await this.refresh();

        //this.voxura.store.dispatch(addInstance(this.serialize()));
        console.log('Loaded', this.name);
    }

    async refresh(): Promise<void> {
        this.icon = await readBinaryFile(this.path + '/icon.png').catch(console.log);
        this.config = await readJsonFile<InstanceConfig>(this.path + '/config.json').catch(console.log) ?? DEFAULT_CONFIG;
        this.manager.emitEvent('listChanged');
    }

    async launch(): Promise<void> {
        console.log('[voxura.instances]: Launching', this);

        switch (this.gameType) {
            case InstanceGameType.MinecraftJava:
                const { assetsPath, versionsPath } = this.manager;
                const manifest = await readJsonFile<JavaVersionManifest>(this.manifestPath);
                const assetsIndex = await readJsonFile<JavaAssetIndex>(`${assetsPath}/indexes/${manifest.assets}.json`);
                
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

                let artifact = {
                    url: manifest.downloads.client.url,
                    sha1: manifest.downloads.client.sha1,
                    //path: `${versionsPath}/${manifest.id}.jar`
                    path: `${this.manager.librariesPath}/minecraft/${manifest.id}.jar`
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
                
                const javaArgs = await this.genArguments(manifest, artifact, libraries);
                console.log(javaArgs);

                const eventId: string = await invoke('launch', {
                    cwd: this.path,
                    args: javaArgs,
                    javaPath: await this.voxura.java.getExecutable(17)
                });
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
                            break;
                    }
                });
                break;
            case InstanceGameType.MinecraftBedrock:
                break;
        }
    }

    async genArguments(manifest: JavaVersionManifest, artifact: any, libraries: string[]) {
        const args: string[] = [];
        const memory = 4000;
        const account = this.voxura.auth.getCurrent();
        if (manifest.assets !== 'legacy' && gte(coerce(manifest.assets), coerce('1.13'))) {
            args.push(...this.processArguments(account, artifact, manifest, libraries, manifest.arguments.jvm));

            args.push(`-Xmx${memory}m`, `-Xms${memory}m`);
            args.push(`-Dminecraft.applet.TargetDirectory="${this.path}"`);
            if (manifest.logging)
                args.push(manifest.logging.client?.argument ?? '');

            args.push(manifest.mainClass);

            args.push(...this.processArguments(account, artifact, manifest, libraries, manifest.arguments.game));
        } else {
            
        }
        return args.map(a => a.toString());
    }

    processArguments(account: Account | undefined, artifact: any, manifest: JavaVersionManifest, libraries: string[], args: any[] = []) {
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

    processArgument(arg: any): string[] {
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

    public async readMods(): Promise<Modification[]> {
        if (await fileExists(this.modsPath)) {
            this.modifications = [];
            for (const { name, path, children } of await readDir(this.modsPath))
                if (name && !children)
                    this.modifications.push({ name, path });
        }
        this.manager.emitEvent('listChanged');

        return this.modifications;
    }

    get modsPath() {
        return `${this.path}/mods`;
    }

    get manifestPath() {
        return `${this.manager.versionsPath}/java-${this.config.loader.game}/manifest.json`;
    }

    get loaderType() {
        if (this.config.loader.version)
            return InstanceLoaderType.Modified;
        return InstanceLoaderType.Vanilla;
    }

    get isModded() {
        return this.loaderType === InstanceLoaderType.Modified;
    }

    get base64Icon(): string | null {
        return this.icon ? Buffer.from(this.icon).toString('base64') : null;
    }

    serialize() {
        const { id, name, path, icon, config, isModded, loaderType } = this;
        return {
            id, name, path, icon: icon && Buffer.from(icon).toString('base64'), config,
            isModded,
            loaderType
        };
    }
};