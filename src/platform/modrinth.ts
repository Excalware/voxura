import { fetch, ResponseType } from '@tauri-apps/api/http';

import { Mod } from './mod';
import Platform from '.';
import Instance from '../instance';
import GameComponent from '../component/game-component';
import Project, { ProjectSide } from './project';
export default class Modrinth extends Platform<ModrinthProject> {
	public static id = 'modrinth';
	public search(query: string, options: {
        limit?: number,
        facets?: string[],
        offset?: number,
        loaders?: string[],
        versions?: string[],
        categories?: string[],
        projectType?: string
    } = {}): Promise<{
        hits: ModrinthProject[],
        limit: number,
        offset: number,
        total_hits: number
    }> {
        return this.searchRaw(query, options).then(data => ({
            ...data,
            hits: data.hits.map(h => new ModrinthProject(h.project_id, h, this))
        }));
    }

    public searchMods(query: string, options: {
        limit?: number,
        facets?: string[],
        offset?: number,
        loaders?: string[],
        versions?: string[],
        categories?: string[],
        projectType?: string
    } = {}): Promise<{
        hits: ModrinthMod[],
        limit: number,
        offset: number,
        total_hits: number
    }> {
        return this.searchRaw(query, options).then(data => ({
            ...data,
            hits: data.hits.map(h => new ModrinthMod(h.project_id, h, this))
        }));
    }

    private searchRaw(query: string, options: {
        limit?: number,
        facets?: string[],
        offset?: number,
        loaders?: string[],
        versions?: string[],
        categories?: string[],
        projectType?: string
    } = {}): Promise<{
        hits: ProjectData[],
        limit: number,
        offset: number,
        total_hits: number
    }> {
        const {
            limit = 20,
            facets,
            offset = 0,
            loaders,
            versions,
            categories,
            projectType
        } = options;
        return fetch<any>(`${API_BASE}/search`, {
            query: {
                query,
                limit: limit.toString(),
                offset: offset.toString(),
                facets: facets ? JSON.stringify([
                    ...facets,
                    categories?.filter(v => v).map(cat => `categories:${cat}`),
                    loaders?.filter(v => v).map(cat => `categories:${cat}`),
                    versions?.filter(v => v).map(ver => `versions:${ver}`),
                    ...[projectType && [`project_type:${projectType}`]]
                ].filter(v => v)) : undefined
            },
            method: 'GET',
            responseType: ResponseType.JSON
        }).then(d => d.data);
    }

    public async getProject(id: string): Promise<ModrinthProject> {
        return new ModrinthProject(id, await this.getProjectData(id), this);
    }

    private getProjectData(id: string): Promise<ProjectData> {
        return fetch<ProjectData>(`${API_BASE}/project/${id}`).then(r => r.data);
    }

    public async getMod(id: string): Promise<ModrinthMod> {
        return new ModrinthMod(id, await this.getProjectData(id), this);
    }

	public get baseUserURL() {
		return USER_BASE;
	}
	public get baseProjectURL() {
		return PROJECT_BASE;
	}
};

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
	description: string
	categories?: string[]
	client_side: ModrinthProjectSide
	server_side: ModrinthProjectSide
	date_created: string
	project_type: ModrinthProjectType
	date_modified: string
	latest_version?: string
	display_categories?: string[]
}
export type ModrinthProjectType = 'mod' | 'modpack' | 'resourcepack'
export type ModrinthProjectSide = 'optional' | 'required' | 'unsupported'
export class ModrinthProject extends Project<SearchResult, Modrinth> {
	public getSide(): ProjectSide {
        const client = this.data.client_side, server = this.data.server_side;
        if(!client)
            return ProjectSide.Unknown;
        if(client !== 'unsupported' && server !== 'unsupported')
            return ProjectSide.Universal;
        if(client !== 'unsupported')
            return ProjectSide.Client;
        if(server !== 'unsupported')
            return ProjectSide.Server;
        return ProjectSide.Unknown;
    }

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
}
export class ModrinthMod extends ModrinthProject implements Mod {
    
}

export const API_BASE = 'https://api.modrinth.com/v2';
export const USER_BASE = 'https://modrinth.com/user/';
export const PROJECT_BASE = 'https://modrinth.com/project/'; 