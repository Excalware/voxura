import Platform from '.';
export default abstract class Project {
    public id: string;
    public source: Platform;
    protected readonly data: any;
    public constructor(id: string, data: any, source: Platform) {
        this.id = id;
        this.data = data;
        this.source = source;
    }

	public abstract getVersions(): Promise<any[]>

    public get displayName(): string {
        return this.data.title ?? this.data.name ?? this.slug;
    }

    public get summary(): string {
        return this.data.synopsis ?? this.data.description ?? this.data.summary;
    }

    public get author(): string {
        return this.data.author ?? this.data.authors?.[0]?.name;
    }

    public get slug(): string {
        return this.data.slug;
    }

    public get downloads(): number {
        return this.data.downloads ?? this.data.downloadCount ?? this.data.installs;
    }

    public get website(): string {
        return this.data.website_url;
    }

    public get webIcon(): string {
        return this.data.icon_url ?? this.data.logo?.url ?? this.data.art?.find((a: any) => a.type === 'square')?.url;
    }

    public get isExplict(): boolean {
        return false;
    }
};