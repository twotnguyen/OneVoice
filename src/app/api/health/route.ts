// SPDX-License-Identifier: Apache-2.0

export async function GET(): Promise<Response> {
  return Response.json(
    {
      status: "ok",
      service: "onevoice",
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
