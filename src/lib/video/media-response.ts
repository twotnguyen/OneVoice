// SPDX-License-Identifier: Apache-2.0

import { z } from "zod";

import { defaultDiagnosticSink, type DiagnosticSink } from "@/lib/render/diagnostics";
import { parseByteRange } from "@/lib/video/http-range";
import type { StoredVideo } from "@/lib/video/types";

type Context = { params: Promise<{ renderId: string }> };

export type MediaDependencies = Readonly<{
  library: { readVideo(renderId: string): Promise<StoredVideo | null> };
  diagnostic?: DiagnosticSink;
}>;

const noBodyHeaders = {
  "Accept-Ranges": "bytes",
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
} as const;

const commonHeaders = {
  ...noBodyHeaders,
  "Content-Type": "video/mp4",
} as const;

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
  const media = stored;

  const diagnostic = dependencies.diagnostic ?? defaultDiagnosticSink;
  let closePromise: Promise<void> | undefined;
  const close = () => (closePromise ??= media.close());
  const closeBeforeResponse = async (): Promise<boolean> => {
    try {
      await close();
      return true;
    } catch {
      diagnostic({ stage: "media", code: "CLOSE_FAILED" });
      return false;
    }
  };
  if (!Number.isSafeInteger(media.size) || media.size <= 0) {
    await closeBeforeResponse();
    diagnostic({ stage: "media", code: "STORAGE_UNAVAILABLE" });
    return Response.json({ error: { code: "STORAGE_UNAVAILABLE" } }, { status: 500 });
  }
  const rangeHeader = request.headers.get("range");
  const range = rangeHeader ? parseByteRange(rangeHeader, media.size) : { start: 0, end: media.size - 1 };
  if (!range) {
    if (!(await closeBeforeResponse())) return Response.json({ error: { code: "STORAGE_UNAVAILABLE" } }, { status: 500 });
    return new Response(null, {
      status: 416,
      headers: { ...noBodyHeaders, "Content-Range": `bytes */${media.size}` },
    });
  }

  const length = range.end - range.start + 1;
  const headers: Record<string, string> = {
    ...commonHeaders,
    "Content-Length": String(length),
    ...(rangeHeader ? { "Content-Range": `bytes ${range.start}-${range.end}/${media.size}` } : {}),
    ...(attachment
      ? { "Content-Disposition": `attachment; filename="onevoice-${parsedId.data}.mp4"` }
      : {}),
  };
  if (request.method === "HEAD") {
    if (!(await closeBeforeResponse())) return Response.json({ error: { code: "STORAGE_UNAVAILABLE" } }, { status: 500 });
    return new Response(null, { status: rangeHeader ? 206 : 200, headers });
  }

  const iterator = media.stream(range.start, range.end)[Symbol.asyncIterator]();
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await iterator.next();
        if (done) {
          if (await closeBeforeResponse()) controller.close();
          else controller.error(new Error("Video stream unavailable"));
          return;
        }
        controller.enqueue(value);
      } catch {
        await closeBeforeResponse();
        controller.error(new Error("Video stream unavailable"));
      }
    },
    async cancel() {
      try {
        await iterator.return?.();
      } catch {
        // Best-effort finalisation of the range iterator; the shared close is authoritative.
      }
      await closeBeforeResponse();
    },
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

export function createDownloadRoute(dependencies: MediaDependencies) {
  return createMediaRoute(dependencies, true);
}
