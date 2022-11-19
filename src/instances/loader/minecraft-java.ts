import pmap from 'p-map-browser';
import { fetch } from '@tauri-apps/api/http';
import { listen } from '@tauri-apps/api/event';
import { gte, coerce } from 'semver';

import Loader from '.';
import type Account from '../../auth/account';
import { InstanceState } from '../instance';
import { Download, DownloadType } from '../../downloader';
import { LoaderType, LoaderSetupType, JavaVersionManifest } from '../../types';
import { MINECRAFT_RESOURCES_URL, MINECRAFT_VERSION_MANIFEST } from '../../util/constants';
import { fileExists, filesExist, invokeTauri, readJsonFile, mapLibraries } from '../../util';

const ARG_REGEX = /\${*(.*)}/;
export default class MinecraftJava extends Loader {
    public static id = 'minecraft-java-vanilla';
    public type = LoaderType.Vanilla;
    public vanillaLoader = MinecraftJava;
    public static setupType: LoaderSetupType = LoaderSetupType.Versions;

    public static getVersions(): Promise<any> {
         return fetch<{ versions: any[] }>(MINECRAFT_VERSION_MANIFEST).then(({ data: { versions } }) =>
            [{
                name: "Releases",
                data: versions.filter(v => v.type == 'release').map(v => ({ name: v.id, value: v.id }))
            }, {
                name: "Snapshots",
                data: versions.filter(v => v.type == 'snapshot').map(v => ({ name: v.id, value: v.id }))
            }, {
                name: "Old Betas",
                data: versions.filter(v => v.type == 'old_beta').map(v => ({ name: v.id, value: v.id }))
            }, {
                name: "Old Alphas",
                data: versions.filter(v => v.type == 'old_alpha').map(v => ({ name: v.id, value: v.id }))
            }]
        );
    }

    public async installGame(): Promise<void> {
        const manifest = await this.instance.getManifest();
        const artifact = {
            url: manifest.downloads.client.url,
            sha1: manifest.downloads.client.sha1,
            path: this.instance.clientPath
        };

        const downloader = this.voxura.downloader;
        const version = this.instance.config.loader.game;
        const download = new Download(downloader, artifact.path);
        download.total = 0;
        download.progress = 0;
        download.displayName = `Minecraft: Java Edition ${version}`;
        download.displayIcon = 'img/icons/minecraft/java.png';

        downloader.downloads.push(download);
        downloader.emitEvent('changed');
        downloader.emitEvent('downloadStarted', download);

        if (!await fileExists(artifact.path)) {
            invokeTauri('download_file', {
                id: download.id,
                url: artifact.url,
                path: artifact.path
            });

            await download.waitForFinish();
        }

        const libraries = mapLibraries(manifest.libraries, this.instance.manager.librariesPath);
        const assetIndex = await this.getAssetIndex(manifest);
        await this.downloadAssets(assetIndex);

        await this.instance.downloadLibraries(libraries, download);

        this.extractNatives(download, libraries);

        if (libraries.some(l => l.natives))
            await download.waitForFinish();
    }

    private async downloadAssets(assetIndex: JavaAssetIndex) {
        const assetsPath = this.instance.manager.assetsPath;
        const assets = Object.entries(assetIndex.objects).map(
            ([key, { hash }]) => ({
                url: `${MINECRAFT_RESOURCES_URL}/${hash.substring(0, 2)}/${hash}`,
                type: 'asset',
                sha1: hash,
                path: `${assetsPath}/objects/${hash.substring(0, 2)}/${hash}`,
                legacyPath: `${assetsPath}/virtual/legacy/${key}`,
                resourcesPath: `${this.instance.path}/resources/${key}`
            })
        );
        const existing = await filesExist(assets.map(l => l.path));
        let download: Download;
        if (Object.values(existing).some(e => !e)) {
            const { loader } = this.instance.config;
            download = new Download(this.voxura.downloader, '');
            download.total = 0, download.progress = 0;
            download.displayName = `${loader.type} ${loader.game} Assets`;

            const downloader = this.voxura.downloader;
            downloader.downloads.push(download);
            downloader.emitEvent('changed');
            downloader.emitEvent('downloadStarted', download);
        }

        await pmap(Object.entries(existing), async([path, exists]: [path: string, exists: boolean]) => {
            if (!exists) {
                const asset = assets.find(l => l.path === path);
                if (asset) {
                    const sub = new Download(this.voxura.downloader, path);
                    invokeTauri('download_file', {
                        id: sub.id,
                        url: asset.url,
                        path
                    });

                    (download as any).addDownload(sub);
                    await sub.waitForFinish();
                }
            }
        }, { concurrency: 25 });
    }

    private async downloadAssetIndex(manifest: JavaVersionManifest) {
        const indexPath = this.getAssetIndexPath(manifest);
        await this.voxura.downloader.downloadFile(indexPath, manifest.assetIndex.url,
            `Minecraft ${manifest.assets} Asset Index`, 'img/icons/minecraft/java.png'
        );
    }

    private async getAssetIndex(manifest: JavaVersionManifest): Promise<JavaAssetIndex> {
        const indexPath = this.getAssetIndexPath(manifest);
        if (!await fileExists(indexPath))
            await this.downloadAssetIndex(manifest);
        return readJsonFile<JavaAssetIndex>(indexPath);
    }

    private extractNatives(download: Download, libraries: any[]): void {
        for (const { path, natives } of libraries)
            if (natives) {
                const sub = new Download(this.voxura.downloader, path);
                sub.type = DownloadType.Extract;
                sub.update(0, 2);

                invokeTauri('extract_archive_contains', {
                    id: sub.id,
                    path: this.instance.nativesPath,
                    target: sub.path,
                    contains: '.dll'
                });

                download.addDownload(sub);
            }
    }

    public async launch() {
        const instanceManager = this.instance.manager;
        const manifest = await this.instance.getManifest();
        if (!await fileExists(this.instance.clientPath))
            await this.installGame();

        const assetIndex = await this.getAssetIndex(manifest);
        await this.downloadAssets(assetIndex);

        const artifact = {
            url: manifest.downloads.client.url,
            sha1: manifest.downloads.client.sha1,
            path: this.instance.clientPath
        }

        const libraries = await this.getLibraries(manifest, instanceManager.librariesPath);
        await this.instance.downloadLibraries(libraries);
        
        const javaArgs = await this.genArguments(manifest, artifact, libraries);
        console.log(javaArgs);

        const eventId: string = await invokeTauri('launch', {
            cwd: this.instance.path,
            args: javaArgs,
            javaPath: await this.voxura.java.getExecutable(manifest.javaVersion.majorVersion)
        });
        this.instance.setState(InstanceState.GameRunning);

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
                    this.instance.setState(InstanceState.None);
                    break;
            }
        });
    }

    protected async getLibraries(manifest: JavaVersionManifest, path: string, libraries: any[] = []) {
        libraries.push(...mapLibraries(manifest.libraries, path));
        return libraries;
    }

    private async genArguments(manifest: JavaVersionManifest, artifact: any, libraries: string[]) {
        const args: string[] = [];
        const memory = 4000;
        const account = this.voxura.auth.getCurrent();
        const instancePath = this.instance.path;
        if (manifest.assets !== 'legacy' && gte(coerce(manifest.assets) as any, coerce('1.13') as any)) {
            args.push(...this.processArguments(account, artifact, manifest, libraries, manifest.arguments.jvm));

            args.push(`-Xmx${memory}m`, `-Xms${memory}m`);
            args.push(`-Dminecraft.applet.TargetDirectory="${instancePath}"`);
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

            args.push(`-Djava.library.path="${instancePath}/natives"`);
            args.push(`-Dminecraft.applet.TargetDirectory="${instancePath}"`);
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
                            return `"${this.instance.path}"`;
                        case 'assets_root':
                            return `"${this.instance.manager.assetsPath}"`;
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

    public getAssetIndexPath(manifest: JavaVersionManifest) {
        return `${this.instance.manager.assetsPath}/indexes/${manifest.assets}.json`;
    }
};

interface JavaAssetIndex {
    objects: {
        [key: string]: {
            hash: string,
            size: number
        }
    }
};