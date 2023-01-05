import { ComponentType } from '.';
import type { Argument } from './minecraft-java';
import VersionedComponent from './versioned-component';
export default abstract class MinecraftExtension extends VersionedComponent {
	public static type = ComponentType.Loader

	public getJvmArguments(): Promise<Argument[]> {
		return Promise.resolve([]);
	}

	public getGameArguments(): Promise<Argument[]> {
		return Promise.resolve([]);
	}

	public get manifestPath() {
		return this.path + '/manifest.json';
	}
};