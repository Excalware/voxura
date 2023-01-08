import joi from '../../../util/joi';
import MinecraftClientExtension from './minecraft-java';
import { VersionedComponentJson } from '../../versioned-component';
import Component, { ComponentType } from '../..';
export interface MinecraftJavaClientExtensionJsonJson extends VersionedComponentJson {
	name: string
	icon?: string
	version: string
	manifest: {
		id: string
		type?: string
		time?: string
		mainClass: string
		arguments: {
			jvm: string[]
			game: string[]
		}
		libraries: {
			url: string
			name: string
		}[]
		releaseTime?: string
		inheritsFrom: string
	}
}
export default class MinecraftJavaClientExtensionJson extends MinecraftClientExtension {
	public static id: string = 'minecraft-java-client-extension-json'
	public static type = ComponentType.Loader
	public static schema = Component.schema.keys({
		icon: joi.string(),
		name: joi.string().required(),
		version: joi.semver().valid().required(),
		manifest: joi.object({
			id: joi.string().required(),
			mainClass: joi.string().required(),
			arguments: joi.object({
				jvm: joi.array().items(joi.string()).required(),
				game: joi.array().items(joi.string()).required()
			}).required(),
			libraries: joi.array().items(joi.object({
				url: joi.string().uri().required(),
				name: joi.string().required()
			})).required(),
			inheritsFrom: joi.semver().valid().required()
		}).required()
	})
	public static instanceTypes = []
	declare protected data: MinecraftJavaClientExtensionJsonJson

	public async getDependencies() {
		const { manifest } = this;
		return Promise.resolve([{
			id: ['minecraft-java-vanilla'],
			versionRange: manifest.inheritsFrom
		}]);
	}

	public async getManifest(): Promise<any> {
		return Promise.resolve(this.manifest);
	}

	public getJvmArguments() {
		return Promise.resolve(this.manifest.arguments.jvm);
	}

	public getGameArguments() {
		return Promise.resolve(this.manifest.arguments.game);
	}

	public toJSON() {
		return this.data;
	}

	public get name() {
		return this.data.name;
	}

	public get icon() {
		return this.data.icon ?? null;
	}

	private get manifest() {
		return this.data.manifest;
	}
}