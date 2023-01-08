import { InstanceType } from '../../../instance';
import MinecraftExtension from '../../minecraft-extension';
export default abstract class MinecraftServerExtension extends MinecraftExtension {
	public static instanceTypes = [InstanceType.Server]

	public abstract preLaunch(): Promise<void>

	public get jarPath(): string | null {
		return null;
	}
}