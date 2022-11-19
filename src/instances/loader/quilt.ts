import Fabric from './fabric';
export default class QuiltLoader extends Fabric {
    public static id = 'quilt';
    protected get apiBase(): string {
        return 'https://meta.quiltmc.org/v3';
    }
};