import pmap from 'p-map-browser';
import { exists } from '@tauri-apps/api/fs';

import JavaAgent from './java-agent';
import JavaComponent from './java-component';
import { InstanceType } from '../instance';
import { InstanceState } from '../types';
import MinecraftClientExtension from './minecraft-client-extension';
import { Download, DownloadState } from '../downloader';
import { PLATFORM, VOXURA_VERSION } from '../util/constants';
import { filesExist, invokeTauri, readJsonFile, createCommand, mavenAsString } from '../util';
import MinecraftJava, { parseRule, JavaAssetIndex, convertPlatform, MinecraftJavaLibrary, MinecraftJavaManifest } from './minecraft-java';
export default class MinecraftJavaClient extends MinecraftJava {
	public static readonly id: string = 'minecraft-java-vanilla'
	public static instanceTypes = [InstanceType.Client]

	public async installGame() {
		const manifest = await this.getManifest();
		const artifact = {
			url: manifest.downloads.client.url,
			sha1: manifest.downloads.client.sha1,
			path: this.jarPath
		};

		const downloader = this.instance.manager.voxura.downloader;
		const version = this.version;
		const download = new Download('minecraft_java', [version], downloader);
		if (!await exists(artifact.path))
			await download.download(artifact.url, artifact.path);

		const { libraries } = manifest;
		const assetIndex = await this.getAssetIndex(manifest);
		await this.downloadAssets(assetIndex);

		await this.downloadLibraries(libraries, download);

		await this.extractNatives(download, libraries);
	}

	public async launch() {
		const manifest = await this.getManifest();
		if (!await exists(this.jarPath))
			await this.installGame();

		const assetIndex = await this.getAssetIndex(manifest);
		await this.downloadAssets(assetIndex);

		const libraries = await this.getLibraries(manifest);
		await this.downloadLibraries(libraries);

		if (!await exists(this.nativesPath)) {
			const download = new Download('minecraft_java', [this.version], this.instance.voxura.downloader);
			await this.extractNatives(download, libraries);
		}

		for (const component of this.instance.store.components)
			if (component instanceof MinecraftClientExtension) {
				manifest.mainClass = await component.getManifest().then(m => m.mainClass);
				break;
			}

		const jvmArgs = await this.getJvmArguments(manifest, this.getClassPaths(libraries, this.jarPath), []);
		const gameArgs = await this.getGameArguments(manifest);

		const java = this.instance.getComponentByType<JavaComponent, typeof JavaComponent>(JavaComponent);
		if (!java)
			throw new Error('where is java');

		const launchTime = Date.now();
		const command = createCommand(await java.getBinaryPath(), [
			...jvmArgs,
			manifest.mainClass,
			...gameArgs
		], this.instance.path)
			.on('close', data => {
				console.log('command closed:', data.code, data.signal);
				this.instance.setState(InstanceState.None);

				const { playTime } = this.instance.store;
				if (typeof playTime !== 'number' || isNaN(playTime))
					this.instance.store.playTime = Date.now() - launchTime;
				else
					this.instance.store.playTime += Date.now() - launchTime;
				this.instance.store.save();
			})
			.on('error', error => {
				console.log('command error:', error);
			});

		command.stdout.on('data', line => {
			console.log('stdout:', line);
		});
		command.stderr.on('data', line => {
			console.error('stderr:', line);
		});

		const child = await command.spawn();
		command.on('close', () => this.instance.killProcess(child));
		console.log('child process id:', child.pid);

		this.instance.processes.push(child);
		this.instance.setState(InstanceState.GameRunning);
	}

	protected async downloadAssets(assetIndex: JavaAssetIndex) {
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
		const downloader = this.instance.manager.voxura.downloader;

		let download: Download;
		if (Object.values(existing).some(e => !e))
			download = new Download('minecraft_java_assets', [this.id, this.version], downloader);

		await pmap(Object.entries(existing), async ([path, exists]: [path: string, exists: boolean]) => {
			if (!exists) {
				const asset = assets.find(l => l.path === path);
				if (asset) {
					const sub = new Download('', null, downloader, false);
					download.addDownload(sub);

					return sub.download(asset.url, path);
				}
			}
		}, { concurrency: 25 });
	}

	protected async extractNatives(download: Download, libraries: MinecraftJavaLibrary[]) {
		download.setState(DownloadState.Extracting);
		for (const library of libraries) {
			const { rules, natives, downloads } = library;
			if (rules && !rules.every(parseRule))
				continue;
			if (downloads) {
				const sub = new Download('', null, this.instance.manager.voxura.downloader, false);

				let artifact = downloads?.artifact;
				const classifiers = downloads?.classifiers;
				if (classifiers) {
					const native = natives[convertPlatform(PLATFORM)];
					if (native) {
						const classifier = classifiers[native];
						if (classifier)
							artifact = classifier
					}
				}

				const path = `${this.librariesPath}/${artifact.path}`;
				if (!await exists(path))
					await sub.download(artifact.url, path);

				sub.setState(DownloadState.Extracting);
				invokeTauri('extract_natives', {
					id: sub.uuid,
					path: this.nativesPath,
					target: path
				});

				download.addDownload(sub);
			}
		}
		await download.waitForFinish();
	}

	protected async getLibraries(manifest: MinecraftJavaManifest, libraries: MinecraftJavaLibrary[] = []) {
		libraries.push(...manifest.libraries);
		for (const component of this.instance.store.components)
			if (component instanceof MinecraftClientExtension)
				libraries.push(...await component.getLibraries());

		return libraries.map((library: any) => {
			if (library.url)
				return {
					...library,
					downloads: {
						artifact: {
							url: `${library.url}/${mavenAsString(library.name, '', '')}`,
							path: mavenAsString(library.name)
						}
					}
				};
			return library;
		}).filter(({ rules }) => {
			if (rules)
				return rules.every(parseRule);
			return true;
		});
	}

	protected async downloadLibraries(libraries: MinecraftJavaLibrary[], download?: Download): Promise<void> {
        const { id, version } = this.instance.gameComponent;
		const downloader = this.instance.manager.voxura.downloader;

		const artifacts = libraries.map(l => l.downloads?.artifact!).filter(a => a).map(a => ({
			...a,
			path: `${this.librariesPath}/${a.path}`
		}));
        const existing = await filesExist(artifacts.map(a => a.path));
        if (!download && Object.values(existing).some(e => !e)) {
            download = new Download('component_libraries', [id, version], downloader);
			download.setState(DownloadState.Downloading);
            downloader.emitEvent('downloadStarted', download);
        }

        await pmap(Object.entries(existing), async([path, exists]: [path: string, exists: boolean]) => {
            if (!exists) {
                const url = artifacts.find(l => l.path === path)?.url;
                if (url) {
                    const sub = new Download('', null, downloader, false);
                    download!.addDownload(sub);
                    return sub.download(url, path);
                }
            }
        }, { concurrency: 25 });
		download?.setState(DownloadState.Finished);
    }

	protected getClassPaths(libraries: MinecraftJavaLibrary[], clientPath: string) {
		const paths = libraries.map(l => l.downloads?.artifact!).filter(a => a).map(l => `${this.librariesPath}/${l.path}`);
		paths.push(clientPath);

		return paths.join(classPathSeperator());
	}

	protected async getJvmArguments(manifest: MinecraftJavaManifest, classPaths: string, customArgs: string[]) {
		const args = manifest.arguments.jvm;
		const parsed: string[] = [];
		if (args)
			this.parseArguments(args, parsed, arg =>
				this.parseJvmArgument(arg, manifest, classPaths)
			);
		else {
			parsed.push(`-Djava.library.path=${this.nativesPath}`);
			parsed.push('-cp', classPaths);
		}
		for (const component of this.instance.store.components)
			if (component instanceof MinecraftClientExtension)
				parsed.push(...await component.getJvmArguments());
			else if (component instanceof JavaAgent)
				parsed.push(`-javaagent:${await component.getFilePath()}`);

		// TODO: implement a min-max range
		const memory = this.instance.store.memoryAllocation * 1000;
		parsed.push(`-Xmx${memory}M`);

		parsed.push(...customArgs);
		return parsed;
	}

	protected parseJvmArgument(argument: string, manifest: MinecraftJavaManifest, classPaths: string) {
		return argument
			.replace('${natives_directory}', this.nativesPath)
			.replace('${library_directory}', this.instance.manager.librariesPath)
			.replace('${classpath_separator}', classPathSeperator())
			.replace('${launcher_name}', 'voxura')
			.replace('${launcher_version}', VOXURA_VERSION)
			.replace('${version_name}', manifest.id)
			.replace('${classpath}', classPaths);
	}

	protected async getGameArguments(manifest: MinecraftJavaManifest) {
		const args = manifest.arguments.game;
		const parsed: string[] = [];
		if (args)
			this.parseArguments(args, parsed, arg => this.parseGameArgument(arg, manifest));
		for (const component of this.instance.store.components)
			if (component instanceof MinecraftClientExtension)
				parsed.unshift(...await component.getGameArguments());

		return parsed;
	}

	protected parseGameArgument(argument: string, manifest: MinecraftJavaManifest) {
		const account = this.instance.manager.voxura.auth.getCurrent();
		if (!account)
			throw new Error();

		const { assetsPath } = this.instance.manager;
		const { minecraftToken } = account;
		const { gameResolution } = this.instance.store;

		return argument
			.replace('${auth_access_token}', minecraftToken)
			.replace('${auth_session}', minecraftToken)
			.replace('${auth_player_name}', account.name ?? 'Player')
			.replace('${auth_uuid}', account.uuid ?? '')
			.replace('${user_properties}', '{}')
			.replace('${user_type}', 'mojang')
			.replace('${version_name}', manifest.id)
			.replace('${assets_index_name}', manifest.assets)
			.replace('${game_directory}', this.instance.path)
			.replace('${assets_root}', assetsPath)
			.replace('${game_assets}', assetsPath)
			.replace('${version_type}', manifest.type)
			.replace('${resolution_width}', gameResolution[0].toString())
			.replace('${resolution_height}', gameResolution[1].toString());
	}

	protected async getAssetIndex(manifest: MinecraftJavaManifest): Promise<JavaAssetIndex> {
		const indexPath = this.getAssetIndexPath(manifest);
		if (!await exists(indexPath))
			await this.downloadAssetIndex(manifest);
		return readJsonFile<JavaAssetIndex>(indexPath);
	}

	protected async downloadAssetIndex(manifest: MinecraftJavaManifest) {
		const indexPath = this.getAssetIndexPath(manifest);
		const download = new Download('minecraft_java_asset_index', [manifest.assets], this.instance.manager.voxura.downloader);
		return download.download(manifest.assetIndex.url, indexPath);
	}

	public getAssetIndexPath(manifest: MinecraftJavaManifest) {
		return `${this.instance.manager.assetsPath}/indexes/${manifest.assets}.json`;
	}

	public get nativesPath() {
        return this.instance.path + '/natives';
    }

	public get librariesPath() {
		return this.instance.voxura.rootPath + '/libraries';
	}
	
	public get jarPath() {
        return this.path + '/client.jar';
    }
}

function classPathSeperator() {
	if (PLATFORM === 'win32')
		return ';';
	return ':';
}

export const MINECRAFT_LIBRARIES_URL = 'https://libraries.minecraft.net';
export const MINECRAFT_RESOURCES_URL = 'https://resources.download.minecraft.net';