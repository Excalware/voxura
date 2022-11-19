import FabricLoader from './fabric-loader';
export default class QuiltLoader extends FabricLoader {
    public static readonly id: string = 'quilt';
    protected static get apiBase(): string {
        return 'https://meta.quiltmc.org/v3';
    }
};