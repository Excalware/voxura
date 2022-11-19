import ModdedJava from './modded-java';
import { LoaderSetupType } from '../../types';
export default class FabricLoader extends ModdedJava {
    public static id = 'fabric';
    public static setupType: LoaderSetupType = LoaderSetupType.Versions;

    protected async downloadManifest() {
        const { game, version } = this.instance.config.loader;
        if (!version)
            throw new Error('Missing config.loader.version');
        await this.voxura.downloader.downloadFile(this.manifestPath, `${this.apiBase}/versions/loader/${encodeURIComponent(game)}/${encodeURIComponent(version)}/profile/json`,
            `${this.id} ${version} Manifest`, 'img/icons/minecraft/java.png'
        );
    }

    protected get apiBase(): string {
        return 'https://meta.fabricmc.net/v2';
    }
};