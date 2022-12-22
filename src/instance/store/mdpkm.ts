import { t } from 'i18next';

import Instance from '..';
import MinecraftJava from '../../component/minecraft-java';
import { getComponent } from '../../voxura';
import { ComponentType } from '../../component';
import VersionedComponent from '../../component/versioned-component';
import Store, { InstanceStoreType, InstanceStoreData } from '.';
export interface mdpkmConfigData extends InstanceStoreData {
    ram: number
    loader: {
        game: string
        type: string
        version?: string
    }
	category: string
    resolution: [number, number]
    dateCreated: number
    dateUpdated: number
    dateLaunched?: number
    modifications: string[][]
};
export default class mdpkmInstanceConfig extends Store {
    public type = InstanceStoreType.mdpkm;
    public readonly data: mdpkmConfigData = {
        ram: 2,
        loader: {
            game: '1.0.0',
            type: 'minecraft-java-vanilla'
        },
		category: t('mdpkm:instance_category.default'),
        storeType: InstanceStoreType.mdpkm,
        resolution: [900, 500],
        dateCreated: Date.now(),
        dateUpdated: Date.now(),
        modifications: []
    };
    constructor(instance: Instance, data?: mdpkmConfigData | void) {
        super(instance, data);
        if (data)
            this.data = data;

        this.components = [
            new MinecraftJava(instance, {
                version: this.data.loader.game
            })
        ];

        if (this.data.loader.version) {
            const loader = getComponent(this.data.loader.type);
            if (loader?.type === ComponentType.Loader)
                this.components.push(new loader(instance, {
                    version: this.data.loader.version
                }));
        }
    }

    public save() {
        this.data.loader.game = this.gameComponent.version;

        const loader = this.components[1];
        if (loader instanceof VersionedComponent)
            this.data.loader.type = loader.id, this.data.loader.version = loader.version;
        return super.save();
    }

	public get category() {
        return this.data.category ?? t('mdpkm:instance_category.default');
    }
    public set category(value: string) {
        this.data.category = value;
    }
    public get memoryAllocation() {
        return this.data.ram ?? 2;
    }
    public set memoryAllocation(value: number) {
        this.data.ram = value;
    }

    public get gameResolution() {
        return this.data.resolution;
    }

    public get dateCreated() {
        return this.data.dateCreated;
    }
    public get dateUpdated() {
        return this.data.dateUpdated;
    }

    public get dateLaunched() {
        return this.data.dateLaunched ?? 0;
    }
    public set dateLaunched(value: number) {
        this.data.dateLaunched = value;
    }
};