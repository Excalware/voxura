import pmap from 'p-map-browser';
import { exists } from '@tauri-apps/api/fs';

import JavaComponent from './java-component';
import { InstanceType } from '../instance';
import { InstanceState } from '../types';
import MinecraftClientExtension from './minecraft-client-extension';
import { PLATFORM, VOXURA_VERSION } from '../util/constants';
import { TaskType, Download, DownloadTask, DownloadState } from '../downloader';
import { filesExist, invokeTauri, readJsonFile, mavenAsString } from '../util';
import MinecraftJava, { parseRule, JavaAssetIndex, convertPlatform, MinecraftJavaLibrary, MinecraftJavaManifest } from './minecraft-java';
export default class MinecraftJavaClient extends MinecraftJava {
	public static readonly id: string = 'minecraft-java-vanilla'
	public static instanceTypes = [InstanceType.Client]

	public async install() {
		const manifest = await this.getManifest();
		const artifact = {
			url: manifest.downloads.client.url,
			sha1: manifest.downloads.client.sha1,
			path: this.jarPath
		};

		const downloader = this.instance.manager.voxura.downloader;
		const version = this.version;
		const download = new Download('minecraft_java', [version], downloader, false);
		if (!await exists(artifact.path)) {
			download.push();
			await download.download(artifact.url, artifact.path).await();
		}

		const libraries = await this.getLibraries(manifest, []);
		const assetIndex = await this.getAssetIndex(manifest);
		await this.downloadAssets(download, assetIndex);
		await this.downloadLibraries(download, libraries);
		if (!await exists(this.nativesPath))
			await this.extractNatives(download, libraries);
	}

	public async launch() {
		const manifest = await this.getManifest();
		await this.install();

		const libraries = await this.getLibraries(manifest);
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
		const command = (await java.launch([
			...jvmArgs,
			manifest.mainClass,
			...gameArgs
		]))
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

	protected async downloadAssets(download: Download, assetIndex: JavaAssetIndex) {
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

		if (Object.values(existing).includes(false))
			download.push();
		await pmap(Object.entries(existing), async ([path, exists]: [path: string, exists: boolean]) => {
			if (!exists) {
				const asset = assets.find(l => l.path === path);
				if (asset)
					return download.download(asset.url, path).await();
			}
		}, { concurrency: 25 });
	}

	protected async extractNatives(download: Download, libraries: MinecraftJavaLibrary[]) {
		download.push();
		download.setState(DownloadState.Extracting);
		for (const library of libraries) {
			const { rules, natives, downloads } = library;
			if (rules && !rules.every(parseRule))
				continue;
			if (downloads) {
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
					await download.download(artifact.url, path).await();

				const task = new DownloadTask(TaskType.Extract, download);
				download.addTask(task);
				download.setState(DownloadState.Extracting);

				invokeTauri('extract_natives', {
					id: task.id,
					path: this.nativesPath,
					target: path
				});
			}
		}
		await download.awaitTasks();
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

	protected async downloadLibraries(download: Download, libraries: MinecraftJavaLibrary[]): Promise<void> {
        const artifacts = libraries.map(l => l.downloads?.artifact!).filter(a => a).map(a => ({
			...a,
			path: `${this.librariesPath}/${a.path}`
		}));
        const existing = await filesExist(artifacts.map(a => a.path));
        if (Object.values(existing).includes(false))
            download.push();

        await pmap(Object.entries(existing), async([path, exists]: [path: string, exists: boolean]) => {
            if (!exists) {
                const url = artifacts.find(l => l.path === path)?.url;
                if (url)
					return download.download(url, path).await();
            }
        }, { concurrency: 25 });
		download.setState(DownloadState.Finished);
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
				this.parseArguments(await component.getJvmArguments(), parsed, arg =>
					this.parseJvmArgument(arg, manifest, classPaths)
				);

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
				this.parseArguments(await component.getGameArguments(), parsed, 
					arg => this.parseGameArgument(arg, manifest)
				);

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
		return download.download(manifest.assetIndex.url, indexPath).await();
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