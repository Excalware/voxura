import JSZip from 'jszip';
import { Buffer } from 'buffer';
import { readBinaryFile } from '@tauri-apps/api/fs';

import Mod from './';
export interface FabricMetadata {
    schemaVersion: number,

    id: string,
    name: string,
    description: string,
    version: string,
    authors: { [key: number]: {
        name: string,
        contact: {
            sources: string,
            homepage: string,
            discord_link: string
        }
    } | string },
    environment: 'server' | 'client',
    entrypoints: { [key: string]: any[] },
    
    icon: string,
    contact: {
        homepage: string
    },
    depends: { [key: string]: string },
    custom?: { [key: string]: any }
};
export default class FabricMod extends Mod {
    public icon?: Buffer;
    private metadata?: FabricMetadata;
    constructor(name: string, filePath: string, metadata: string) {
        super(name, filePath);
        try {
            this.metadata = JSON.parse(metadata);
        } catch(err) { console.warn(err); }
    }

    async loadIcon(zip: JSZip) {
        const path = this.metadata?.icon;
        if (path) {
            const data = await zip.file(path)?.async('arraybuffer');
            if (data)
                this.icon = Buffer.from(data);
        }
    }

    public get id() {
        return this.metadata?.id;
    }

    public get name() {
        return this.metadata?.name ?? this.id ?? this.fileName;
    }

    public get version() {
        return this.metadata?.version;
    }

    public get webIcon() {
        return this.icon ? `data:image/png;base64,${this.base64Icon}` : 'img/icons/unknown_mod.svg';
    }

    public get base64Icon() {
        return this.icon?.toString('base64');
    }
};