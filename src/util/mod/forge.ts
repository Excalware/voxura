import toml from 'toml';
import { Buffer } from 'buffer';

import Mod from './';
export interface ForgeMetadata {
    
};
export default class ForgeMod extends Mod {
    public icon?: Buffer;
    public loader: string = 'forge';
    private metadata?: any;
    constructor(name: string, filePath: string, metadata: string) {
        super(name, filePath);
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

    public get webIcon() {
        return this.icon ? `data:image/png;base64,${this.base64Icon}` : 'img/icons/unknown_mod.svg';
    }

    public get base64Icon() {
        return this.icon?.toString('base64');
    }

    private get modData() {
        return this.metadata?.['[mods]'];
    }
};