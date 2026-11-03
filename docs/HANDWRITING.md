# Handwritten proof input

In the Avenquellis proof studio, a timed proof, or an official-paper response, open **Add a handwritten page**. Choose a file or use the camera picker on a supported device. The preview is local. Select **Transcribe photo** to send that page to Cloudflare Workers AI. Compare the result against the image, edit it, confirm the symbols, and choose **Add reviewed text to my answer**. Existing typed work remains ahead of the new text. Adding it triggers the ordinary draft-save behavior. Submitting the test or requesting proof review is a separate action.

A photo can contain personal details. Crop to the relevant mathematics before selection. Avenquellis sends the image pixels only to its configured transcription service after an explicit request. The application stores the text the student adds to their answer. It does not store photo files in local drafts, backups or application logs. A hosted model can misread a minus sign, exponent, inequality, line break, diagram or illegible passage. The correction step lets the student decide what to submit.

## Service and limits

The feature uses `@cf/google/gemma-4-26b-a4b-it` through the native `AI` binding and `AVENQUELLIS_HANDWRITING=enabled`. Cloudflare identifies this hosted multimodal model as supporting document OCR and handwritten text. It uses the shared Workers AI free allocation. The published rates are 9,091 neurons per million input tokens and 27,273 per million output tokens. Provider-side image encoding and actual output affect usage. The feature caps completions at 1,400 tokens; it does not measure or claim handwriting-level accuracy. [Cloudflare model release](https://developers.cloudflare.com/changelog/post/2026-04-04-gemma-4-26b-a4b-workers-ai/), [model documentation](https://developers.cloudflare.com/workers-ai/models/gemma-4-26b-a4b-it/), [current model rates and free plan](https://developers.cloudflare.com/workers-ai/platform/pricing/)

- `GET /api/transcribe` reports availability and model ID without performing inference.
- `POST /api/transcribe` accepts one same-origin raw JPEG. The browser previews JPEG/PNG/static WebP sources up to 12 MiB and 24 megapixels, then rasterizes them locally to a JPEG with a 1,600-pixel maximum edge. It strips camera metadata and limits the upload to 1.5 MiB. Large, malformed and unsupported files receive an actionable error.
- The server rejects arbitrary URLs, provider prompts, unsupported MIME types, oversized payloads, nonlocal origins, invalid frame/scan structure and trailing data. Recognized JPEG APP/COM segments are removed before model inference. IP cooldown (one minute) and concurrent slots (two) are per isolate. The endpoint returns noncacheable JSON; a timeout or model error produces no transcription.
- Camera capture uses a user-initiated file picker with `capture="environment"`. Availability depends on the browser and OS; the photo chooser also works on a desktop. The component does not request a continuous camera stream.

## Synthetic verification

The test fixtures are original notebook-style renderings, with a handwriting-style typeface and seeded word jitter. They are not human contestant papers or representative measures of handwriting quality. The independently authored reference text files were fixed before any model call.

1. `tests/fixtures/handwriting/synthetic-even-proof.jpg` contains a parity proof. A real `AI` binding on the Avenquellis preview returned HTTP 200 in 11.11 seconds. It transcribed all five lines, both formulas, and the conclusion. The returned text matched the reference after folding case and removing `$` delimiters. It lowercased the initial `Claim` and added math delimiters, so it was not verbatim. [Reference text](../tests/fixtures/handwriting/synthetic-reference.txt)
2. `tests/fixtures/handwriting/synthetic-gcd10-proof.jpg` exercises the bank question `number-gcd-17s23lf`. Its statement asks for `gcd(n,n + 10) = gcd(n,10)`. The sample establishes both divisor inclusions and equality of their greatest elements. It is designed for the full photo → correct → insert → manual marking flow. [Reference text](../tests/fixtures/handwriting/synthetic-gcd10-reference.txt)

Run `node --test tests/handwriting.test.js` for bounded image parsing, metadata stripping, same-origin admission, nonleaking errors, timeout behavior, quota enforcement and append-without-overwrite checks. These tests use mocked model bindings. The two fixture images stay outside `dist` and are not required by the published app.
