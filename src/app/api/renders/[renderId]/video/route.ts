// SPDX-License-Identifier: Apache-2.0

import { z } from "zod";

import { parseByteRange } from "@/lib/video/http-range";
import type { StoredVideo } from "@/lib/video/types";

type Context = { params: Promise<{ renderId: string }> };
export type MediaDependencies = Readonly<{
  library: { readVideo(renderId: string): Promise<StoredVideo | null> };
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
    return Response.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }
  if (!stored) return Response.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    await stored.handle.close().catch(() => undefined);
  };
  if (!Number.isSafeInteger(stored.size) || stored.size <= 0) {
    await close();
    return Response.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }
  const rangeHeader = request.headers.get("range");
  const range = rangeHeader ? parseByteRange(rangeHeader, stored.size) : { start: 0, end: stored.size - 1 };
  if (!range) {
    await close();
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
    await close();
    return new Response(null, { status: rangeHeader ? 206 : 200, headers });
  }

  let position = range.start;
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (position > range.end) {
        await close();
        controller.close();
        return;
      }
      const buffer = Buffer.allocUnsafe(Math.min(64 * 1024, range.end - position + 1));
      try {
        const { bytesRead } = await stored.handle.read(buffer, 0, buffer.length, position);
        if (bytesRead === 0) {
          await close();
          controller.error(new Error("Video artifact ended unexpectedly"));
          return;
        }
        position += bytesRead;
        controller.enqueue(new Uint8Array(buffer.buffer, buffer.byteOffset, bytesRead));
        if (position > range.end) {
          await close();
          controller.close();
        }
      } catch (error) {
        await close();
        controller.error(error);
      }
    },
    async cancel() { await close(); },
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
