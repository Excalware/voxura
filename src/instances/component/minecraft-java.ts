import pmap from 'p-map-browser';
import { fetch } from '@tauri-apps/api/http';

import GameComponent from './game-component';
import { InstanceState } from '../../types';
import MinecraftExtension from './minecraft-extension';
import { Download, DownloadType } from '../../downloader';
import { PLATFORM, VOXURA_VERSION, MINECRAFT_RESOURCES_URL, MINECRAFT_VERSION_MANIFEST } from '../../util/constants';
import { fileExists, filesExist, invokeTauri, readJsonFile, mapLibraries, createCommand, convertPlatform } from '../../util';

export type Rule = {
	os?: OsRule,
	action: 'allow' | 'disallow',
	features?: FeatureRule
};
export type OsRule = {
	name: 'windows' | 'linux' | 'osx';
	arch?: string;
	version?: string;
};
export type FeatureRule = {
	is_demo_user?: boolean,
	has_demo_resolution?: boolean
};
export type Argument = string | {
	value: ArgumentValue,
	rules?: MinecraftJavaRule[]
};
export type ArgumentValue = string | string[];
export type VersionManifestVersion = {
	id: string;
	url: string;
	time: string;
	type: 'release' | 'snapshot' | 'old_beta' | 'old_alpha';
	releaseTime: string;
};
export type VersionManifestResponse = {
	latest: {
		release: string;
		snapshot: string;
	};
	versions: VersionManifestVersion[];
};
export type MinecraftJavaRule = {
	os?: {
		name: 'windows' | 'linux' | 'osx';
		arch?: 'x86';
		version?: string;
	};
	action: 'allow';
	features?: {
		is_demo_user?: boolean;
		has_custom_resolution?: boolean;
	};
};
export type MinecraftJavaArtifact = MinecraftJavaDownload & {
	path: string;
};
export type MinecraftJavaLibrary = {
	name: string;
	path: string;
	url?: string;
	rules?: MinecraftJavaRule[];
	natives: any;
	downloads?: {
		artifact: MinecraftJavaArtifact;
	};
};
export type MinecraftJavaDownload = {
	url: string;
	size: number;
	sha1: string;
	natives: any;
};
export type MinecraftJavaArgument = string | {
	value: string | string[];
	rules: MinecraftJavaRule[];
};
export type MinecraftJavaManifest = {
	id: string;
	time: string;
	type: 'release' | 'snapshot' | 'old-beta' | 'old-alpha';
	assets: string;
	logging: {
		client: {
			type: string;
			file: MinecraftJavaDownload & {
				id: string;
			};
			argument: string;
		};
	};
	mainClass: string;
	arguments: {
		jvm: Argument[];
		game: Argument[];
	};
	downloads: {
		client: MinecraftJavaDownload;
		client_mappings: MinecraftJavaDownload;
		server: MinecraftJavaDownload;
		server_mappings: MinecraftJavaDownload;
	};
	libraries: MinecraftJavaLibrary[];
	assetIndex: {
		id: string;
		url: string;
		sha1: string;
		size: number;
		totalSize: number;
	};
	releaseTime: string;
	javaVersion: {
		component: string;
		majorVersion: number;
	};
	inheritsFrom?: string;
	complianceLevel: number;
	minecraftArguments?: string;
	minimumLauncherVersion: number;
};

export default class MinecraftJava extends GameComponent {
	public static readonly id = 'minecraft-java-vanilla';

	public static async getVersions() {
		return fetch<VersionManifestResponse>(MINECRAFT_VERSION_MANIFEST).then(({ data: { versions } }) => {
			// TODO: better way to do this P L E A S E
			const mapper = (version: VersionManifestVersion) => ({
				id: version.id,
				category: ['release', 'snapshot', 'old_beta', 'old_alpha'].indexOf(version.type),
				dateCreated: new Date(version.releaseTime)
			});
			return [
				versions.filter(v => v.type === 'release').map(mapper),
				versions.filter(v => v.type === 'snapshot').map(mapper),
				versions.filter(v => v.type === 'old_beta').map(mapper),
				versions.filter(v => v.type === 'old_alpha').map(mapper)
			];
		});
	}

	public async getManifest(): Promise<MinecraftJavaManifest> {
		const component = this.instance.gameComponent;

		const manifestPath = this.instance.manifestPath;
		if (await fileExists(manifestPath))
			return readJsonFile<MinecraftJavaManifest>(manifestPath);

		const { data } = await fetch<any>('https://launchermeta.mojang.com/mc/game/version_manifest.json');

		const version = component.version;
		const manifest = data.versions.find((manifest: any) => manifest.id === version);
		if (!manifest)
			throw new Error(`Could not find manifest for ${version}`);

		await this.instance.manager.voxura.downloader.downloadFile(manifestPath, manifest.url,
			`Minecraft: Java Edition ${version} Manifest`, 'img/icons/minecraft/java.png'
		);

		return readJsonFile<MinecraftJavaManifest>(manifestPath);
	}

	public async installGame(): Promise<void> {
		const manifest = await this.getManifest();
		const artifact = {
			url: manifest.downloads.client.url,
			sha1: manifest.downloads.client.sha1,
			path: this.instance.clientPath
		};

		const downloader = this.instance.manager.voxura.downloader;
		const version = this.version;
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
		const downloader = this.instance.manager.voxura.downloader;

		let download: Download;
		if (Object.values(existing).some(e => !e)) {
			download = new Download(downloader, '');
			download.total = 0, download.progress = 0;
			download.displayName = `${this.id} ${this.version} Assets`;

			downloader.downloads.push(download);
			downloader.emitEvent('changed');
			downloader.emitEvent('downloadStarted', download);
		}

		await pmap(Object.entries(existing), async ([path, exists]: [path: string, exists: boolean]) => {
			if (!exists) {
				const asset = assets.find(l => l.path === path);
				if (asset) {
					const sub = new Download(downloader, path);
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

	private extractNatives(download: Download, libraries: any[]): void {
		for (const { path, natives } of libraries)
			if (natives) {
				const sub = new Download(this.instance.manager.voxura.downloader, path);
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
		const manifest = await this.getManifest();
		if (!await fileExists(this.instance.clientPath))
			await this.installGame();

		const assetIndex = await this.getAssetIndex(manifest);
		await this.downloadAssets(assetIndex);

		const libraries = await this.getLibraries(manifest, '../../libraries');
		await this.instance.downloadLibraries(libraries);

		for (const component of this.instance.store.components)
			if (component instanceof MinecraftExtension) {
				console.log(component);
				manifest.mainClass = await component.getManifest().then(m => m.mainClass);
				break;
			}

		const javaPath = await instanceManager.voxura.java.getExecutable(manifest.javaVersion.majorVersion);
		const jvmArgs = this.getJvmArguments(manifest, this.getClassPaths(libraries, this.instance.clientPath), []);
		const gameArgs = this.getGameArguments(manifest);

		const command = createCommand(javaPath, [
			...jvmArgs,
			manifest.mainClass,
			...gameArgs
		], this.instance.path)
			.on('close', data => {
				console.log('command closed:', data.code, data.signal);
				this.instance.setState(InstanceState.None);
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
		console.log('child process id:', child.pid);

		this.instance.processes.push(child);
		this.instance.setState(InstanceState.GameRunning);
	}

	private async getLibraries(manifest: MinecraftJavaManifest, path: string, libraries: MinecraftJavaLibrary[] = []) {
		libraries.push(...mapLibraries(manifest.libraries, path));
		for (const component of this.instance.store.components)
			if (component instanceof MinecraftExtension)
				libraries.push(...await component.getLibraries());

		return libraries;
	}

	private getClassPaths(libraries: MinecraftJavaLibrary[], clientPath: string) {
		const paths = libraries.map(l => l.path.replace(/\/+|\\+/g, '/'));
		paths.push(clientPath);

		return paths.join(classPathSeperator());
	}

	private parseArguments(args: Argument[], parsedArgs: string[], parser: (arg: string) => string) {
		for (const arg of args) {
			if (typeof arg === 'string')
				parsedArgs.push(parser(arg));
			else if (arg.rules?.every(parseRule) ?? true) {
				const { value } = arg;
				if (typeof value === 'string')
					parsedArgs.push(parser(value));
				else
					for (const val of value)
						parsedArgs.push(parser(val));
			}
		}
	}

	private getJvmArguments(manifest: MinecraftJavaManifest, classPaths: string, customArgs: string[]) {
		const args = manifest.arguments.jvm;
		const parsed: string[] = [];
		if (args)
			this.parseArguments(args, parsed, arg =>
				this.parseJvmArgument(arg, manifest, classPaths)
			);
		else {
			parsed.push(`-Djava.library.path=${this.instance.nativesPath}`);
			parsed.push('-cp', classPaths);
		}

		// TODO: implement a min-max range
		const memory = this.instance.store.memoryAllocation * 1000;
		parsed.push(`-Xmx${memory}M`);

		parsed.push(...customArgs);
		return parsed;
	}

	private parseJvmArgument(argument: string, manifest: MinecraftJavaManifest, classPaths: string) {
		return argument
			.replace('${natives_directory}', './natives')
			.replace('${library_directory}', '../../libraries"')
			.replace('${classpath_separator}', classPathSeperator())
			.replace('${launcher_name}', 'voxura')
			.replace('${launcher_version}', VOXURA_VERSION)
			.replace('${version_name}', manifest.id)
			.replace('${classpath}', classPaths);
	}

	private getGameArguments(manifest: MinecraftJavaManifest) {
		const args = manifest.arguments.game;
		const parsed: string[] = [];
		if (args)
			this.parseArguments(args, parsed, arg => this.parseGameArgument(arg, manifest));

		return parsed;
	}

	private parseGameArgument(argument: string, manifest: MinecraftJavaManifest) {
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
			.replace('${game_directory}', './')
			.replace('${assets_root}', assetsPath)
			.replace('${game_assets}', assetsPath)
			.replace('${version_type}', manifest.type)
			.replace('${resolution_width}', gameResolution[0].toString())
			.replace('${resolution_height}', gameResolution[1].toString());
	}

	private async getAssetIndex(manifest: MinecraftJavaManifest): Promise<JavaAssetIndex> {
		const indexPath = this.getAssetIndexPath(manifest);
		if (!await fileExists(indexPath))
			await this.downloadAssetIndex(manifest);
		return readJsonFile<JavaAssetIndex>(indexPath);
	}

	private async downloadAssetIndex(manifest: MinecraftJavaManifest) {
		const indexPath = this.getAssetIndexPath(manifest);
		await this.instance.manager.voxura.downloader.downloadFile(indexPath, manifest.assetIndex.url,
			`Minecraft ${manifest.assets} Asset Index`, 'img/icons/minecraft/java.png'
		);
	}

	public getAssetIndexPath(manifest: MinecraftJavaManifest) {
		return `${this.instance.manager.assetsPath}/indexes/${manifest.assets}.json`;
	}
};

function parseRule(rule: Rule) {
	let result = true;
	const osName = rule.os?.name;
	if (osName)
		result = osName === convertPlatform(PLATFORM);

	const features = rule.features;
	if (features) {
		if (features.is_demo_user)
			result = false;
		if (features.has_demo_resolution)
			result = false;
	}

	return rule.action === 'allow' ? result : !result;
};

function classPathSeperator() {
	if (PLATFORM === 'win32')
		return ';';
	return ':';
};

interface JavaAssetIndex {
	objects: {
		[key: string]: {
			hash: string,
			size: number
		}
	}
};