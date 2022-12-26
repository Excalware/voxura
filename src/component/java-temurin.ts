import { fetch } from '@tauri-apps/api/http';
import { exists } from '@tauri-apps/api/fs';

import { Download } from '../downloader';
import JavaComponent from './java-component';
import { ComponentType } from '.';
import { ARCH, PLATFORM } from '../util/constants';

const JAVA_BINARY = PLATFORM === 'win32' ? 'javaw.exe' : 'java';
const systemName = {
    win32: 'windows'
}[PLATFORM as string] ?? PLATFORM;
const systemArch = {
    x86: 'x32',
    x86_64: 'x64'
}[ARCH as string] ?? ARCH;
export default class JavaTemurin extends JavaComponent {
	public static id: string = 'java-temurin'
	public static type = ComponentType.Library

	public async getBinaryPath() {
		const path = `${this.path}/jdk-${this.version}/bin/${JAVA_BINARY}`;
		if (!await exists(path))
			await this.downloadBinary();

		return path;
	}

	private async downloadBinary() {
		const { data } = await fetch<AdoptiumReleaseResponse>(`${this.apiBase}/assets/release_name/eclipse/jdk-${this.version}?os=${systemName}&image_type=jdk&architecture=${systemArch}`);
		
		const { downloader } = this.instance.voxura;
		const download = new Download('temurin', [this.version], downloader);

		const { name, link } = data.binaries[0].package;
		const filePath = `${downloader.path}/${name}`;
		if (!await exists(filePath))
			await download.download(link, filePath);

		return download.extract(this.path, filePath);
	}

	public static async getVersions() {
		const versions = [];
		for (const [key, version] of await fetch<AdoptiumReleasesResponse>(`${this.apiBase}/info/available_releases`).then(r => Object.entries(r.data.available_lts_releases.sort((a, b) => b - a))))
			versions.push(await fetch<AdoptiumVersionsResponse>(`${this.apiBase}/assets/latest/${version}/hotspot`, {
				query: {
					os: 'windows',
					vendor: 'eclipse',
					image_type: 'jdk',
					architecture: 'x64'
				},
				method: 'GET'
			}).then(({ data }) => data.map(version => ({
				id: version.version.semver,
				category: parseInt(key)
			}))));

		return versions;
	}

	public static getLatestVersion(major: number) {
		return fetch<AdoptiumVersionsResponse>(`${this.apiBase}/assets/latest/${major}/hotspot`, {
			query: {
				os: 'windows',
				vendor: 'eclipse',
				image_type: 'jdk',
				architecture: 'x64'
			},
			method: 'GET'
		}).then(r => r.data[0].version.semver);
	}

	protected get apiBase(): string {
		return (<typeof JavaTemurin>this.constructor).apiBase;
	}
	protected static get apiBase(): string {
		return 'https://api.adoptium.net/v3';
	}
};

export type AdoptiumVersionsResponse = AdoptiumVersion[]
export interface AdoptiumVersion {
	vendor: 'eclipse'
	binary: AdoptiumBinary
	version: {
		build: number
		major: number
		minor: number
		semver: string
		security: number
		openjdk_version: string
	}
	release_name: string
	release_link: string
}

export interface AdoptiumBinary {
	os: string
	project: 'jdk'
	scm_ref: string
	package: AdoptiumPackage
	jvm_impl: 'hotspot'
	heap_size: 'normal'
	installer: AdoptiumPackage
	updated_at: string
	image_type: 'jdk' | 'testimage' | 'debugimage'
	architecture: string
	download_count: number
}

export interface AdoptiumPackage {
	name: string
	size: number
	link: string
	checksum: string
	checksum_link: string
	metadata_link: string
	signature_link: string
	download_count: number
}

export interface AdoptiumReleasesResponse {
	tip_version: number
	most_recent_lts: number
	available_releases: number[]
	available_lts_releases: number[]
	most_recent_feature_release: number
	most_recent_feature_version: number
}

export interface AdoptiumReleaseResponse {
	id: string
	vendor: 'eclipse'
	source: {
		name: string
		link: string
		size: number
	}
	binaries: AdoptiumBinary[]
	timestamp: string
	updated_at: string
	release_name: string
	release_type: string
	release_link: string
	download_count: number
}