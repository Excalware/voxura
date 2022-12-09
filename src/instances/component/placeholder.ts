import type Instance from '../instance';
import Component, { ComponentJson } from '.';
export default class PlaceholderComponent extends Component {
	public static readonly id = 'placeholder';
	private readonly data: ComponentJson;
	public constructor(instance: Instance, data: ComponentJson) {
		super(instance, data);
		this.data = data;
	};

	public toJSON(): ComponentJson {
		return this.data;
	}
};