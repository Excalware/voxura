import { Body, fetch } from '@tauri-apps/api/http';

import { XBOX_AUTH_BASE, XSTS_AUTH_BASE, MINECRAFT_SERVICES_API } from '../util/constants';

import type Account from './account';
import type { AccountData } from './';
export async function getXboxToken(token: string) {
    const { data } = await fetch<any>(`${XBOX_AUTH_BASE}/user/authenticate`, {
        body: Body.json({
            Properties: {
                SiteName: 'user.auth.xboxlive.com',
                RpsTicket: `d=${token}`,
                AuthMethod: 'RPS',
                OptionalDisplayClaims: ['mgt', 'umg']
            },
            RelyingParty: 'http://auth.xboxlive.com',
            TokenType: 'JWT'
        }),
        method: 'POST'
    });

    console.warn('[voxura.auth]: Acquired Xbox Live token.');
    return {
        token: data.Token,
        userHash: data.DisplayClaims.xui[0].uhs,
        expireDate: new Date(data.NotAfter).getTime()
    };
};
export async function getXSTSToken(token: string, party?: string) {
    const { data } = await fetch<any>(`${XSTS_AUTH_BASE}/xsts/authorize`, {
        body: Body.json({
            Properties: {
                SandboxId: 'RETAIL',
                UserTokens: [ token ]
            },
            RelyingParty: party ?? 'http://xboxlive.com',
            TokenType: 'JWT'
        }),
        method: 'POST'
    });

    console.warn('[voxura.auth]: Acquired XSTS token.');
    return {
        xuid: data.DisplayClaims.xui[0].xid,
        token: data.Token,
        userHash: data.DisplayClaims.xui[0].uhs,
        expireDate: new Date(data.NotAfter).getTime()
    };
}

export async function getMicrosoftToken(code: string) {
    const { data } = await fetch<any>('https://mdpkm.voxelified.com/api/v1/oauth/token', {
        body: Body.json({ code }),
        method: 'POST',
    });
    if (data.error)
        throw new Error(data.message);

    console.warn('[voxura.auth]: Acquired Microsoft token.');
    return {
        scope: data.scope,
        token: data.access_token,
        tokenType: data.token_type,
        expireDate: Date.now() + data.expires_in * 1000,
        refreshToken: data.refresh_token
    };
};
export async function refreshMicrosoftToken(refreshToken: string) {
    const { data } = await fetch<any>('https://mdpkm.voxelified.com/api/v1/oauth/token', {
        body: Body.json({ refreshToken }),
        method: 'POST'
    });
    if (data.error) {
        console.error('refresh error!', data);
        throw new Error(data.error_description);
    }

    console.warn('[voxura.auth]: Refreshed Microsoft token.');
    return {
        scope: data.scope,
        token: data.access_token,
        tokenType: data.token_type,
        expireDate: Date.now() + data.expires_in * 1000,
        refreshToken: data.refresh_token
    };
};

export async function getMinecraftToken(token: string, userHash: string) {
    const { data } = await fetch<any>(`${MINECRAFT_SERVICES_API}/authentication/login_with_xbox`, {
        method: 'POST',
        body: Body.json({
            identityToken: `XBL3.0 x=${userHash};${token}`
        })
    });

    console.warn('[voxura.auth]: Acquired Minecraft token.');
    return {
        token: data.access_token,
        tokenType: data.token_type,
        expireDate: Date.now() + data.expires_in * 1000
    };
};

const refreshOrder = ['microsoft', 'xbox', 'xsts', 'xsts2', 'minecraft'];
const refreshFunctions = {
    xbox: (d: AccountData) =>
        getXboxToken(d.microsoft.token).then(a => d.xbox = a),
    xsts: (d: AccountData) =>
        getXSTSToken(d.xbox.token, 'rp://api.minecraftservices.com/').then(a => d.xsts = a),
    xsts2: (d: AccountData) =>
        getXSTSToken(d.xbox.token).then(a => d.xsts2 = a),
    microsoft: (d: AccountData) =>
        refreshMicrosoftToken(d.microsoft.refreshToken).then(a => d.microsoft = a),
    minecraft: (d: AccountData) =>
        getMinecraftToken(d.xsts.token, d.xsts.userHash).then(a => d.minecraft = a)
};
export async function refreshAccount(account: Account) {
    const date = Date.now();
    const data = account.getJson();
    for (const value of refreshOrder) {
        if (date >= data[value].expireDate) {
            console.warn('[voxura.auth]:', value, 'token expired.');
            await refreshFunctions[value]?.(data);
        }
    }
    account.manager.saveToFile();
};