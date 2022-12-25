import type Instance from '../instance';
import type Platform from '../platform';
export enum ComponentType {
	Game,
	Loader,
	Library
};
export type ComponentData = {

};
export type ComponentJson = {
	id?: string;
};
export default abstract class InstanceComponent {
	public static readonly id: string
	public static type: ComponentType
	public instance: Instance
	constructor(instance: Instance, data: ComponentJson) {
		this.instance = instance;
	}

	public toJSON(): ComponentJson {
		return {
			id: this.id
		};
	}

	public async getDependencies(): Promise<Dependencies> {
		return Promise.resolve([]);
	}

	public get id() {
		return (<typeof InstanceComponent>this.constructor).id;
	}

	public get type() {
		return (<typeof InstanceComponent>this.constructor).type;
	}

	public get path() {
        return `${this.instance.manager.versionsPath}/${this.id}`;
    }

	public getPlatformId(platform: Platform) {
		return this.id;
	}
};

export type Dependencies = Dependency[]
export interface Dependency {
	id: string[],
	versionRange: string
}