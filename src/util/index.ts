import { Buffer } from 'buffer';
import { invoke } from '@tauri-apps/api';
import { Command } from '@tauri-apps/api/shell';
import { InvokeArgs } from '@tauri-apps/api/tauri';
import { exists, FsOptions, writeFile, readTextFile } from '@tauri-apps/api/fs';

import Mod from './mod';
import ForgeMod from './mod/forge';
import FabricMod from './mod/fabric';
import UnknownMod from './mod/unknown';
import type { RustMod } from '../instances/instance';
import { PLATFORM, DEFAULT_INSTANCE_ICONS, MINECRAFT_LIBRARIES_URL } from './constants';

export function getDefaultIcon(name: string) {
    let hash = 0;
    for (let i = 0; i < name.length; i++)
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    hash = Math.abs(hash);

    if (hash % 69420 === 0)
        return DEFAULT_INSTANCE_ICONS[7];
    return DEFAULT_INSTANCE_ICONS[Math.floor(hash % 7)];
};

const isWindows = PLATFORM === 'win32';
const cmdProgram = isWindows ? 'powershell' : 'sh';
const cmdArguments = ['-c'];
export function createCommand(program: string, args: string[], cwd?: string) {
	if (isWindows) // command prompt has a character limit, so we have to use powershell instead
		return new Command(cmdProgram, [`& '${program}' @('${args.join("','")}')`], { cwd });
	return new Command(cmdProgram, [...cmdArguments, program, ...args], { cwd });
};

export function invokeTauri<T>(cmd: string, args?: InvokeArgs) {
    return invoke<T>('plugin:voxura|' + cmd, args);
};

export function readJsonFile<T>(filePath: string, options?: FsOptions): Promise<T> {
    return readTextFile(filePath, options).then(JSON.parse);
};

export function writeJsonFile(filePath: string, contents: any, options?: FsOptions): Promise<void> {
    return writeFile(filePath, JSON.stringify(contents), options);
};

export function fileExists(filePath: string, options?: FsOptions): Promise<boolean> {
    return exists(filePath, options) as any;
};

export function filesExist(filePathes: string[]): Promise<Record<string, boolean>> {
    return invokeTauri('files_exist', { files: filePathes });
};

export function getMD5Hash(filePath: string): Promise<string> {
	return invokeTauri('get_file_md5', { path: filePath });
};

export function createSymlink(original: string, link: string): Promise<string> {
	return invokeTauri('create_sym_link', { original, link });
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

export function mapLibraries(libraries: any[], path: string): any[] {
    return libraries
    .reduce((acc, lib) => {
        const array: {}[] = [];
        if (lib.downloads && lib.downloads.artifact) {
            const url = lib.downloads.artifact.url || `https://files.minecraftforge.net/${mavenAsString(lib.name)}`;
            array.push({
                url,
                path: `${path}/${lib.downloads.artifact.path}`,
                sha1: lib.downloads.artifact.sha1,
                name: lib.name
            });
        }

        const native = ((lib?.natives && lib?.natives[convertPlatform(PLATFORM)]) || '').replace('${arch}', '64');
        if (native && lib?.downloads?.classifiers[native])
            array.push({
                url: lib.downloads.classifiers[native].url,
				name: lib.name,
				sha1: lib.downloads.classifiers[native].sha1,
                path: `${path}/${lib.downloads.classifiers[native].path}`,
                natives: true
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

export function getModByFile({ md5, name, icon, path, meta, meta_name }: RustMod): Mod {
    if (meta_name === 'fabric.mod.json') {
        const mod = new FabricMod(name, path, md5, meta);
        if (icon)
            mod.icon = Buffer.from(icon);
        
        return mod;
    } if (meta_name.includes('mods.toml')) {
        const mod = new ForgeMod(name, path, md5, meta);
        if (icon)
            mod.icon = Buffer.from(icon);
        
        return mod;
    }

    return new UnknownMod(name, path);
};