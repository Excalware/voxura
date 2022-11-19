export default abstract class Mod {
    public path: string;
    public fileName: string;
    public metadata?: any;
    public abstract loader: string;

    constructor(name: string, filePath: string) {
        this.fileName = name;
        this.path = filePath;
    }

    public get id() {
        return this.fileName;
    }

    public get name() {
        return this.id;
    }

    public get description() {
        return '';
    }

    public get version() {
        return '0.0.0';
    }

    public get webIcon() {
        return 'img/icons/unknown_mod.svg';
    }
};