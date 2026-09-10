// SPDX-License-Identifier: Apache-2.0

import type { GenerateTextResult } from "@/lib/ai/provider";

export type GeneratedProductContent = Readonly<{
  hook: string;
  caption: string;
  cta: string;
  model: string;
  responseId?: string;
  usage?: GenerateTextResult["usage"];
}>;
