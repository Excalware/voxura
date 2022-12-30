import { Buffer } from 'buffer';
import { invoke } from '@tauri-apps/api';
import { Command } from '@tauri-apps/api/shell';
import { InvokeArgs } from '@tauri-apps/api/tauri';
import { exists, FsOptions, writeFile, readTextFile } from '@tauri-apps/api/fs';

import Mod from './mod';
import ForgeMod from './mod/forge';
import FabricMod from './mod/fabric';
import UnknownMod from './mod/unknown';
import type { RustMod } from '../instance';
import { PLATFORM, MINECRAFT_LIBRARIES_URL } from './constants';

const isWindows = PLATFORM === 'win32';
const cmdProgram = isWindows ? 'powershell' : 'sh';
const cmdArguments = ['-c'];
export function createCommand(program: string, args: string[], cwd?: string) {
	console.log(args);
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

export function getModByFile({ md5, name, icon, path, meta, meta_name }: RustMod): Mod {
    if (meta_name === 'fabric.mod.json') {
        const mod = new FabricMod(name, path, md5, meta);
        if (icon)
            mod.icon = Buffer.from(icon);
        
        return mod;
    } if (meta_name?.includes('mods.toml')) {
        const mod = new ForgeMod(name, path, md5, meta);
        if (icon)
            mod.icon = Buffer.from(icon);
        
        return mod;
    }

    return new UnknownMod(name, path, md5);
};