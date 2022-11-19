import type Instance from '../instance';
export enum ComponentType {
    Game,
    Loader
};
export type ComponentData = {
    
};
export type ComponentJson = {
    id?: string;
};
export default abstract class InstanceComponent {
    public static readonly id: string;
    public static type: ComponentType;
    public instance: Instance;
    constructor(instance: Instance, data: ComponentJson) {
        this.instance = instance;
    }

    public toJSON(): ComponentJson {
        return {
            id: this.id
        };
    }

    public get id() {
        return (<typeof InstanceComponent>this.constructor).id;
    }

    public get type() {
        return (<typeof InstanceComponent>this.constructor).type;
    }
};