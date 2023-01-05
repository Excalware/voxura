import { InstanceType } from '../instance';
import MinecraftExtension from './minecraft-extension';
import type { MinecraftJavaManifest } from './minecraft-java';
export default abstract class MinecraftClientExtension extends MinecraftExtension {
	public static instanceTypes = [InstanceType.Client]

	public abstract getManifest(): Promise<MinecraftJavaManifest>
	public getLibraries() {
		return this.getManifest().then(m => m.libraries);
	}
}