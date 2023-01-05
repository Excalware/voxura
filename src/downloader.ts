import { listen } from '@tauri-apps/api/event';
import type { Logger } from 'tslog';
import { v4 as uuidv4 } from 'uuid';

import EventEmitter from './util/eventemitter';
import { invokeTauri } from './util';
import type { Voxura } from './voxura';
export default class Downloader extends EventEmitter {
	public path: string
	public tasks: DownloadTask[] = []
	public logger: Logger<unknown>;
    public downloads: Download[] = []

    public constructor(voxura: Voxura) {
        super();
        this.path = voxura.rootPath + '/downloads';
		this.logger = voxura.logger.getSubLogger({ name: 'downloader' });

        listen<DownloadPayload>('download_update', ({ payload }) =>
            this.updateTasks(this.tasks, payload)
        );
    }

    private updateTasks(tasks: DownloadTask[], payload: DownloadPayload): void {
        for (const task of tasks)
            if (task.id === payload.id)
                task.update(payload.total, payload.progress);
    }
}

export enum DownloadState {
	Pending,
	Finished,
	Extracting,
	Downloading
}
export interface DownloadPayload {
    id: string,
    total: number,
    progress: number
}
export class Download extends EventEmitter {
	public id: string
	public tasks: DownloadTask[] = []
	public state: DownloadState = DownloadState.Pending
	public extraData: any
    public downloader: Downloader
    
    constructor(id: string, extraData: any, downloader: Downloader, push: boolean = true) {
        super();
		this.id = id;
		this.extraData = extraData;
        this.downloader = downloader;

		if (push)
			this.push();
		this.downloader.emitEvent('changed');
    }

	public push() {
		const { downloads } = this.downloader;
		if (!downloads.includes(this))
			downloads.push(this);
	}

    public addTask(task: DownloadTask) {
        this.tasks.push(task);
		this.downloader.tasks.push(task);

        this.emitEvent('changed');
        this.downloader.emitEvent('changed');
    }

	public download(url: string, path: string) {
		const task = new DownloadTask(TaskType.Download, this);
		this.addTask(task);
		return task.startDownload(url, path);
	}

	public extract(path: string, target: string) {
		const task = new DownloadTask(TaskType.Extract, this);
		this.addTask(task);
		return task.startExtract(path, target);
	}

	public async awaitTasks() {
		for (const task of this.tasks)
			if (!task.done)
				await task.await();
	}

	public tryFinish() {
		if (this.isDone)
			return;
		for (const task of this.tasks)
			if (!task.done)
				return;
		this.setState(DownloadState.Finished);
		this.downloader.emitEvent('downloadFinished', this);
	}

	public setState(state: DownloadState) {
		this.state = state;
		this.emitEvent('changed');
	}

    public get isDone() {
        return this.state === DownloadState.Finished;
    }

    public get progress() {
        return this.tasks.reduce<[number, number]>((p, { progress }) =>
			[p[0] + progress[0], p[1] + progress[1]]
		, [0, 0]);
    }

    public get percentage() {
        const { progress } = this;
		return progress[0] / progress[1] * 100;
    }
}

export enum TaskType {
	Extract,
	Download
}
export class DownloadTask extends EventEmitter {
	public id: string
	public done: boolean = false
	public type: TaskType
	public progress: [number, number] = [0, 0]
	private download: Download
	constructor(type: TaskType, download: Download) {
		super();
		this.id = uuidv4();
		this.type = type;
		this.download = download;
	}

	public await() {
		return this.awaitEvent('done').then(() =>
			this.download.downloader.logger.info(`download task finished ${this.id}`)
		).then(() => this.download.tryFinish());
	}

	public startDownload(url: string, path: string) {
		const { download } = this;
		const { downloader } = download;
		downloader.logger.info('download started:', path, 'from', url);

		if (download.state === DownloadState.Pending)
			downloader.emitEvent('downloadStarted', download);
		download.setState(DownloadState.Downloading);
		invokeTauri('download_file', { id: this.id, url, path });

		return this;
	}

	public startExtract(path: string, target: string) {
		const { download } = this;
		const { downloader } = download;
		downloader.logger.info('extract started:', path);

		if (download.state === DownloadState.Pending)
			downloader.emitEvent('downloadStarted', download);
		download.setState(DownloadState.Extracting);
		invokeTauri('extract_archive', { id: this.id, path, target });

		return this;
	}

	public update(total: number, progress: number) {
		this.progress = [progress, total];

		if (!this.done && progress >= total) {
			this.done = true;
			this.emitEvent('done');
		}
		this.download.emitEvent('changed');
        this.download.downloader.emitEvent('changed');
	}
}