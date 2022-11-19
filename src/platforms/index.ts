import type Mod from './mod';
import type Project from './project';
export default abstract class Platform {
    public id: string;
    public constructor(id: string) {
        this.id = id;
    }

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
        hits: Project[],
        limit: number,
        offset: number,
        total_hits: number
    }>
    
    public abstract get displayName(): string
    public abstract get webIcon(): string
};