import { readDir } from '@tauri-apps/api/fs';
export default class JavaManager {
    private path: string;

    constructor(path: string) {
        this.path = path;
    }

    async getExecutable(version: number): Promise<string | void> {
        const entries = (await readDir(this.path)).filter(f => f.name);
        const latest = entries.filter(f => f.name?.startsWith(`jdk-${version}`) || f.name?.startsWith(`jdk${version}`))
        .sort((a, b) => parseInt(a.name?.replace(/\D/g, '') ?? '') - parseInt(b.name?.replace(/\D/g, '') ?? ''))
        .reverse()[0];
        
        console.log(latest);
        return `${latest?.path}/bin/java.exe`;
    }
};