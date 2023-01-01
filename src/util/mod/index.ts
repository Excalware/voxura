import type Platform from '../../platform';
import type { Buffer } from 'buffer';
export default abstract class Mod {
	public md5: string
    public path: string
	public icon?: Buffer
	public source?: Platform
    public fileName: string
    public metadata?: any
    public abstract dependencies: ModDependency[]

    constructor(name: string, filePath: string, md5: string) {
        this.fileName = name;
        this.path = filePath;
		this.md5 = md5;
    }

    public get id() {
        return this.fileName;
    }

    public get name() {
        return this.id;
    }

    public get description() {
        return '';
    }

    public get version() {
        return '0.0.0';
    }

    public get webIcon() {
        return this.icon ? `data:image/png;base64,${this.base64Icon}` : null;
    }

    public get base64Icon() {
        return this.icon?.toString('base64');
    }
}

export interface ModDependency {
	id: string[]
	type: ModDependencyType
	versionRange: string
}
export enum ModDependencyType {
	Component
}