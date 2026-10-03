/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { app, IpcMainInvokeEvent } from "electron";

const APP_ID_RE = /^\d{16,21}$/;
const PNG_DATA_URL_RE = /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/;
const HTTPS_URL_RE = /^https:\/\/[^\s]+$/i;

function assertExePath(exePath: unknown): asserts exePath is string {
    if (typeof exePath !== "string" || !exePath || exePath.length > 32767) throw new Error("bad exe path");
    if (exePath.includes("\0") || !/^[A-Za-z]:[\\/]/.test(exePath) || !/\.exe$/i.test(exePath)) throw new Error("bad exe path");
    for (const seg of exePath.replace(/\//g, "\\").split("\\").slice(1)) {
        if (!seg || seg === "." || seg === ".." || /[<>:"|?*\x00-\x1f]/.test(seg)) throw new Error("bad exe path");
    }
}

function assertImageSource(url: unknown): asserts url is string {
    if (typeof url !== "string" || !url) throw new Error("bad image url");
    const ok = url.length <= 2000000 && PNG_DATA_URL_RE.test(url)
        || url.length <= 2048 && HTTPS_URL_RE.test(url);
    if (!ok) throw new Error("bad image url");
}

export async function getExeIcon(_: IpcMainInvokeEvent, exePath: string) {
    assertExePath(exePath);
    const icon = await app.getFileIcon(exePath, { size: "large" });
    if (icon.isEmpty()) throw new Error("exe has no icon");
    return icon.toDataURL();
}

export async function uploadTempHost(_: IpcMainInvokeEvent, dataUrl: string, fileName: string) {
    assertImageSource(dataUrl);
    const safe = fileName.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-+/, "").slice(0, 64) || "icon";
    const name = safe.endsWith(".png") ? safe : `${safe}.png`;

    const base64 = dataUrl.split(",", 2)[1];
    const bytes = base64 ? Buffer.from(base64, "base64") : Buffer.alloc(0);
    if (!bytes.length || bytes.length > 8000000) throw new Error("bad icon payload");

    const form = new FormData();
    form.set("reqtype", "fileupload");
    form.set("fileToUpload", new Blob([bytes], { type: "image/png" }), name);
    const res = await fetch("https://catbox.moe/user/api.php", { method: "POST", body: form });
    if (!res.ok) throw new Error(`catbox upload failed: HTTP ${res.status}`);
    const link = (await res.text()).trim();
    if (!HTTPS_URL_RE.test(link) || link.length > 512) throw new Error("catbox returned no link");
    return link;
}

export async function uploadExternalAsset(_: IpcMainInvokeEvent, appId: string, url: string, token: string) {
    if (!APP_ID_RE.test(appId ?? "")) throw new Error("bad app id");
    assertImageSource(url);
    if (typeof token !== "string" || token.length < 20) throw new Error("bad token");

    const res = await fetch(`https://discord.com/api/v9/applications/${appId}/external-assets`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: token },
        body: JSON.stringify({ urls: [url] })
    });
    if (!res.ok) throw new Error(`external-assets failed: HTTP ${res.status}`);
    const body = await res.json();
    const raw = Array.isArray(body) ? body[0]?.external_asset_path : undefined;
    if (typeof raw !== "string" || !raw) throw new Error("no asset path in response");
    const path = raw.startsWith("mp:") ? raw : `mp:${raw}`;
    if (!path.startsWith("mp:external/") && !path.startsWith("mp:attachments/")) throw new Error("unexpected asset path");
    return path;
}
