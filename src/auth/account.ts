import { Body, fetch } from '@tauri-apps/api/http';

import { refreshAccount } from './util';
import { MINECRAFT_SERVICES_API } from '../util/constants';

import type Authentication from './';
import type { AccountData } from './';
export enum ProfileType {
    Xbox, Minecraft
}
export enum AvatarType {
    Xbox, Minecraft
};
export enum AvatarStyle {
    Default, Bust
};
export interface Profile {
    name: string,
    uuid: string,
    skins: any[],
    capes: any[]
};
export default class Account {
    public uuid?: string;
    public readonly data: AccountData;
    public manager: Authentication;

    public constructor(manager: Authentication, data: AccountData) {
        this.manager = manager;
        this.data = data;
        this.uuid = data.profile?.id;
    }

    public async getProfile(type: ProfileType): Promise<any> {
        if (type === ProfileType.Xbox) {
            const { xsts2 } = this.data;
            const { data: { profileUsers: [ profile ] } } = await fetch<any>(`https://profile.xboxlive.com/users/xuid(${xsts2.xuid})/settings`, {
                query: {
                    settings: 'ModernGamertag,GameDisplayPicRaw,RealName'
                },
                method: 'GET',
                headers: {
                    Authorization: `XBL3.0 x=${xsts2.userHash};${xsts2.token}`,
                    'x-xbl-contract-version': '2'
                }
            });
            return {
                avatar: profile.settings[1].value,
                gamertag: profile.settings[0].value,
                realName: profile.settings[2].value
            };
        } else if (type === ProfileType.Minecraft) {
            const { data: { id, name, skins = [], capes = [] } } = await fetch<any>(`${MINECRAFT_SERVICES_API}/minecraft/profile`, {
                method: 'GET',
                headers: this.requestHeaders
            });
            return { id, name, skins, capes };
        }
    }

    public getAvatarUrl(type: AvatarType, style: AvatarStyle = AvatarStyle.Default, size: number = 24): string | undefined {
        if (type === AvatarType.Xbox)
            return this.data.xboxProfile?.avatar;
        if (type === AvatarType.Minecraft)
            if (style === AvatarStyle.Default)
                return `https://visage.surgeplay.com/face/${size}/${this.uuid}`;
            else if (style === AvatarStyle.Bust)
                return `https://visage.surgeplay.com/bust/${size}/${this.uuid}`;
    }

    public async requestProfile(): Promise<Profile> {
        const { data: { id, name, skins = [], capes = [] } } = await fetch<any>(`${MINECRAFT_SERVICES_API}/minecraft/profile`, {
            method: 'GET',
            headers: this.requestHeaders
        });
        return {
            name,
            uuid: id,
            skins,
            capes
        };
    }

    public async changeSkin(data: Uint8Array, variant: 'classic' | 'slim') {
        await fetch(`${MINECRAFT_SERVICES_API}/minecraft/profile/skins`, {
            body: Body.form({
                file: {
                    file: data,
                    mime: 'image/png',
                    fileName: 'skin.png'
                },
                variant
            }),
            method: 'POST',
            headers: this.requestHeaders
        });
    }

    public async changeSkinUrl(url: string, variant: 'classic' | 'slim') {
        await fetch(`${MINECRAFT_SERVICES_API}/minecraft/profile/skins`, {
            body: Body.json({
                url,
                variant
            }),
            method: 'POST',
            headers: this.requestHeaders
        });
    }

    public async resetSkin() {
        await fetch(`${MINECRAFT_SERVICES_API}/minecraft/profile/skins`, {
            method: 'DELETE',
            headers: this.requestHeaders
        });
    }

    public async changeCape(capeId: string) {
        await fetch(`${MINECRAFT_SERVICES_API}/minecraft/profile/capes/active`, {
            body: Body.json({
                capeId
            }),
            method: 'PUT',
            headers: this.requestHeaders
        });
    }

    public async hideCape() {
        await fetch(`${MINECRAFT_SERVICES_API}/minecraft/profile/capes/active`, {
            method: 'DELETE',
            headers: this.requestHeaders
        });
    }

    public async refresh(): Promise<void> {
        await refreshAccount(this);
    }

    public remove(): Promise<void> {
        return this.manager.removeAccount(this);
    }

    public getJson(): AccountData {
        return this.data;
    }

    public get name(): string | undefined {
        return this.data.profile?.name;
    }

    public get xboxName(): string | undefined {
        return this.data.xboxProfile?.gamertag;
    }

    public get minecraftToken(): string {
        return this.data.minecraft.token;
    }

    private get requestHeaders() {
        const { token, tokenType } = this.data.minecraft;
        return {
            Authorization: `${tokenType} ${token}`
        };
    }
};