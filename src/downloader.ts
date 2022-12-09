import { listen } from '@tauri-apps/api/event';
import { v4 as uuidv4 } from 'uuid';

import EventEmitter from './util/eventemitter';
import { invokeTauri } from './util';
import type { Voxura } from './voxura';

interface DownloadPayload {
    id: string,
    total: number,
    progress: number
};

export default class Downloader extends EventEmitter {
    public downloads: Download[] = [];
    private path: string;

    public constructor(voxura: Voxura) {
        super();
        this.path = voxura.rootPath + '/downloads';

        listen<DownloadPayload>('download_update', ({ payload }) =>
            this.updateDownloads(this.downloads, payload)
        );
    }

    private updateDownloads(downloads: Download[], payload: DownloadPayload): void {
        for (const download of downloads) {
            if (download.id === payload.id)
                download.update(payload.progress, payload.total);
            this.updateDownloads(download.subDownloads, payload);
        }
    }

    public downloadFile(path: string, url: string, displayName?: string, displayIcon?: string): Promise<Download> {
        const download = new Download(this, path);
        download.displayName = displayName ?? 'Unknown download';
        if (displayIcon)
            download.displayIcon = displayIcon;

        this.downloads.push(download);
        this.emitEvent('changed');
        this.emitEvent('downloadStarted', download);

        invokeTauri('download_file', { id: download.id, url, path });

        return download.waitForFinish().then(() => download);
    }

    public extractArchive(target: string, path: string): Promise<void> {
        const download = new Download(this, target);
        download.type = DownloadType.Extract;
        download.displayName = 'Archive Extract';

        this.downloads.push(download);
        this.emitEvent('changed');
        this.emitEvent('downloadStarted', download);

        invokeTauri('extract_archive', { id: download.id, target, path });

        return download.waitForFinish();
    }
};

export enum DownloadType {
    Download,
    Extract
};
export class Download extends EventEmitter {
    public id: string;
    public path: string;
    public type: DownloadType = DownloadType.Download;
    public total: number = NaN;
    public parent?: Download;
    public visible: boolean = true;
    public progress: number = NaN;
    public displayName?: string;
    public displayIcon?: string;
    public subDownloads: Download[] = [];
    private downloader: Downloader;
    
    constructor(downloader: Downloader, path: string) {
        super();
        this.id = uuidv4();
        this.path = path;
        this.downloader = downloader;
    }

    update(progress?: number, total?: number) {
        if (total)
            this.total = total;
        if (progress)
            this.progress = progress;

        this.emitEvent('changed');
        this.downloader.emitEvent('changed');

        if (this.isDone) {
            this.emitEvent('finished');
            this.downloader.emitEvent('downloadFinished', this);
        }
        if (this.parent)
            this.parent.update();
    }

    addDownload(download: Download) {
        download.parent = this;
        download.visible = false;
        this.subDownloads.push(download);

        this.emitEvent('changed');
        this.downloader.emitEvent('changed');
    }

    waitForFinish(): Promise<void> {
        return new Promise(resolve => {
            const callback = () => {
                this.unlistenForEvent('finished', callback);
                resolve();
            };
            this.listenForEvent('finished', callback);
        });
    }

    get name(): string {
        return this.displayName ?? this.path;
    }

    get icon(): string {
        return this.displayIcon ?? 'img/icons/unknown_mod.svg';
    }

    get isDone(): boolean {
        const total = this.totalProgress;
        return total[0] >= total[1];
    }

    get state(): DownloadState {
        if (this.isDone)
            return DownloadState.Completed;
        return DownloadState.Downloading;
    }

    get totalProgress() {
        let total = this.total, prog = this.progress;
        for (const download of this.subDownloads)
            total += download.total, prog += download.progress;

        return [prog, total];
    }

    get percentage(): number {
        let total = this.progress / this.total * 100;
        for (const download of this.subDownloads)
            total += download.percentage;

        return total / (this.subDownloads.length + 1);
    }
};
export enum DownloadState {
    Downloading,
    Completed
};