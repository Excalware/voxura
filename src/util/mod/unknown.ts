import Mod from './';
export default class UnknownMod extends Mod {
    public loader: string = 'unknown';
    constructor(name: string, filePath: string) {
        super(name, filePath);
    }
};