import JSZip from 'jszip';
import { Buffer } from 'buffer';
import { exists, FsOptions, writeFile, readTextFile, readBinaryFile } from '@tauri-apps/api/fs';

import Mod from './mod';
import ForgeMod from './mod/forge';
import FabricMod from './mod/fabric';
import UnknownMod from './mod/unknown';
import type { RustMod } from '../instances/instance';
import { PLATFORM, MINECRAFT_LIBRARIES_URL } from './constants';
export function readJsonFile<T>(filePath: string, options?: FsOptions): Promise<T> {
    return readTextFile(filePath, options).then(JSON.parse);
};

export function writeJsonFile(filePath: string, contents: any, options?: FsOptions): Promise<void> {
    return writeFile(filePath, JSON.stringify(contents), options);
};

export function fileExists(filePath: string, options?: FsOptions): Promise<boolean> {
    return exists(filePath, options) as any;
};

export function mavenAsArray(maven: string, nativeString?: string, forceExt?: string): string[] {
    const pathSplit = maven.split(':');
    const fileName = pathSplit[3] ? `${pathSplit[2]}-${pathSplit[3]}` : pathSplit[2];
    const finalFileName = fileName.includes('@')
        ? fileName.replace('@', '.')
        : `${fileName}${nativeString || ''}${forceExt || '.jar'}`;
    const initPath = pathSplit[0]
        .split('.')
        .concat(pathSplit[1])
        .concat(pathSplit[2].split('@')[0])
        .concat(`${pathSplit[1]}-${finalFileName}`);
    
    return initPath;
};
export function mavenAsString(maven: string, nativeString?: string, forceExt?: string) {
    return mavenAsArray(maven, nativeString, forceExt).join('/');
};

export function convertPlatform(format: string): string {
    switch (format) {
        case 'win32':
            return 'windows';
        case 'darwin':
            return 'mac';
        case 'linux':
            return 'linux';
        default:
            return format;
    };
};

export function mapLibraries(libraries: any[], path: string): string[] {
    return libraries
    .reduce((acc, lib) => {
        const array: {}[] = [];
        if (lib.downloads && lib.downloads.artifact) {
            let { url } = lib.downloads.artifact;
            if (lib.downloads.artifact.url === '') {
                url = `https://files.minecraftforge.net/${mavenAsString(lib.name)}`;
            }
            array.push({
                url,
                path: `${path}/${lib.downloads.artifact.path}`,
                sha1: lib.downloads.artifact.sha1,
                name: lib.name
            });
        }

        const native = (
            (lib?.natives &&
                lib?.natives[convertPlatform(PLATFORM)]) ||
            ''
        ).replace('${arch}', '64');

        if (native && lib?.downloads?.classifiers[native])
            array.push({
                url: lib.downloads.classifiers[native].url,
                path: `${path}/${lib.downloads.classifiers[native].path}`,
                sha1: lib.downloads.classifiers[native].sha1,
                natives: true,
                name: lib.name
            });
        if (array.length === 0)
            array.push({
                url: `${lib.url || `${MINECRAFT_LIBRARIES_URL}/`}${mavenAsString(
                    lib.name,
                    native && `-${native}`
                )}`,
                path: `${path}/${mavenAsString(lib.name, native)}`,
                ...(native && { natives: true }),
                name: lib.name
            });

        return acc.concat(array.filter(_ => _));
    }, []);
};

export function getModByFile({ name, icon, path, meta, meta_name }: RustMod): Mod {
    if (meta_name === 'fabric.mod.json') {
        const mod = new FabricMod(name, path, meta);
        if (icon)
            mod.icon = Buffer.from(icon);
        
        return mod;
    } if (meta_name.includes('mods.toml')) {
        const mod = new ForgeMod(name, path, meta);
        if (icon)
            mod.icon = Buffer.from(icon);
        
        return mod;
    }

    return new UnknownMod(name, path);
};