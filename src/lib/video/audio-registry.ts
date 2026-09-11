// SPDX-License-Identifier: Apache-2.0

import manifest from "../../../assets/audio/MANIFEST.json";

export type AudioEntry = Readonly<{
  name: string;
  file: string;
  licence: string;
  source: string;
  category?: string;
  loudnessLufs?: number;
}>;

function freezeNames(entries: readonly AudioEntry[]): readonly [string, ...string[]] {
  const names = entries.map((entry) => entry.name);
  if (names.length === 0) throw new Error("audio manifest entry list must not be empty");
  if (new Set(names).size !== names.length) throw new Error("audio manifest names must be unique");
  return Object.freeze(names) as [string, ...string[]];
}

export const MUSIC: readonly AudioEntry[] = Object.freeze(
  (manifest.music as readonly AudioEntry[]).map((entry) => Object.freeze(entry)),
);
export const SFX: readonly AudioEntry[] = Object.freeze(
  (manifest.sfx as readonly AudioEntry[]).map((entry) => Object.freeze(entry)),
);

export const MUSIC_NAMES = freezeNames(MUSIC);
export const SFX_NAMES = freezeNames(SFX);

const musicByName = new Map(MUSIC.map((entry) => [entry.name, entry]));
const sfxByName = new Map(SFX.map((entry) => [entry.name, entry]));

function resolveEntryPath(
  entry: AudioEntry | undefined,
  kind: string,
  name: string,
  assetsRoot: string,
): string {
  if (!entry) throw new Error(`unknown ${kind} name: ${name}`);
  if (entry.file.includes("..") || entry.file.startsWith("/") || entry.file.startsWith("\\")) {
    throw new Error(`unsafe ${kind} path: ${entry.file}`);
  }
  const root = assetsRoot.endsWith("/") ? assetsRoot.slice(0, -1) : assetsRoot;
  return `${root}/${entry.file}`;
}

function rejectTraversal(kind: string, name: string): void {
  if (name.includes("/") || name.includes("\\") || name.includes("..")) {
    throw new Error(`unsafe ${kind} name: ${name}`);
  }
}

export function resolveMusicPath(name: string, assetsRoot: string): string {
  rejectTraversal("music", name);
  return resolveEntryPath(musicByName.get(name), "music", name, assetsRoot);
}

export function resolveSfxPath(name: string, assetsRoot: string): string {
  rejectTraversal("sfx", name);
  return resolveEntryPath(sfxByName.get(name), "sfx", name, assetsRoot);
}
