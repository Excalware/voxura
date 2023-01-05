import { exists } from '@tauri-apps/api/fs';

import JavaAgent from './java-agent';
import { Download } from '../downloader';
import JavaComponent from './java-component';
import MinecraftJava from './minecraft-java';
import { InstanceType } from '../instance';
import { InstanceState } from '../types';
import { createCommand } from '../util';
import MinecraftServerExtension from './minecraft-server-extension';
export default class MinecraftJavaServer extends MinecraftJava {
	public static readonly id: string = 'minecraft-java-server'
	public static instanceTypes = [InstanceType.Server]

	public async install() {
		const manifest = await this.getManifest();
		const server = manifest.downloads.server;

		const downloader = this.instance.manager.voxura.downloader;
		const version = this.version;
		const download = new Download('minecraft_java', [version], downloader);

		const path = this.jarPath;
		if (!await exists(path))
			await download.download(server.url, path).await();
	}

	public async launch() {
		const components = this.instance.store.components.filter(c => c instanceof MinecraftServerExtension) as MinecraftServerExtension[];
		if (components.length)
			for (const component of components)
				await component.preLaunch();
		else if (!await exists(this.jarPath))
			await this.install();

		const jvmArgs = await this.getJvmArguments([]);
		const gameArgs = await this.getGameArguments();

		const java = this.instance.getComponentByType<JavaComponent, typeof JavaComponent>(JavaComponent);
		if (!java)
			throw new Error('where is java');

		const launchTime = Date.now();
		const command = createCommand(await java.getBinaryPath(), [
			...jvmArgs,
			components[0]?.jarPath ?? this.jarPath,
			...gameArgs
		], this.instance.path)
			.on('close', data => {
				console.log('command closed:', data.code, data.signal);
				this.instance.setState(InstanceState.None);

				const { playTime } = this.instance.store;
				if (typeof playTime !== 'number' || isNaN(playTime))
					this.instance.store.playTime = Date.now() - launchTime;
				else
					this.instance.store.playTime += Date.now() - launchTime;
				this.instance.store.save();
			})
			.on('error', error => {
				console.log('command error:', error);
			});

		command.stdout.on('data', line => {
			console.log('stdout:', line);
		});
		command.stderr.on('data', line => {
			console.error('stderr:', line);
		});

		const child = await command.spawn();
		command.on('close', () => this.instance.killProcess(child));
		console.log('child process id:', child.pid);

		this.instance.processes.push(child);
		this.instance.setState(InstanceState.GameRunning);
	}

	protected async getJvmArguments(customArgs: string[]) {
		const parsed: string[] = [];
		for (const component of this.instance.store.components)
			if (component instanceof MinecraftServerExtension)
				parsed.push(...await component.getJvmArguments());
			else if (component instanceof JavaAgent)
				parsed.push(`-javaagent:${await component.getFilePath()}`);

		// TODO: implement a min-max range
		const memory = this.instance.store.memoryAllocation * 1000;
		parsed.push(`-Xmx${memory}M`);

		parsed.push(...customArgs);
		parsed.push('-jar');
		return parsed;
	}

	protected async getGameArguments() {
		const parsed: string[] = [];
		for (const component of this.instance.store.components)
			if (component instanceof MinecraftServerExtension)
				parsed.unshift(...await component.getGameArguments());

		return parsed;
	}

	public get jarPath() {
		return this.path + '/server.jar';
	}
}