import { fetch } from '@tauri-apps/api/http';

import Project from './project';
import type Instance from '../instances/instance';

export enum ModSide {
    Client,
    Server,
    Universal,
    Unknown
};
export default abstract class Mod extends Project {
    public getSide(): ModSide {
        const client = this.data.client_side, server = this.data.server_side;
        if(!client)
            return ModSide.Unknown;
        if(client !== 'unsupported' && server !== 'unsupported')
            return ModSide.Universal;
        if(client !== 'unsupported')
            return ModSide.Client;
        if(server !== 'unsupported')
            return ModSide.Server;
        return ModSide.Unknown;
    }

    public getVersions(): Promise<any[]> {
        return fetch<any[]>(`https://api.modrinth.com/v2/project/${this.id}/version`).then(d => d.data);
    }

    public async getLatestVersion(instance: Instance) {
        const { loader } = instance.config;
        const versions = await this.getVersions();
        return versions.find(({ loaders, game_versions }) =>
            loaders.some((l: any) => l === loader.type) && game_versions.some((v: any) => v === loader.game)
        );
    }
};