import { ProjectType } from './project';
export default abstract class Platform<T> {
    public abstract id: string

	public abstract getProject(id: string): Promise<T>

    public abstract search(query: string, type: ProjectType, options: {
        limit?: number
        offset?: number
        loaders?: string[]
        versions?: string[]
        categories?: string[]
    }): Promise<{
        hits: T[]
        limit: number
		total: number
        offset: number
    }>

	public abstract get baseUserURL(): string
	public abstract get baseProjectURL(): string
}