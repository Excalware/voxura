import type Instance from '../instance';
import type { Voxura } from '../../voxura';
import { LoaderType, LoaderSetupType } from '../../types';
export default abstract class Loader {
    public static id: string;
    public abstract type: LoaderType;
    public abstract vanillaLoader: typeof Loader;
    public static setupType: LoaderSetupType = LoaderSetupType.Unknown;
    protected voxura: Voxura;
    protected instance: Instance;
    public constructor(instance: Instance) {
        this.voxura = instance.manager.voxura;
        this.instance = instance;
    }

    public abstract launch(): Promise<void>

    public static async setupInstance(instance: Instance, options: any[]): Promise<void> {
        throw new Error(`${this.id} does not implement setupInstance`);
    }

    public static async getVersions() {
        throw new Error(`${this.id} does not implement getVersions`);
    }

    protected get id() {
        return (<typeof Loader>this.constructor).id;
    }
};