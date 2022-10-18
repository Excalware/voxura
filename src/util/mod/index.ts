export default abstract class Mod {
    public path: string;
    public fileName: string;
    public abstract loader: string;

    constructor(name: string, filePath: string) {
        this.fileName = name;
        this.path = filePath;
    }

    public get name() {
        return this.fileName;
    }

    public get webIcon() {
        return 'img/icons/unknown_mod.svg';
    }
};