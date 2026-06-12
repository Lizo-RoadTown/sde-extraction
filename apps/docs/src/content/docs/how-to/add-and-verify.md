---
title: Add a paper & verify it
description: The end-to-end user motion — add a PDF, extract, and verify the result.
---

The dashboard's **Papers** surface is one motion: add a paper, then verify what the engine
extracted.

1. **Add.** Drop a PDF (or click to browse). It is fingerprinted (SHA-256) on upload and
   stored.
2. **Target.** Choose what the engine should extract — see
   [targeting modes](/reference/targeting/).
3. **Extract.** This enqueues a job. The [worker](/reference/pipeline/) picks it up.
4. **Verify.** When the extraction is ready it appears in your papers list marked *needs
   review*. Open it to inspect each slot — present or absent — against the source PDF, and
   confirm or correct.

A verified extraction enters the Library.

:::note
Verification requires being signed in. Until a real extraction has been run, items will not
appear; see [Run the extraction worker](/how-to/run-worker/).
:::
