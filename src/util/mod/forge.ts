import toml from 'toml';

import Mod, { ModDependency, ModDependencyType } from '.';
export interface ForgeMetadata {}
export default class ForgeMod extends Mod {
    public dependencies: ModDependency[] = [{
		id: ['forge'],
		type: ModDependencyType.Component,
		versionRange: '*'
	}]
    constructor(name: string, filePath: string, md5: string, metadata: string) {
        super(name, filePath, md5);
        try {
            this.metadata = toml.parse(metadata);
        } catch(err) { console.warn(err); }
    }

    public get id() {
        return this.modData?.modId;
    }

    public get name() {
        return this.modData?.displayName ?? this.id ?? this.fileName;
    }

    public get version() {
        return this.modData?.version;
    }

    private get modData() {
        return this.metadata?.mods?.[0];
    }
}