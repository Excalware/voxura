import { InstanceType } from '../instance';
import { ComponentType } from '.';
import VersionedComponent from './versioned-component';
export default abstract class JavaComponent extends VersionedComponent {
	public static type = ComponentType.Library;
	public static instanceTypes = [InstanceType.Client, InstanceType.Server]

	public abstract getBinaryPath(): Promise<string>
	public static getLatestVersion(major: number): Promise<string> {
		throw new Error('not implemented');
	}
};