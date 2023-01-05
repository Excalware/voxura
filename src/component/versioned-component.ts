import type Instance from '../instance';
import type { ComponentVersions } from '../types';
import Component, { ComponentData, ComponentJson } from '.';
export interface VersionedComponentData extends ComponentData {
	version: string
}
export interface VersionedComponentJson extends ComponentJson {
	version: string
}
export default abstract class VersionedComponent extends Component<VersionedComponentJson> {
	public version: string = '1.0.0'
	public constructor(instance: Instance, data: VersionedComponentJson) {
		super(instance, data);
		this.version = data.version;
	}

	public static getVersions(...args: any[]): Promise<ComponentVersions> {
		throw new Error(`${this.id} does not implement getVersions`)
	}
	public get getVersions() {
		return (<typeof VersionedComponent>this.constructor).getVersions;
	}

	public toJSON(): VersionedComponentJson {
		return {
			version: this.version,
			...super.toJSON()
		};
	}

	public get path() {
		return super.path + '-' + this.version;
	}
};