import { revalidateTag } from "next/cache";
import { handlePublicCacheInvalidation } from "@/server/public-cache/endpoint";
import { publicCacheTag } from "@/server/public-cache/policy";

export async function POST(request: Request) {
  return handlePublicCacheInvalidation(request, process.env, scope => {
    revalidateTag(publicCacheTag(scope), { expire: 0 });
  });
}
