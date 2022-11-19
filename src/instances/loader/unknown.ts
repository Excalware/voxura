import Loader from '.';
import { LoaderType, LoaderSetupType } from '../../types';
export default class UnknownLoader extends Loader {
    public static id = 'unknown';
    public type = LoaderType.Unknown;
    public vanillaLoader = UnknownLoader;
    public static setupType: LoaderSetupType = LoaderSetupType.Unknown;

    public async launch() {
        throw new Error('No loader is available');
    }
};