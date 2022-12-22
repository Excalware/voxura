import UnknownGame from '../../component/unknown-game';
import type Instance from '..';
import GameComponent from '../../component/game-component';
import { writeJsonFile } from '../../util';
import Component, { ComponentType } from '../../component';
export default abstract class InstanceStore {
    public instance: Instance;
    public components: Component[] = [];
    public abstract type: InstanceStoreType;
    public readonly data: InstanceStoreData = {
        storeType: InstanceStoreType.Default
    };
    constructor(instance: Instance, data?: InstanceStoreData | void) {
        this.instance = instance;
        if (data)
            this.data = data;
    }

    public save() {
        return writeJsonFile(this.instance.storePath, this.data);
    }

    public get id() {
        return this.data.id;
    }

	public abstract get category(): string;
    public abstract set category(value: string);
    public abstract get memoryAllocation(): number;
    public abstract set memoryAllocation(value: number);
    public abstract get gameResolution(): [number, number];
    public abstract get dateCreated(): number;
    public abstract get dateUpdated(): number;
    public abstract get dateLaunched(): number | undefined;
    public abstract set dateLaunched(value: number | undefined);

    public get gameComponent() {
        const component = this.components.find(c => c.type === ComponentType.Game);
        if (!(component instanceof GameComponent))
            return new UnknownGame(this.instance, {
                version: '0.0.0'
            });
        return component;
    }
};

export enum InstanceStoreType {
    Default,
    mdpkm
};
export interface InstanceStoreData {
    id?: string
    storeType: InstanceStoreType
};