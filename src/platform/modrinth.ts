import { fetch, ResponseType } from '@tauri-apps/api/http';

import Platform from '.';
import Instance from '../instance';
import GameComponent from '../component/game-component';
import Project, { ProjectType } from './project';
const Modrinth = new class Modrinth extends Platform<ModrinthProject> {
	public id = 'modrinth';
	public async search(query: string, type: ProjectType, options: {
        limit?: number
        offset?: number
        loaders?: string[]
        versions?: string[]
        categories?: string[]
    } = {}): Promise<{
        hits: ModrinthProject[]
        limit: number
		total: number
        offset: number
    }> {
        const {
            limit = 20,
            offset = 0,
            loaders,
            versions,
            categories
        } = options;
        const { ok, data, status } = await fetch<SearchResponse>(`${API_BASE}/search`, {
            query: {
                query,
                limit: limit.toString(),
                offset: offset.toString(),
                facets: JSON.stringify([
					loaders?.filter(v => v).map(cat => `categories:${cat}`),
					versions?.filter(v => v).map(ver => `versions:${ver}`),
					categories?.filter(v => v).map(cat => `categories:${cat}`),
					type !== ProjectType.Any ? [`project_type:${this.getProjectType2(type)}`] : undefined
				].filter(v => v))
            },
            method: 'GET',
            responseType: ResponseType.JSON
        });
		if (!ok) {
			console.error(status, data);
			throw new Error();
		}
		return {
			hits: data.hits.map(hit =>
				new ModrinthProject(hit.project_id, this.getProjectType(hit.project_type), hit)
			),
			limit: data.limit,
			total: data.total_hits,
			offset: data.offset
		}
    }

    public async getProject(id: string): Promise<ModrinthProject> {
		const data = await this.getProjectData(id);
        return new ModrinthProject(id, this.getProjectType(data.project_type), data);
    }

    private getProjectData(id: string): Promise<ProjectData> {
        return fetch<ProjectData>(`${API_BASE}/project/${id}`).then(r => r.data);
    }

	public get baseUserURL() {
		return USER_BASE;
	}
	public get baseProjectURL() {
		return PROJECT_BASE;
	}

	private getProjectType(type: string): ProjectType {
		const type2 = Object.keys(PROJECT_TYPES).find(key => PROJECT_TYPES[key] === type);
		if (!type2)
			throw new Error(`unknown type: ${type}`);
		return parseInt(type2);
	}

	private getProjectType2(type: ProjectType) {
		return PROJECT_TYPES[type];
	}
}
export default Modrinth

export const PROJECT_TYPES: Record<string, string> = {
	[ProjectType.Any]: '',
	[ProjectType.Mod]: 'mod',
	[ProjectType.Plugin]: 'plugin',
	[ProjectType.Shader]: 'shader',
	[ProjectType.Modpack]: 'modpack',
	[ProjectType.DataPack]: 'datapack',
	[ProjectType.ResourcePack]: 'resourcepack'
}

export interface ProjectData {
	id: string
	slug: string
	body: string
	team: string
	title: string
	updated: string
	approved: string
	icon_url?: string
	wiki_url?: string
	downloads: number
	followers: number
	published: string
    project_id: string
	categories: string[]
	source_url?: string
	issues_url?: string
	description: string
	client_side: ModrinthProjectSide
	server_side: ModrinthProjectSide
	discord_url?: string
	project_type: ModrinthProjectType
	additional_categories?: string[]
}
export interface SearchResult {
	slug: string
	title: string
	author: string
	follows: number
	license: string
	gallery?: string[]
	versions: string[]
	icon_url?: string
	downloads: number
	project_id: string
	categories: string[]
	description: string
	client_side: ModrinthProjectSide
	server_side: ModrinthProjectSide
	date_created: string
	project_type: ModrinthProjectType
	date_modified: string
	latest_version?: string
	display_categories: string[]
}
export interface SearchResponse {
	hits: SearchResult[]
	limit: number
	offset: number
	total_hits: number
}

export type ModrinthProjectType = 'mod' | 'modpack' | 'resourcepack'
export type ModrinthProjectSide = 'optional' | 'required' | 'unsupported'
export class ModrinthProject extends Project<SearchResult> {
	public source = Modrinth;
	public async getLatestVersion(instance: Instance) {
        const versions = await this.getVersions();
		const { components } = instance.store;
        return versions.find(({ loaders, game_versions }) =>
            loaders.some((l: any) => components.some(c => c.getPlatformId(this.source) === l)) && game_versions.some((v: any) => components.some(c => c instanceof GameComponent && c.version === v))
        );
    }

	public getVersions(): Promise<any[]> {
        return fetch<any[]>(`${API_BASE}/project/${this.id}/version`).then(d => d.data);
    }

	public get displayName(): string {
        return this.data.title;
    }

    public get summary(): string {
        return this.data.description;
    }

    public get author(): string {
        return this.data.author;
    }

    public get slug(): string {
        return this.data.slug;
    }

    public get downloads(): number {
        return this.data.downloads;
    }
	public get followers(): number {
        return this.data.follows;
    }

    public get website(): string {
        return PROJECT_BASE + this.id;
    }

    public get webIcon(): string | undefined {
        return this.data.icon_url;
    }

	public get categories() {
		return this.data.categories;
	}
	public get displayCategories() {
		return this.data.display_categories;
	}

	public get clientSide() {
		return this.data.client_side;
	}
	public get serverSide() {
		return this.data.server_side;
	}
}

export const API_BASE = 'https://api.modrinth.com/v2';
export const USER_BASE = 'https://modrinth.com/user/';
export const PROJECT_BASE = 'https://modrinth.com/project/'; 