import { ComponentType } from '.';
import VersionedComponent from './versioned-component';
export default abstract class GameComponent extends VersionedComponent {
	public static type = ComponentType.Game;

	public abstract launch(): Promise<void>
};