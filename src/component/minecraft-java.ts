import { fetch } from '@tauri-apps/api/http';
import { exists } from '@tauri-apps/api/fs';

import GameComponent from './game-component';
import { Download } from '../downloader';
import { LaunchError } from '../instance';
import { readJsonFile } from '../util';
import { ARCH, PLATFORM } from '../util/constants';

export interface Rule {
	os?: OsRule
	action: 'allow' | 'disallow'
	features?: FeatureRule
}
export interface OsRule {
	name: 'windows' | 'linux' | 'osx'
	arch?: string
	version?: string
}
export interface FeatureRule {
	is_demo_user?: boolean
	has_demo_resolution?: boolean
}
export type Argument = string | {
	value: ArgumentValue
	rules?: MinecraftJavaRule[]
}
export type ArgumentValue = string | string[]
export interface VersionManifestVersion {
	id: string
	url: string
	time: string
	type: 'release' | 'snapshot' | 'old_beta' | 'old_alpha'
	releaseTime: string
}
export interface VersionManifestResponse {
	latest: {
		release: string
		snapshot: string
	}
	versions: VersionManifestVersion[]
}
export interface MinecraftJavaRule {
	os?: {
		name: 'windows' | 'linux' | 'osx'
		arch?: 'x86'
		version?: string
	}
	action: 'allow'
	features?: {
		is_demo_user?: boolean
		has_custom_resolution?: boolean
	}
}
export type MinecraftJavaArtifact = MinecraftJavaDownload & {
	path: string
}
export interface MinecraftJavaLibrary {
	name: string
	rules?: MinecraftJavaRule[]
	natives: Record<string, string>
	downloads?: {
		artifact: MinecraftJavaArtifact
		classifiers?: Record<string, MinecraftJavaArtifact>
	}
}
export interface MinecraftJavaDownload {
	url: string
	size: number
	sha1: string
	natives: any
}
export type MinecraftJavaArgument = string | {
	value: string | string[]
	rules: MinecraftJavaRule[]
}
export interface MinecraftJavaManifest {
	id: string
	time: string
	type: 'release' | 'snapshot' | 'old-beta' | 'old-alpha'
	assets: string
	logging: {
		client: {
			type: string
			file: MinecraftJavaDownload & {
				id: string
			}
			argument: string
		}
	}
	mainClass: string
	arguments: {
		jvm: Argument[]
		game: Argument[]
	}
	downloads: {
		client: MinecraftJavaDownload
		client_mappings: MinecraftJavaDownload
		server: MinecraftJavaDownload
		server_mappings: MinecraftJavaDownload
	}
	libraries: MinecraftJavaLibrary[]
	assetIndex: {
		id: string
		url: string
		sha1: string
		size: number
		totalSize: number
	}
	releaseTime: string
	javaVersion: {
		component: string
		majorVersion: number
	}
	inheritsFrom?: string
	complianceLevel: number
	minecraftArguments?: string
	minimumLauncherVersion: number
}
export interface JavaAssetIndex {
	objects: {
		[key: string]: {
			hash: string,
			size: number
		}
	}
}

export default abstract class MinecraftJava extends GameComponent {
	public async getDependencies() {
		return this.getManifest().then(manifest => [{
			id: ['java-temurin'],
			versionRange: `>=${manifest.javaVersion.majorVersion}`
		}]);
	}

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
		const { manifestPath } = this;
		if (await exists(manifestPath))
			return readJsonFile<MinecraftJavaManifest>(manifestPath);

		const { data } = await fetch<any>(MANIFESTS_URL).catch(err => {
			console.error(err);
			throw new LaunchError('manifest_download_failed', [this.id, this.version]);
		});

		const version = component.version;
		const manifest = data.versions.find((manifest: any) => manifest.id === version);
		if (!manifest)
			throw new LaunchError('manifest_download_failed', [this.id, this.version]);

		const download = new Download('minecraft_java_manifest', [version], this.instance.manager.voxura.downloader);
		await download.download(manifest.url, manifestPath);

		return readJsonFile<MinecraftJavaManifest>(manifestPath);
	}

	public abstract installGame(): Promise<void>

	public abstract launch(): Promise<void>

	protected parseArguments(args: Argument[], parsedArgs: string[], parser: (arg: string) => string) {
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

	public abstract get jarPath(): string

	public get manifestPath() {
        return this.path + '/manifest.json';
    }
}

export function parseRule(rule: Rule) {
	let result = true;
	const osName = rule.os?.name;
	if (osName)
		result = osName === convertPlatform(PLATFORM);

	const arch = rule.os?.arch;
	if (arch)
		result = arch === ARCH;

	const features = rule.features;
	if (features) {
		if (features.is_demo_user)
			result = false;
		if (features.has_demo_resolution)
			result = false;
	}

	return rule.action === 'allow' ? result : !result;
}

export function convertPlatform(os: string): string {
    switch (os) {
        case 'win32':
            return 'windows';
        case 'darwin':
            return 'osx';
        default:
            return os;
    }
}

export const MANIFESTS_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest.json';
export const MINECRAFT_VERSION_MANIFEST = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';