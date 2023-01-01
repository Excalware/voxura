import type { Mod } from './mod';
export default abstract class Platform<T> {
    public static id: string;

	public abstract getMod(id: string): Promise<T & Mod>
	public abstract getProject(id: string): Promise<T>

    public abstract search(query: string, options: {
        limit?: number,
        facets?: string[],
        offset?: number,
        loaders?: string[],
        versions?: string[],
        categories?: string[],
        projectType?: string
    }): Promise<{
        hits: T[],
        limit: number,
        offset: number,
        total_hits: number
    }>
    public abstract searchMods(query: string, options: {
        limit?: number,
        facets?: string[],
        offset?: number,
        loaders?: string[],
        versions?: string[],
        categories?: string[],
        projectType?: string
    }): Promise<{
        hits: (T & Mod)[],
        limit: number,
        offset: number,
        total_hits: number
    }>

	public get id() {
        return (<typeof Platform>this.constructor).id;
    }

	public abstract get baseUserURL(): string
	public abstract get baseProjectURL(): string
};