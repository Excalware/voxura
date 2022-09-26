import { Voxura } from '../voxura';
import { readJsonFile, writeJsonFile } from '../util';

import EventEmitter from '../util/eventemitter';
import Account, { ProfileType } from './account';
import { getXboxToken, getXSTSToken, getMicrosoftToken, getMinecraftToken } from './util';
interface XboxData {
    token: string,
    userHash: string,
    expireDate: number
};
interface BasicData {
    token: string,
    tokenType: string,
    expireDate: number
};
export interface AccountData {
    xbox: XboxData,
    xsts: XboxData,
    xsts2: XboxData & {
        xuid: string
    },
    microsoft: BasicData & {
        scope: string,
        refreshToken: string
    },
    minecraft: BasicData,
    xboxProfile?: {
        avatar: string,
        gamertag: string,
        realName: string
    },
    profile?: {
        id: string,
        name: string
    }
};
interface AccountJson {
    data: AccountData[],
    selected?: string
};
export default class Authentication extends EventEmitter {
    public accounts: Account[];
    private data: AccountJson;
    private voxura: Voxura;
    private currentAccount?: Account;

    constructor(voxura: Voxura) {
        super();
        this.voxura = voxura;
        this.accounts = [];
    }

    public async login(code: string): Promise<Account> {
        const microsoft = await getMicrosoftToken(code);
        const xbox = await getXboxToken(microsoft.token);
        const xsts = await getXSTSToken(xbox.token, 'rp://api.minecraftservices.com/');
        const xsts2 = await getXSTSToken(xbox.token);
        const minecraft = await getMinecraftToken(xsts.token, xsts.userHash);

        const account = new Account(this, {
            xbox, xsts, xsts2,
            microsoft, minecraft
        });
        const profile = account.data.profile = await account.getProfile(ProfileType.Minecraft);
        account.data.xboxProfile = await account.getProfile(ProfileType.Xbox);
        account.uuid = profile.id;

        this.accounts.push(account);
        this.data.data = this.accounts.map(a => a.data);

        this.emitEvent('accountsChanged');
        return account;
    }

    public getCurrent() {
        return this.currentAccount;
    }

    public async loadFromFile(): Promise<void> {
        this.data = await readJsonFile<AccountJson>(this.dataPath);
        this.accounts = this.data.data.map(d => new Account(this, d));
        if (this.data.selected)
            this.currentAccount = this.accounts.find(a => a.uuid === this.data.selected);
    }

    public async refreshAccounts(): Promise<void> {
        for (const account of this.accounts)
            await account.refresh().catch(console.warn);
    }

    public async selectAccount(account: Account): Promise<void> {
        this.data.selected = account.uuid;
        this.currentAccount = account;

        await this.saveToFile();
        this.emitEvent('selectedChanged');
    }

    public async removeAccount(account: Account): Promise<void> {
        if (this.currentAccount === account) {
            this.currentAccount = undefined;
            this.emitEvent('selectedChanged');
        }
        this.accounts = this.accounts.filter(a => a !== account);
        this.data.data = this.accounts.map(a => a.data);

        await this.saveToFile();
        this.emitEvent('accountsChanged');
    }

    public async saveToFile(): Promise<void> {
        return writeJsonFile(this.dataPath, this.data);
    }

    private get dataPath(): string {
        return this.voxura.rootPath + '/accounts.json';
    }
};