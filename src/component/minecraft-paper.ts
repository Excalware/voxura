import { fetch } from '@tauri-apps/api/http';
import { exists } from '@tauri-apps/api/fs';

import { Download } from '../downloader';
import { readJsonFile } from '../util';
import MinecraftServerExtension from './minecraft-server-extension';
export default class MinecraftPaper extends MinecraftServerExtension {
	public static readonly id: string = 'minecraft-java-server-paper'

	public static getVersions(version: string) {
		return fetch<PaperVersionsResponse>(`${this.apiBase}/projects/${this.projectName}/versions/${version}/builds`).then(({ data }) =>
			[data.builds.reverse().map(build => ({
				id: `${version}-${build.build}`,
				category: 0
			}))]
		);
	}

	public async getManifest() {
		const manifestPath = this.manifestPath;
		if (await exists(manifestPath))
			return readJsonFile<PaperBuild>(manifestPath);

		const split = this.version2;
		const download = new Download('component_manifest', [this.id, this.version], this.instance.voxura.downloader);
		await download.download(`${this.apiBase}/projects/${this.projectName}/versions/${split[0]}/builds/${split[1]}`, manifestPath);

		return readJsonFile<PaperBuild>(manifestPath);
	}

	public async preLaunch() {
		if (!await exists(this.jarPath))
			await this.install();
	}

	private async install() {
		const split = this.version2;
		const manifest = await this.getManifest();
		const download = new Download('paper', [this.id, this.version], this.instance.voxura.downloader);
		await download.download(`${this.apiBase}/projects/${this.projectName}/versions/${split[0]}/builds/${split[1]}/downloads/${manifest.downloads.application.name}`, this.jarPath);
	}

	public get jarPath() {
		return this.path + '/server.jar';
	}

	protected get version2() {
		return this.version.split('-');
	}

	protected get apiBase(): string {
		return (<typeof MinecraftPaper>this.constructor).apiBase;
	}
	protected static get apiBase() {
		return 'https://api.papermc.io/v2';
	}

	protected get projectName(): string {
		return (<typeof MinecraftPaper>this.constructor).projectName;
	}
	protected static get projectName() {
		return 'paper';
	}
}

export interface PaperVersionsResponse {
	builds: PaperBuild[]
	version: string
	project_id: string
	project_name: string
}
export interface PaperBuild {
	time: string
	build: number
	channel: 'default' | 'experimental'
	changes: {
		commit: string
		summary: string
		message: string
	}[]
	promoted: boolean
	downloads: {
		application: VersionDownload
		'mojang-mappings': VersionDownload
	}
}
export interface VersionDownload {
	name: string
	sha256: string
}