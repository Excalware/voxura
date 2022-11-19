import MinecraftJava from './minecraft-java';
import { LoaderType, JavaVersionManifest } from '../../types';
import { fileExists, readJsonFile, mapLibraries } from '../../util';
export default class ModdedJava extends MinecraftJava {
    public static id = 'minecraft-java-modded';
    public type = LoaderType.Modified;
    protected async getLibraries(manifest: JavaVersionManifest, path: string, libraries: any[] = []) {
        const manager = this.instance.manager;
        const loaderManifest = await this.getManifest();
        manifest.mainClass = loaderManifest.mainClass;
        libraries.push(...mapLibraries(loaderManifest.libraries, manager.librariesPath))

        if (loaderManifest.minecraftArguments)
            manifest.minecraftArguments = loaderManifest.minecraftArguments;

        return super.getLibraries(manifest, path, libraries);
    }

    protected async getManifest(): Promise<JavaVersionManifest> {
        const manifestPath = this.manifestPath;
        if (await fileExists(manifestPath) as any)
            return readJsonFile<JavaVersionManifest>(manifestPath);

        await this.downloadManifest();
        return readJsonFile<JavaVersionManifest>(manifestPath);
    }

    protected async downloadManifest() {
        throw new Error(`${this.id} does not implement downloadManifest`);
    }

    protected get manifestPath(): string {
        const manager = this.instance.manager;
        const { loader } = this.instance.config;
        return `${manager.versionsPath}/${loader.type}-${loader.game}-${loader.version}/manifest.json`;
    }
};