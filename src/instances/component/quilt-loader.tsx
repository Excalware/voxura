import FabricLoader from './fabric-loader';
import type Platform from '../../platforms';
export default class QuiltLoader extends FabricLoader {
    public static readonly id: string = 'quilt';

	public getPlatformId(platform: Platform) {
		if (platform.id === 'curseforge')
			return 'Quilt';
		return this.id;
	}

    protected static get apiBase(): string {
        return 'https://meta.quiltmc.org/v3';
    }
};