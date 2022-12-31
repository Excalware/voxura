import { t } from 'i18next';

import type Instance from '..';
import { getComponent } from '../../voxura';
import { ComponentJson } from '../../component';
import Store, { InstanceStoreType, InstanceStoreData } from '.';
export interface DefaultInstanceStoreData extends InstanceStoreData {
    dates: [number, number, number?]
	category: string
    components: ComponentJson[]
	totalPlayTime: number
    gameResolution: [number, number]
    memoryAllocation: number
}
export default class DefaultInstanceStore extends Store {
    public type = InstanceStoreType.Default;
    public readonly data: DefaultInstanceStoreData = {
        dates: [Date.now(), Date.now()],
		category: t('mdpkm:instance_category.default'),
        storeType: InstanceStoreType.Default,
        components: [],
		totalPlayTime: 0,
        gameResolution: [800, 600],
        memoryAllocation: 2
    };
    constructor(instance: Instance, data?: DefaultInstanceStoreData | void) {
        super(instance, data);
        if (data)
            this.data = data;

        for (const data of this.data.components) {
            if (data.id) {
                const component = getComponent(data.id) as any;
                if (component)
                    this.components.push(new component(instance, data));
            }
        }
    }

    public save() {
        this.data.components = this.components.map(c => c.toJSON());
        return super.save();
    }

	public get category() {
        return this.data.category ?? t('mdpkm:instance_category.default');
    }
    public set category(value: string) {
        this.data.category = value;
    }

    public get memoryAllocation() {
        return this.data.memoryAllocation ?? 2;
    }
    public set memoryAllocation(value: number) {
        this.data.memoryAllocation = value;
    }

    public get gameResolution() {
        return this.data.gameResolution;
    }

    public get dateCreated() {
        return this.dates[0] ?? Date.now();
    }
    public get dateUpdated() {
        return this.dates[1] ?? Date.now();
    }

    public get dateLaunched() {
        return this.dates[2];
    }
    public set dateLaunched(value: number | undefined) {
        this.dates[2] = value;
    }

	public get playTime() {
        return this.data.totalPlayTime;
    }
    public set playTime(value: number) {
        this.data.totalPlayTime = value;
    }

    private get dates() {
        return this.data.dates;
    }
};