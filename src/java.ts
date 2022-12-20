import { fetch } from '@tauri-apps/api/http';
import { readDir, createDir } from '@tauri-apps/api/fs';

import { Download } from './downloader';
import type { Voxura } from './voxura';
import { ARCH, PLATFORM } from './util/constants';
import { fileExists, invokeTauri } from './util';

const JAVA_BINARY = PLATFORM === 'win32' ? 'javaw.exe' : 'java';
const systemName = {
    win32: 'windows'
}[PLATFORM as string] ?? PLATFORM;
const systemArch = {
    x86: 'x32',
    x86_64: 'x64'
}[ARCH as string] ?? ARCH;
interface AdoptiumVersion {
    binary: {
        os: 'windows' | 'linux' | 'mac',
        package: {
            name: string,
            link: string
        },
        image_type: 'jdk' | 'testimage' | 'debugimage',
        architecture: 'x32' | '64' | 'arm' | 's390x' | 'aarch64' | 'ppc64le'
    },
    version: {
        openjdk_version: string
    },
    release_name: string
};
export default class JavaManager {
    private path: string;
    private voxura: Voxura;
    public constructor(voxura: Voxura, path: string) {
        this.path = path;
        this.voxura = voxura;
    }

    public async getExecutable(version: number): Promise<string> {
        const path = this.path;
        await createDir(path, { recursive: true });

        const entries = (await readDir(path)).filter(f => f.name);
        const latest = entries.filter(f => f.name?.startsWith(`jdk-${version}`) || f.name?.startsWith(`jdk${version}`))
        .sort((a, b) => parseInt(a.name?.replace(/\D/g, '') ?? '') - parseInt(b.name?.replace(/\D/g, '') ?? ''))
        .reverse()[0];
        
        if (!latest)
            return this.downloadVersion(version);
        return `${latest.path}/bin/${JAVA_BINARY}`;
    }

    private async downloadVersion(version: number): Promise<string> {
        const { data } = await fetch<AdoptiumVersion[]>(`https://api.adoptium.net/v3/assets/latest/${version}/hotspot`, {
            query: {
                os: systemName,
                vendor: 'eclipse',
                image_type: 'jdk',
                architecture: systemArch
            },
            method: 'GET'
        });
        const latest = data[0];
        if (latest) {
            const binary = latest.binary.package;
            const path = `${this.voxura.tempPath}/${binary.name}`;

			const download = new Download('temurin', [latest.version.openjdk_version], this.voxura.downloader);
            if (!await fileExists(path))
				await download.download(binary.link, path);
			await download.extract(this.path, path);

            return `${this.path}/${latest.release_name}/bin/${JAVA_BINARY}`;
        }
        throw new Error(`No compatible versions were found`);
    }
};