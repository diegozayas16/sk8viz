// Reads a request body while enforcing a byte limit as data arrives, so
// oversized uploads are rejected without buffering them and without relying
// on a Content-Length header.

export type ReadBodyResult = { ok: true; bytes: Uint8Array } | { ok: false; reason: 'too_large' | 'empty' };

export async function readLimitedBody(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<ReadBodyResult> {
  if (!body) return { ok: false, reason: 'empty' };

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return { ok: false, reason: 'too_large' };
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  if (total === 0) return { ok: false, reason: 'empty' };

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, bytes };
}

// Checks the container signature so a mislabeled file is rejected before it
// reaches the model. Content-Type alone is client-controlled.
export function matchesVideoSignature(type: string, bytes: Uint8Array): boolean {
  if (type === 'video/webm') {
    return bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
  }
  // MP4 and QuickTime files start with an ISO base media box whose type is at bytes 4-7.
  const boxType = String.fromCharCode(...bytes.subarray(4, 8));
  return ['ftyp', 'moov', 'mdat', 'wide', 'free', 'skip'].includes(boxType);
}
