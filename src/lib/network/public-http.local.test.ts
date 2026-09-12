import { expect, it } from "vitest";
import { fetchPublicText } from "./public-http";

// Explicit opt-in: public metadata reads only, never credentials or database access.
it.skipIf(process.env.ONEVOICE_PUBLIC_HTTP_PROOF!=="1")("reads real public Mastodon JSON and NASA RSS through the guarded transport",async()=>{
 const social=await fetchPublicText("https://mastodon.social/api/v1/trends/tags?limit=2");
 expect(Array.isArray(JSON.parse(social.text))).toBe(true);
 expect(social.finalUrl).toContain("https://mastodon.social/");
 const rss=await fetchPublicText("https://www.nasa.gov/news-release/feed/");
 expect(rss.text).toContain("<rss");
 expect(rss.text).toContain("<item>");
},20000);
