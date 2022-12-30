import type Mod from './mod';
import type Project from './project';
export default abstract class Platform {
    public static id: string;

	public abstract getMod(id: string): Promise<Mod>
	public abstract getProject(id: string): Promise<Project>

    public abstract search(query: string, options: {
        limit?: number,
        facets?: string[],
        offset?: number,
        loaders?: string[],
        versions?: string[],
        categories?: string[],
        projectType?: string
    }): Promise<{
        hits: Project[],
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
        hits: Mod[],
        limit: number,
        offset: number,
        total_hits: number
    }>

	public get id() {
        return (<typeof Platform>this.constructor).id;
    }

	public abstract get baseProjectURL(): string
};