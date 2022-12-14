import { open } from '@tauri-apps/api/shell';
import { Logger } from 'tslog';

import { Voxura } from '../voxura';
import { readJsonFile, writeJsonFile } from '../util';

import EventEmitter from '../util/eventemitter';
import { invokeTauri } from '../util';
import Account, { ProfileType } from './account';
import { AZURE_CLIENT_ID, AZURE_LOGIN_SCOPE, MICROSOFT_LOGIN_URL } from '../util/constants';
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
	public logger: Logger<unknown>;
    public accounts: Account[];
    private data: AccountJson = { data: [] };
    private voxura: Voxura;
    private currentAccount?: Account;

    public constructor(voxura: Voxura) {
        super();
        this.voxura = voxura;
		this.logger = voxura.logger.getSubLogger({ name: 'auth' });
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

        await this.saveToFile();
        this.emitEvent('accountsChanged');
        return account;
    }

    public getCurrent() {
        return this.currentAccount;
    }

    public async loadFromFile(): Promise<void> {
        try {
            this.data = await readJsonFile<AccountJson>(this.dataPath);
            this.accounts = this.data.data.map(d => new Account(this, d));
            if (this.data.selected)
                this.currentAccount = this.accounts.find(a => a.uuid === this.data.selected);

			this.emitEvent('accountsChanged');
			this.emitEvent('selectedChanged');
			this.logger.info('loaded', this.accounts.length, 'accounts from file');
        } catch(err) {
            console.warn(`Error while loading from file:`, err);
        }
    }

	public async requestMicrosoftAccessCode(selectAccount: boolean) {
		const url = new URL(MICROSOFT_LOGIN_URL);
		const params = url.searchParams;
		params.set('scope', AZURE_LOGIN_SCOPE);
		params.set('client_id', AZURE_CLIENT_ID);
		params.set('cobrandid', '8058f65d-ce06-4c30-9559-473c9275a65d');
		params.set('redirect_uri', 'http://localhost:3432');
		params.set('response_type', 'code');

		if (selectAccount)
			url.searchParams.set('prompt', 'select_account');

		await open(url.href);
		return invokeTauri<string>('request_microsoft_code').then(code => code.replace('/?code=', ''));
	}

    public async refreshAccounts(): Promise<void> {
        for (const account of this.accounts)
            await account.refresh().catch(console.warn);
		this.logger.info('refreshed', this.accounts.length, 'accounts');
    }

    public async selectAccount(account: Account): Promise<void> {
        this.data.selected = account.uuid;
        this.currentAccount = account;

        await this.saveToFile();
        this.emitEvent('selectedChanged');
		this.logger.info('set current account to', account.uuid);
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
		this.logger.info('removed', account.uuid);
    }

    public async saveToFile(): Promise<void> {
        await writeJsonFile(this.dataPath, this.data);
		this.logger.info('saved current data to file');
    }

    private get dataPath(): string {
        return this.voxura.rootPath + '/accounts.json';
    }
};