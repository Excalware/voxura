import { fetch } from '@tauri-apps/api/http';

import type Platform from '../../platforms';
import { ComponentType } from '.';
import MinecraftExtension from './minecraft-extension';
import { fileExists, readJsonFile } from '../../util';
import type { MinecraftJavaManifest } from './minecraft-java';
import { Download } from '../../downloader';

export type FabricVersionsResponse = {
	game: {}[],
	loader: {
		build: number,
		maven: string,
		stable: boolean,
		version: string,
		separator: string
	}[],
	mapping: {}[]
};
export default class FabricLoader extends MinecraftExtension {
	public static readonly id: string = 'fabric';
	public static type = ComponentType.Loader;

	public static async getVersions() {
		return fetch<FabricVersionsResponse>(`${this.apiBase}/versions`).then(({ data }) =>
			[data.loader.map(version => ({
				id: version.version,
				category: 0,
				dateCreated: new Date()
			}))]
		);
	}

	public async getManifest(): Promise<MinecraftJavaManifest> {
		const component = this.instance.gameComponent;

		const manifestPath = this.manifestPath;
		if (await fileExists(manifestPath))
			return readJsonFile<MinecraftJavaManifest>(manifestPath);

		const download = new Download('component_manifest', [this.id, this.version], this.instance.manager.voxura.downloader);
		await download.download(`${this.apiBase}/versions/loader/${encodeURIComponent(component.version)}/${encodeURIComponent(this.version)}/profile/json`, manifestPath);

		return readJsonFile<MinecraftJavaManifest>(manifestPath);
	}

	public getPlatformId(platform: Platform) {
		if (platform.id === 'curseforge')
			return 'Fabric';
		return this.id;
	}

	protected get apiBase(): string {
		return (<typeof FabricLoader>this.constructor).apiBase;
	}
	protected static get apiBase(): string {
		return 'https://meta.fabricmc.net/v2';
	}
};