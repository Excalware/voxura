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
            if (download.uuid === payload.id)
                download.update(payload.progress, payload.total);
            this.updateDownloads(download.subDownloads, payload);
        }
    }
};

export enum DownloadState {
	Pending,
	Finished,
	Extracting,
	Downloading
};
export class Download extends EventEmitter {
	public id: string;
	public uuid: string;
    public total: number = 1;
	public state: DownloadState = DownloadState.Pending;
    public parent?: Download;
    public progress: number = 0;
	public extraData: any;
    public subDownloads: Download[] = [];
    private downloader: Downloader;
    
    constructor(id: string, extraData: any, downloader: Downloader, push: boolean = true) {
        super();
		this.id = id;
        this.uuid = uuidv4();
		this.extraData = extraData;
        this.downloader = downloader;

		if (push)
			downloader.downloads.push(this);
		this.downloader.emitEvent('changed');
    }

    public update(progress?: number, total?: number) {
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

    public addDownload(download: Download) {
        download.parent = this;
        this.subDownloads.push(download);

        this.emitEvent('changed');
        this.downloader.emitEvent('changed');
    }

	public download(url: string, path: string) {
		this.setState(DownloadState.Downloading);
		this.downloader.emitEvent('downloadStarted');
		invokeTauri('download_file', { id: this.uuid, url, path });

		return this.waitForFinish().then(() => this.setState(DownloadState.Finished));
	}

	public extract(path: string, target: string) {
		this.setState(DownloadState.Extracting);
		this.downloader.emitEvent('downloadStarted');
		invokeTauri('extract_archive', { id: this.uuid, path, target });

		return this.waitForFinish().then(() => this.setState(DownloadState.Finished));
	}

	public setState(state: DownloadState) {
		this.state = state;
		this.emitEvent('changed');
	}

    public waitForFinish(): Promise<void> {
        return new Promise(resolve => {
            const callback = () => {
                this.unlistenForEvent('finished', callback);
                resolve();
            };
            this.listenForEvent('finished', callback);
        });
    }

    public get isDone(): boolean {
		const [prog, total] = this.totalProgress;
        return this.state === DownloadState.Finished || prog >= total;
    }

    public get totalProgress(): [number, number] {
        let total = this.total, prog = this.progress;
        for (const download of this.subDownloads)
            total += download.total, prog += download.progress;

        return [prog, total];
    }

    public get percentage(): number {
        let total = this.progress / this.total * 100;
        for (const download of this.subDownloads)
            total += download.percentage;

        return total / (this.subDownloads.length + 1);
    }
};