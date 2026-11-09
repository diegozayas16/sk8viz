import { BlobNotFoundError, del, get } from '@vercel/blob';
import type { ClipStore, StoredClipRead } from '../types.ts';
import { readLimitedBody } from '../readBody.ts';

// Clips are uploaded as private blobs, so they can only be read with the
// store's credentials. Lookups use the pathname (not a client-supplied URL),
// so a request can never make the server fetch from another store or host.
//
// token: a read-write token, or null to let the SDK use Vercel's OIDC login
// with BLOB_STORE_ID (how newer store connections are set up).
export function createBlobClipStore(token: string | null): ClipStore {
  const auth = token ? { token } : {};
  return {
    async read(pathname, maxBytes, signal): Promise<StoredClipRead> {
      let result;
      try {
        result = await get(pathname, { access: 'private', ...auth, useCache: false, abortSignal: signal });
      } catch (error) {
        if (error instanceof BlobNotFoundError) return { ok: false, reason: 'not_found' };
        return { ok: false, reason: 'unavailable' };
      }
      if (!result || result.statusCode !== 200) return { ok: false, reason: 'not_found' };
      if (result.blob.size > maxBytes) {
        await result.stream.cancel().catch(() => {});
        return { ok: false, reason: 'too_large' };
      }
      let body;
      try {
        body = await readLimitedBody(result.stream, maxBytes);
      } catch {
        return { ok: false, reason: 'unavailable' };
      }
      if (!body.ok) return body;
      return { ok: true, bytes: body.bytes, contentType: result.blob.contentType };
    },

    async delete(pathname) {
      await del(pathname, auth);
    },
  };
}
