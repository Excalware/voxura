import { fetch, ResponseType } from '@tauri-apps/api/http';

import Mod from './mod';
import Project from './project';
import Platform from '.';
export default class Modrinth extends Platform {
    public constructor() {
        super('modrinth');
    }

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
        hits: ModrinthProject[],
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
        return fetch<any>('https://api.modrinth.com/v2/search', {
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
        return fetch<ProjectData>('https://api.modrinth.com/v2/project/' + id).then(r => r.data);
    }

    public async getMod(id: string): Promise<ModrinthMod> {
        return new ModrinthMod(id, await this.getProjectData(id), this);
    }

    public get displayName() {
        return 'Modrinth';
    }

    public get webIcon() {
        return 'img/icons/platforms/modrinth.svg';
    }
};

interface ProjectData {
    project_id: string
};
export class ModrinthProject extends Project {
    
};
export class ModrinthMod extends Mod implements ModrinthProject {
    
};