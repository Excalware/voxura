import Mod from './';
export default class UnknownMod extends Mod {
	public dependencies = []
    constructor(name: string, filePath: string, md5: string) {
        super(name, filePath, md5);
    }
}