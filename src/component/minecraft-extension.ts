import { mapLibraries } from '../util';
import { ComponentType } from '.';
import VersionedComponent from './versioned-component';
import type { MinecraftJavaManifest } from './minecraft-java';
export default abstract class MinecraftExtension extends VersionedComponent {
	public static type = ComponentType.Loader

	public abstract getManifest(): Promise<MinecraftJavaManifest>
	public async getLibraries() {
		const manifest = await this.getManifest();
		return mapLibraries(manifest.libraries, this.instance.manager.librariesPath);
	}

	public getJvmArguments() {
		return Promise.resolve([]);
	}

	public getGameArguments() {
		return Promise.resolve([]);
	}

	public get manifestPath() {
		return this.path + '/manifest.json';
	}
};