# Avenquellis production verification

The following checks used a fresh Chrome profile against [the public Cloudflare Pages site](https://avenquellis.pages.dev/). The production deployment tested was [9e86c0c0](https://9e86c0c0.avenquellis.pages.dev/).

| Path through the student interface | Observed result |
| --- | --- |
| Forge one CMI proof question, assemble an 18-question mixed mock, and start a 12-question Test Arena mock | All three API responses identified the C++ engine. Every field matched the installed native CLI output given the same options and seed. |
| Assemble a six-question RMO number-theory section and open its first proof | All six question IDs matched the CLI fixture. The proof field accepted a photo. Numeric fields did not offer the handwriting control. |
| Upload the supplied gcd sample, request transcription, inspect it and add the reviewed answer | Transcription alone left the answer empty. The reviewed answer survived question navigation, submission and reopening the original answer in Proof Studio. |
| Submit a complete divisibility certificate in the same timed test | The native checker awarded 10/10. In a separate preview run an incomplete gcd certificate earned a verified lower bound of 4/10. |
| Request hosted readings of the corrected gcd proof | Both proposed 10/10. C++ validated their proposals and the final score stayed unset. |
| Submit only the forward gcd inclusion in ordinary prose | Both readers awarded 4/10, matching the authored criterion. The other two criteria received no points and the final score stayed unset. This is a controlled example, not a human-examiner benchmark. |

A separate transcription check on a genuine Leibniz manuscript crop returned the published arithmetic line `1 + 3 + 5 + 7 + 9 = 25 - 0 = 25` exactly. This single line does not establish recognition accuracy for full pages, diagrams or unfamiliar handwriting. The historical crop and research annotation are not distributed with the application. [Hannover library record](https://digitale-sammlungen.gwlb.de/resolve?id=00068086) · [HME-Leibniz reference dataset](https://doi.org/10.5281/zenodo.18804566)

The hosted review policy used for students abstained on six unseen USAMO research responses and five separate human-scored IMO-GradingBench responses, including three partial proofs. These evaluation cases are distinct from our authored smoke tests. [Human comparison and scope](https://avenquellis.pages.dev/#sources) · [Private benchmark evidence](https://github.com/TARUNTEjjjj/avenquellis-proof-grader/tree/main/benchmark/evidence)
