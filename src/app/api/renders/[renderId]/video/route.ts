// SPDX-License-Identifier: Apache-2.0

import { z } from "zod";

import { parseByteRange } from "@/lib/video/http-range";
import type { StoredVideo } from "@/lib/video/types";
import { defaultDiagnosticSink, type DiagnosticSink } from "@/lib/render/diagnostics";

type Context = { params: Promise<{ renderId: string }> };
export type MediaDependencies = Readonly<{
  library: { readVideo(renderId: string): Promise<StoredVideo | null> };
  diagnostic?: DiagnosticSink;
}>;

const commonHeaders = {
  "Accept-Ranges": "bytes",
  "Cache-Control": "private, no-store",
  "Content-Type": "video/mp4",
  "X-Content-Type-Options": "nosniff",
};

async function mediaResponse(
  dependencies: MediaDependencies,
  request: Request,
  context: Context,
  attachment: boolean,
): Promise<Response> {
  const parsedId = z.uuid().safeParse((await context.params).renderId);
  if (!parsedId.success) return Response.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  let stored: StoredVideo | null;
  try {
    stored = await dependencies.library.readVideo(parsedId.data);
  } catch {
    (dependencies.diagnostic ?? defaultDiagnosticSink)({ stage: "media", code: "STORAGE_UNAVAILABLE" });
    return Response.json({ error: { code: "STORAGE_UNAVAILABLE" } }, { status: 500 });
  }
  if (!stored) return Response.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  const diagnostic = dependencies.diagnostic ?? defaultDiagnosticSink;
  let closePromise: Promise<void> | undefined;
  const close = () => closePromise ??= Promise.resolve().then(() => stored.handle.close());
  const closeBeforeResponse = async (): Promise<boolean> => {
    try {
      await close();
      return true;
    } catch {
      diagnostic({ stage: "media", code: "CLOSE_FAILED" });
      return false;
    }
  };
  if (!Number.isSafeInteger(stored.size) || stored.size <= 0) {
    await closeBeforeResponse();
    diagnostic({ stage: "media", code: "STORAGE_UNAVAILABLE" });
    return Response.json({ error: { code: "STORAGE_UNAVAILABLE" } }, { status: 500 });
  }
  const rangeHeader = request.headers.get("range");
  const range = rangeHeader ? parseByteRange(rangeHeader, stored.size) : { start: 0, end: stored.size - 1 };
  if (!range) {
    if (!(await closeBeforeResponse())) return Response.json({ error: { code: "STORAGE_UNAVAILABLE" } }, { status: 500 });
    return new Response(null, {
      status: 416,
      headers: { ...commonHeaders, "Content-Range": `bytes */${stored.size}` },
    });
  }

  const length = range.end - range.start + 1;
  const headers: Record<string, string> = {
    ...commonHeaders,
    "Content-Length": String(length),
    ...(rangeHeader ? { "Content-Range": `bytes ${range.start}-${range.end}/${stored.size}` } : {}),
    ...(attachment
      ? { "Content-Disposition": `attachment; filename="onevoice-${parsedId.data}.mp4"` }
      : {}),
  };
  if (request.method === "HEAD") {
    if (!(await closeBeforeResponse())) return Response.json({ error: { code: "STORAGE_UNAVAILABLE" } }, { status: 500 });
    return new Response(null, { status: rangeHeader ? 206 : 200, headers });
  }

  let position = range.start;
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (position > range.end) {
        if (await closeBeforeResponse()) controller.close();
        else controller.error(new Error("Video stream unavailable"));
        return;
      }
      const buffer = Buffer.allocUnsafe(Math.min(64 * 1024, range.end - position + 1));
      try {
        const { bytesRead } = await stored.handle.read(buffer, 0, buffer.length, position);
        if (bytesRead === 0) {
          await closeBeforeResponse();
          controller.error(new Error("Video artifact ended unexpectedly"));
          return;
        }
        position += bytesRead;
        controller.enqueue(new Uint8Array(buffer.buffer, buffer.byteOffset, bytesRead));
        if (position > range.end) {
          if (await closeBeforeResponse()) controller.close();
          else controller.error(new Error("Video stream unavailable"));
        }
      } catch {
        await closeBeforeResponse();
        controller.error(new Error("Video stream unavailable"));
      }
    },
    async cancel() { await closeBeforeResponse(); },
  });
  return new Response(body, { status: rangeHeader ? 206 : 200, headers });
}

export function createMediaRoute(dependencies: MediaDependencies, attachment: boolean) {
  return {
    GET: (request: Request, context: Context) => mediaResponse(dependencies, request, context, attachment),
    HEAD: (request: Request, context: Context) => mediaResponse(dependencies, request, context, attachment),
  };
}

export function createVideoRoute(dependencies: MediaDependencies) {
  return createMediaRoute(dependencies, false);
}

export async function GET(request: Request, context: Context): Promise<Response> {
  const { getComposition } = await import("@/lib/render/composition-root");
  return createVideoRoute(getComposition()).GET(request, context);
}

export async function HEAD(request: Request, context: Context): Promise<Response> {
  const { getComposition } = await import("@/lib/render/composition-root");
  return createVideoRoute(getComposition()).HEAD(request, context);
}
