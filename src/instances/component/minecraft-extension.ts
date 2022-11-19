import { ComponentType } from '.';
import VersionedComponent from './versioned-component';
import { mapLibraries } from '../../util';
import type { MinecraftJavaManifest } from './minecraft-java';
export default abstract class MinecraftExtension extends VersionedComponent {
    public static type = ComponentType.Loader;

    public abstract getManifest(): Promise<MinecraftJavaManifest>;
    public async getLibraries() {
        const manifest = await this.getManifest();
        return mapLibraries(manifest.libraries, this.instance.manager.librariesPath);
    };

    public get path() {
        return `${this.instance.manager.versionsPath}/${this.id}-${this.version}`;
    };
    public get manifestPath() {
        return this.path + '/manifest.json';
    };
};