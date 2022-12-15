import Mod from './';
export interface FabricMetadata {
    schemaVersion: number,

    id: string,
    name: string,
    description: string,
    version: string,
    authors: ({
        name: string,
        contact: {
            sources: string,
            homepage: string,
            discord_link: string
        }
    } | string)[],
    environment: 'server' | 'client',
    entrypoints: Record<string, any[]>,
    
    icon: string,
    contact: {
        homepage: string
    },
    depends: Record<string, string>,
    custom?: Record<string, any>
};
export default class FabricMod extends Mod {
    public loader: string = 'fabric';
    declare public readonly metadata?: FabricMetadata;
    constructor(name: string, filePath: string, md5: string, metadata: string) {
        super(name, filePath, md5);
        try {
            this.metadata = JSON.parse(metadata);
        } catch(err) { console.warn(err); }
    }

    public get id() {
        return this.metadata?.id ?? super.id;
    }

    public get name() {
        return this.metadata?.name ?? this.id ?? this.fileName;
    }

    public get description() {
        return this.metadata?.description ?? super.description;
    }

    public get version() {
        return this.metadata?.version ?? super.version;
    }
};