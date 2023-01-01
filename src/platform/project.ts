import Platform from '.';
import type Instance from '../instance';
export enum ProjectSide {
    Client,
    Server,
    Universal,
    Unknown
}
export default abstract class Project<T, P extends Platform<unknown>> {
    public id: string;
    public source: P;
    protected readonly data: T;
    public constructor(id: string, data: any, source: P) {
        this.id = id;
        this.data = data;
        this.source = source;
    }

	public abstract getSide(): ProjectSide
	public abstract getLatestVersion(instance: Instance): Promise<void>

	public abstract getVersions(): Promise<any[]>

    public abstract get displayName(): string

    public abstract get summary(): string

    public abstract get author(): string

    public abstract get slug(): string

    public abstract get downloads(): number | undefined

    public abstract get website(): string

    public abstract get webIcon(): string | undefined

    public get isExplict(): boolean {
        return false;
    }
};