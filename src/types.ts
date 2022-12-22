export enum LoaderType {
    Vanilla,
    Modified,
    Unknown
};
export enum LoaderSetupType {
    Versions,
    Custom,
    Unknown
};
export enum InstanceState {
    None,
    Launching,
    GameRunning
};
export enum LoaderSetupFieldType {
    Text,
    File,
    Folder,
    Select
};
export type ComponentVersion = {
    id: string,
    category: number,
    dateCreated: Date
};
export type ComponentVersions = ComponentVersion[][];
export interface JavaVersionManifest {
    id: string,
    type: string,
    assets: string,
    logging: any,
    downloads: {
        server: JavaVersionManifestDownload,
        client: JavaVersionManifestDownload,
        server_mappings: JavaVersionManifestDownload,
        client_mappings: JavaVersionManifestDownload
    },
    arguments: {
        jvm: string[],
        game: string[]
    },
    libraries: any[],
    assetIndex: {
        url: string
    },
    javaVersion: {
        component: string,
        majorVersion: number
    },
    minecraftArguments: string,
    mainClass: string
};
interface JavaVersionManifestDownload {
    url: string,
    sha1: string,
    size: number
};