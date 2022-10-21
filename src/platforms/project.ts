import Platform from '.';
export default abstract class Project<T> {
    public id: string;
    public source: Platform;
    protected data: any;
    public constructor(id: string, data: any, source: Platform) {
        this.id = id;
        this.data = data;
        this.source = source;
    }

    get displayName(): string {
        return this.data.title ?? this.data.name ?? this.slug;
    }

    get summary(): string {
        return this.data.synopsis ?? this.data.description ?? this.data.summary;
    }

    get author(): string {
        return this.data.author ?? this.data.authors?.[0]?.name;
    }

    get slug(): string {
        return this.data.slug;
    }

    get downloads(): number {
        return this.data.downloads ?? this.data.downloadCount ?? this.data.installs;
    }

    get website(): string {
        return this.data.website_url;
    }

    get webIcon(): string {
        return this.data.icon_url ?? this.data.logo?.url ?? this.data.art?.find(a => a.type === 'square')?.url;
    }
};