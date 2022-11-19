import Loader from '.';
import { LoaderType, LoaderSetupType } from '../../types';

export default class MinecraftBedrock extends Loader {
    public static id = 'minecraft-bedrock-vanilla';
    public type = LoaderType.Vanilla;
    public static setupType: LoaderSetupType = LoaderSetupType.Versions;

    public async launch(): Promise<void> {

    }
};