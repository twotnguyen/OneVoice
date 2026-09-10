// SPDX-License-Identifier: Apache-2.0

import path from "node:path";

export function resolveExecutablePath(value: string, cwd = process.cwd()): string {
  if (path.isAbsolute(value) || (!value.includes("/") && !value.includes("\\"))) return value;
  return path.resolve(cwd, value);
}
