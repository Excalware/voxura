import { fetch } from '@tauri-apps/api/http';

import { Download } from '../downloader';
import type Platform from '../platform';
import { InstanceType } from '../instance';
import { ComponentType } from '.';
import MinecraftClientExtension from './minecraft-client-extension';
import { fileExists, readJsonFile } from '../util';
import type { MinecraftJavaManifest } from './minecraft-java';

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
export default class FabricLoader extends MinecraftClientExtension {
	public static readonly id: string = 'fabric'
	public static type = ComponentType.Loader
	public static instanceTypes = [InstanceType.Client]

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
		await download.download(`${this.apiBase}/versions/loader/${encodeURIComponent(component.version)}/${encodeURIComponent(this.version)}/profile/json`, manifestPath).await();

		return readJsonFile<MinecraftJavaManifest>(manifestPath);
	}

	public getPlatformId(platform: Platform<any>) {
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
}