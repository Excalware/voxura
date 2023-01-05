import { exists } from '@tauri-apps/api/fs';
import { Download } from '../downloader';
import { InstanceType } from '../instance';
import Component, { ComponentJson } from '.';
export type JavaAgentJson = ComponentJson & {
	url: string;
};
export default abstract class JavaAgent extends Component<JavaAgentJson> {
	public static readonly id: string = 'java-agent';
	public static instanceTypes = [InstanceType.Client, InstanceType.Server]
	public async getFilePath() {
		const { agentPath } = this;
		if (!await exists(agentPath))
			await this.download();
		return agentPath
	}

	private async download() {
		const download = new Download('java_agent', null, this.instance.voxura.downloader);
		return download.download(this.url, this.agentPath).await();
	}

	public toJSON(): JavaAgentJson {
		return {
			url: this.url,
			...super.toJSON()
		};
	}

	public get url() {
		return this.data.url;
	}

	private get agentPath() {
		return this.path + '/agent.jar';
	}
};