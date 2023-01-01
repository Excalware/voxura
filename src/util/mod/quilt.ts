import Mod, { ModDependency, ModDependencyType } from '.';
export interface QuiltMetadata {
	quilt_loader: {
		id: string
		group: string
		version: string
		depends: (string | {
			id: string
			versions?: string
			optional?: boolean
		})[]
		metadata: {
			name: string
			icon: string
			license: string
			contact: {
				issues: string
				source: string
				homepage: string
			}
			description: string
			contributors: Record<string, string>
		}
		intermediate_mappings: string
	}
    schema_version: number
}
export default class QuiltMod extends Mod {
    public dependencies: ModDependency[] = [{
		id: ['quilt'],
		type: ModDependencyType.Component,
		versionRange: '*'
	}]
    declare public readonly metadata?: QuiltMetadata
    constructor(name: string, filePath: string, md5: string, metadata: string) {
        super(name, filePath, md5);
        try {
            this.metadata = JSON.parse(metadata);
        } catch(err) { console.warn(err); }
    }

    public get id() {
        return this.quilt?.id ?? super.id;
    }

    public get name() {
        return this.meta?.name ?? this.id ?? this.fileName;
    }

    public get description() {
        return this.meta?.description ?? super.description;
    }

    public get version() {
        return this.quilt?.version ?? super.version;
    }

	private get meta() {
		return this.quilt?.metadata;
	}

	private get quilt() {
		return this.metadata?.quilt_loader;
	}
}