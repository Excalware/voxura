import Project from './project';
import type Instance from '../instance';
import GameComponent from '../component/game-component';

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

    public async getLatestVersion(instance: Instance) {
        const versions = await this.getVersions();
		const { components } = instance.store;
        return versions.find(({ loaders, game_versions }) =>
            loaders.some((l: any) => components.some(c => c.getPlatformId(this.source) === l)) && game_versions.some((v: any) => components.some(c => c instanceof GameComponent && c.version === v))
        );
    }
};