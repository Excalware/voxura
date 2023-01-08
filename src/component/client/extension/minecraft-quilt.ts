import FabricLoader from './minecraft-fabric';
import type Platform from '../../../platform';
export default class QuiltLoader extends FabricLoader {
	public static readonly id: string = 'quilt'

	public getPlatformId(platform: Platform<any>) {
		if (platform.id === 'curseforge')
			return 'Quilt';
		return this.id;
	}

	protected static get apiBase(): string {
		return 'https://meta.quiltmc.org/v3';
	}
}