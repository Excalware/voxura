import { ComponentType } from '.';
import VersionedComponent from './versioned-component';
export default abstract class MinecraftExtension extends VersionedComponent {
	public static type = ComponentType.Loader

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