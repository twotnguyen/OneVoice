// SPDX-License-Identifier: Apache-2.0

import { VideoStudio } from "../video-studio";
import { requirePagePermission } from "@/lib/auth/guards";

export default async function Home() {
  await requirePagePermission("manage_marketing", "/");
  return <VideoStudio />;
}
