import joi from '../util/joi';
import type Platform from '../platform';
import Instance, { InstanceType } from '../instance';
export enum ComponentType {
	Game,
	Loader,
	Library
}
export interface ComponentData {

}
export interface ComponentJson {
	id?: string
}
export default abstract class InstanceComponent<T extends ComponentJson = ComponentJson> {
	public static readonly id: string
	public static type: ComponentType
	public static schema = joi.object().keys({
		id: joi.string().required()
	})
	public static instanceTypes: InstanceType[] = []
	public instance: Instance
	protected data: T
	constructor(instance: Instance, data: T) {
		this.instance = instance;
		this.data = data;
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

	public get name(): string | null {
		return null;
	}

	public get icon(): string | null {
		return null;
	}

	public getPlatformId(platform: Platform<any>) {
		return this.id;
	}

	public static validateSchema(data: any) {
		return this.schema.validateAsync(data, {
			stripUnknown: true
		});
	}
}

export type Dependencies = Dependency[]
export interface Dependency {
	id: string[]
	versionRange: string
}