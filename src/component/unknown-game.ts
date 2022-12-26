import GameComponent from './game-component';
import { LaunchError } from '../instance';
export default class UnknownGame extends GameComponent {
	public static readonly id = 'unknown-game';

	async launch() {
		throw new LaunchError('missing_game');
	}
};