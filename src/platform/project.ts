import type Platform from '.';
import type Instance from '../instance';
export type ProjectSide = 'optional' | 'required' | 'unsupported'
export enum ProjectType {
	Any,
	Mod,
	Plugin,
	Shader,
	Modpack,
	DataPack,
	ResourcePack
}
export default abstract class Project<T> {
	public id: string
	public type: ProjectType
	public abstract source: Platform<any>
	protected readonly data: T
	public constructor(id: string, type: ProjectType, data: any) {
		this.id = id;
		this.type = type;
		this.data = data;
	}

	public abstract getLatestVersion(instance: Instance): Promise<any>

	public abstract getVersions(): Promise<any[]>

	public abstract get displayName(): string

	public abstract get summary(): string

	public abstract get author(): string

	public abstract get slug(): string

	public abstract get downloads(): number | undefined
	public abstract get followers(): number | undefined

	public abstract get website(): string

	public abstract get webIcon(): string | undefined

	public abstract get categories(): string[]
	public abstract get displayCategories(): string[]

	public abstract get clientSide(): ProjectSide
	public abstract get serverSide(): ProjectSide

	public get isExplict(): boolean {
		return false;
	}
}