import GameComponent from './game-component';
export default class UnknownGame extends GameComponent {
	public static readonly id = 'unknown';

	async launch() {}
};