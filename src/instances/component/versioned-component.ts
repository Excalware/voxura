import type Instance from '../instance';
import type { ComponentVersions } from '../../types';
import Component, { ComponentData, ComponentJson } from '.';
export type VersionedComponentData = ComponentData & {
    version: string;
};
export type VersionedComponentJson = ComponentJson & {
    version: string;
};
export default abstract class VersionedComponent extends Component {
    public version: string = '1.0.0'
    public constructor(instance: Instance, data: VersionedComponentJson) {
        super(instance, data);
        this.version = data.version;
    };

    public static getVersions(): Promise<ComponentVersions> {
        throw new Error(`${this.id} does not implement getVersions`)
    };
    public get getVersions() {
        return (<typeof VersionedComponent>this.constructor).getVersions;
    };

    public toJSON(): VersionedComponentJson {
        return {
            version: this.version,
            ...super.toJSON()
        };
    };
};