/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { definePluginSettings } from "@api/Settings";
import { BaseText } from "@components/BaseText";
import { Button } from "@components/Button";
import { ErrorCard } from "@components/ErrorCard";
import { Link } from "@components/Link";
import { Paragraph } from "@components/Paragraph";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType, PluginNative } from "@utils/types";
import { findByPropsLazy } from "@webpack";
import { FluxDispatcher, React, RunningGameStore, showToast } from "@webpack/common";

const logger = new Logger("ExeIconRPC");
const Native = VencordNative.pluginHelpers.ExeIconRPC as PluginNative<typeof import("./native")>;
const TokenStore: { getToken?: unknown; } = findByPropsLazy("getToken");

function getToken() {
    const fn = TokenStore?.getToken;
    if (typeof fn !== "function") throw new Error("getToken missing");
    const token = (fn as () => unknown)();
    if (typeof token !== "string" || token.length < 20) throw new Error("no auth token");
    return token;
}

const CACHE_PREFIX = "exeIconRPC3_";

function baseName(path: string) {
    return (path.split(/[/\\]/).pop() ?? path).toLowerCase();
}

async function readIcon(exePath: string) {
    const value = await DataStore.get<string>(`${CACHE_PREFIX}${baseName(exePath)}`);
    return typeof value === "string" && value ? value : undefined;
}

function isAppIdValid(value: string) {
    if (!value) return true;
    return /^\d{16,21}$/.test(value) || "Must be a valid Discord ID.";
}

export const settings = definePluginSettings({
    appID: {
        type: OptionType.STRING,
        description: "Application ID used for the replacement activity and icon proxying",
        default: "",
        isValid: isAppIdValid,
        onChange: () => onGames()
    },
    optOut: {
        type: OptionType.STRING,
        description: "Exe names to leave alone, comma separated",
        default: "",
        onChange: () => releaseOptedOut()
    },
    clearCache: {
        type: OptionType.COMPONENT,
        component: () => <Button onClick={async () => {
            const keys = await DataStore.keys<string>();
            const ours = keys.filter(k => typeof k === "string" && k.startsWith(CACHE_PREFIX));
            if (ours.length) await DataStore.delMany(ours);
            showToast("Cleared exe icon cache", "success");
        }}>
            Clear Icon Cache
        </Button>
    }
});

function isOptedOut(exePath: string) {
    return settings.store.optOut.split(",").map(s => s.trim().toLowerCase()).filter(Boolean).includes(baseName(exePath));
}

function isRunning(exePath: string) {
    return gameOf(exePath) != null;
}

const liveByPath = new Map<string, { socketId: string; name: string; exePath: string; }>();
const counts = new Map<string, number>();
const busy = new Set<string>();
let dead = false;

function socketFor(exePath: string) {
    return `ExeIconRPC_${exePath.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
}

function gameOf(exePath: string) {
    const key = exePath.toLowerCase();
    return RunningGameStore.getRunningGames().find(g => {
        const p = (g as { exePath?: unknown; })?.exePath;
        return typeof p === "string" && p.toLowerCase() === key;
    });
}

async function getIcon(exePath: string) {
    const hit = await readIcon(exePath);
    if (hit) return hit;
    if (!settings.store.appID) return undefined;

    const hosted = await Native.uploadTempHost(await Native.getExeIcon(exePath), baseName(exePath));
    const proxied = await Native.uploadExternalAsset(settings.store.appID, hosted, getToken());
    await DataStore.set(`${CACHE_PREFIX}${baseName(exePath)}`, proxied);
    return proxied;
}

function drop(key: string) {
    const entry = liveByPath.get(key);
    if (!entry) return;
    liveByPath.delete(key);
    const left = (counts.get(entry.name) ?? 1) - 1;
    if (left <= 0) counts.delete(entry.name);
    else counts.set(entry.name, left);
    FluxDispatcher.dispatch({ type: "LOCAL_ACTIVITY_UPDATE", activity: null, socketId: entry.socketId });
}

function releaseOptedOut() {
    for (const [key, entry] of [...liveByPath.entries()])
        if (isOptedOut(entry.exePath)) drop(key);
    onGames();
}

async function claim(exePath: string) {
    if (!exePath) return;
    const key = exePath.toLowerCase();
    if (busy.has(key) || liveByPath.has(key)) return;
    busy.add(key);
    try {
        const game = gameOf(exePath);
        const name = (game as { name?: unknown; })?.name;
        if (typeof name !== "string" || !name || isOptedOut(exePath) || dead) return;
        if ((game as { id?: unknown; })?.id != null) return;
        const url = await getIcon(exePath);
        if (dead || !url || !isRunning(exePath) || isOptedOut(exePath)) return;
        const socketId = socketFor(exePath);
        liveByPath.set(key, { socketId, name: name.toLowerCase(), exePath });
        counts.set(name.toLowerCase(), (counts.get(name.toLowerCase()) ?? 0) + 1);
        FluxDispatcher.dispatch({
            type: "LOCAL_ACTIVITY_UPDATE",
            activity: {
                application_id: settings.store.appID,
                name,
                type: 0,
                flags: 1 << 0,
                timestamps: { start: Date.now() },
                assets: { large_image: url }
            },
            socketId
        });
    } catch (e) {
        logger.warn(`icon failed for ${baseName(exePath)}`, e);
    } finally {
        busy.delete(key);
    }
}

function onGames() {
    if (!IS_DISCORD_DESKTOP) return;
    const seen = new Set<string>();
    for (const game of RunningGameStore.getRunningGames() ?? []) {
        const exePath = (game as { exePath?: unknown; })?.exePath;
        if (typeof exePath !== "string" || !exePath || isOptedOut(exePath)) continue;
        if ((game as { id?: unknown; })?.id != null) continue;
        const key = exePath.toLowerCase();
        seen.add(key);
        if (!liveByPath.has(key)) void claim(exePath);
    }
    for (const key of [...liveByPath.keys()])
        if (!seen.has(key)) drop(key);
}

export default definePlugin({
    name: "ExeIconRPC",
    description: "Show exe icons for games Discord doesn't recognize",
    authors: [{ name: "iFlex0x", id: 1007939118925361212n }],
    settings,

    patches: [
        {
            find: '"LocalActivityStore"',
            replacement: [
                {
                    match: /\.LISTENING.+?([,:])(?=!?\i\(\)\(\i,\i\))(?<=(\i)\.push.+?)/,
                    replace: (m, commaOrSemiColon, activities) => `${m}${activities}=${activities}.filter($self.keepActivity)${commaOrSemiColon}`
                }
            ]
        }
    ],

    // Stock game entries carry no app id and no assets, ours always do.
    keepActivity(activity: { type?: number; name?: string; application_id?: string | null; assets?: { large_image?: string; } | null; }) {
        if (activity?.type !== 0 || typeof activity?.name !== "string") return true;
        if (activity.application_id != null || activity.assets?.large_image != null) return true;
        return !counts.has(activity.name.toLowerCase());
    },

    settingsAboutComponent: () => {
        const { appID } = settings.store;
        return <>
            {!appID && (
                <ErrorCard style={{ padding: "1em" }}>
                    <BaseText size="md" weight="bold">Notice</BaseText>
                    <Paragraph>Paste an Application ID below, the plugin needs it to work. Without one it stays idle.</Paragraph>
                </ErrorCard>
            )}
            <Paragraph>
                Make an application at <Link href="https://discord.com/developers/applications">Discord Developer Portal</Link> and paste its ID into the App ID setting.
            </Paragraph>
        </>;
    },

    start() {
        if (!IS_DISCORD_DESKTOP) return;
        dead = false;
        RunningGameStore.addChangeListener(onGames);
        onGames();
    },

    stop() {
        dead = true;
        RunningGameStore.removeChangeListener(onGames);
        for (const key of [...liveByPath.keys()]) drop(key);
        busy.clear();
    }
});
