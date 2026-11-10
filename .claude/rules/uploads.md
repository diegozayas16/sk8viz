---
paths:
  - "server/uploadHandler.ts"
  - "server/analyzeHandler.ts"
  - "server/services/blobStore.ts"
  - "server/services/gemini.ts"
  - "src/services/analysisClient.ts"
  - "src/hooks/useClipSelection.ts"
  - "src/components/ClipStatus.tsx"
  - "shared/analysis/limits.ts"
---

# Uploads and trimming

- **Two paths.** Clips ≤ 4 MB: POST bytes to `/api/analyze?start=&end=` (Vercel
  rejects bodies > 4.5 MB), sent inline to Gemini. Larger (≤ 100 MB, only when
  `largeUploadsAvailable`): browser uploads to **private** Blob at
  `clips/<uuid>.<ext>`, then `/api/analyze` gets JSON `{ pathname, window }`.
- The server reads by pathname (never a client URL), uses Gemini's Files API,
  and deletes the blob and the Gemini file on every path. `ttlDays` is the backup.
- **Blob auth has two modes.** Vercel's store connection sets only
  `BLOB_STORE_ID` (OIDC); local dev uses `BLOB_READ_WRITE_TOKEN`. Uploads use
  the presigned flow (`handleUploadPresigned` + `issueSignedToken`, browser
  `uploadPresigned`), which works with both. `handleUpload`/`upload` silently
  fail on Vercel. Pass `token` only when set.
- CSP `connect-src` allows `https://vercel.com` for the Blob upload API.
- **Trim window** (max 60 s) is required on every analyze request and sent to
  Gemini as `startOffset`/`endOffset`. The server can't read duration, so it
  enforces window length, which is what bounds cost. Recordings stay ≤ 30 s
  so they always fit the direct path.
