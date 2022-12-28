import { ComponentType } from '.';
import VersionedComponent from './versioned-component';
import type { MinecraftJavaManifest } from './minecraft-java';
export default abstract class MinecraftExtension extends VersionedComponent {
	public static type = ComponentType.Loader

	public abstract getManifest(): Promise<MinecraftJavaManifest>
	public getLibraries() {
		return this.getManifest().then(m => m.libraries);
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