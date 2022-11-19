import { fetch } from '@tauri-apps/api/http';

import { ComponentType } from '.';
import MinecraftExtension from './minecraft-extension';
import { fileExists, readJsonFile } from '../../util';
import type { MinecraftJavaManifest } from './minecraft-java';

export type FabricVersionsResponse = {
    game: {}[],
    loader: {
        build: number,
        maven: string,
        stable: boolean,
        version: string,
        separator: string
    }[],
    mapping: {}[]
};
export default class FabricLoader extends MinecraftExtension {
    public static readonly id: string = 'fabric';
    public static type = ComponentType.Loader;

    public static async getVersions() {
        return fetch<FabricVersionsResponse>(`${this.apiBase}/versions`).then(({ data }) =>
            [data.loader.map(version => ({
                id: version.version,
                category: 0,
                dateCreated: new Date()
            }))]
        );
    }

    public async getManifest(): Promise<MinecraftJavaManifest> {
        const component = this.instance.gameComponent;

        const manifestPath = this.manifestPath;
        if (await fileExists(manifestPath))
            return readJsonFile<MinecraftJavaManifest>(manifestPath);

         await this.instance.manager.voxura.downloader.downloadFile(manifestPath, `${this.apiBase}/versions/loader/${encodeURIComponent(component.version)}/${encodeURIComponent(this.version)}/profile/json`,
            `${this.id} ${this.version} Manifest`, 'img/icons/minecraft/java.png'
        );

        return readJsonFile<MinecraftJavaManifest>(manifestPath);
    }

    protected get apiBase(): string {
        return (<typeof FabricLoader>this.constructor).apiBase;
    }
    protected static get apiBase(): string {
        return 'https://meta.fabricmc.net/v2';
    }
};