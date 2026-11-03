# Official archive catalog verification

Verified on 3 November 2026 using official pages and the linked PDFs. `dist/archive.json` contains 16 papers and 62 chapter references covering algebra, number theory, combinatorics, geometry, calculus and probability. References contain editorial descriptions, not full question text. External question documents remain with their publishers; this catalog does not grant reproduction rights.

## Data contract

- `sources`: official directory links.
- `papers`: `{id, exam, year, title, url, sourceDirectory, kind, label, durationMinutes, questionCount, maxMarks, notes}`. Some entries include `sections` or a verified PDF `pageCount`.
- `questionReferences`: `{id, paperId, exam, year, questionNumber, topic, title, type, maxMarks, url, page, sourceKind, sourceLabel, statementMode, notes}`.
- `null` means the linked document did not establish the value. Do not silently convert unknown durations or marks into official exam values. A user-selected practice duration may be stored separately.
- `questionNumber` values such as `A2` refer to Part A, question 2. ISI `Q1` and RMO `Q1` refer to the document's numbered problem 1. CMI grouped references are deliberately grouped where a shared setup applies.

## Sources and important distinctions

[CMI syllabus and past papers](https://www.cmi.ac.in/admissions/syllabus.php) identifies the undergraduate papers and class-12-level scope. The web reader initially duplicated `/admissions/` while resolving relative PDF links. Direct URLs with one `/admissions/` were opened successfully and verified. The PDF names retain `ugmath` although the current directory calls the course BS (Hons).

The 2021 CMI PDF prints 180 minutes. The two 2022 papers and the 2023 PDF print 210 minutes. The inspected 2024 and 2025 PDFs do not print a total exam duration, so those durations are null. 2024 has 21 independently graded Part A questions, starting at number 2, plus six Part B problems. 2025 has 17 Part A questions, also starting at number 2, plus six Part B problems. The 2021–2023 counts treat each multi-statement Part A group as one question. These are different formats and should not be represented as identical mocks.

[ISI B.Stat syllabus and sample questions](https://admission.isical.ac.in/Programs/BStat.html) explicitly calls its 2021–2024 UGA/UGB documents “Sample Questions.” The 2021–2024 UGB documents contain 8, 9, 8 and 8 questions respectively. Those four PDFs omit exam duration and marks. Do not label these sample sets as verified past examination papers solely because the URL directory is `PreviousQuestion`.

[HBCSE past papers](https://olympiads.hbcse.tifr.res.in/past-papers-sample-questions/) links to the listed RMO 2019, 2023, 2024 and 2025 documents. The live directory now links these older documents under a `2026/10` upload path; preserve the actual verified URLs. RMO 2023 and RMO 2025 both print 180 minutes and 102 total marks for six equal-weight questions (17 each). RMO 2024's linked document contains both problems and official solutions. It establishes six problems, but does not give exam time or maximum marks, so those are null. Showing that PDF during an exam reveals solutions; the interface should label it accordingly.

A timed archive companion can display references and an answer workspace while the student opens the original PDF. Such sessions should be described as “official-paper companion” or “sample-paper companion,” not as a digitized reproduction of all paper questions. Topic labels are editorial classifications. Difficulty levels are not supplied because the publishers did not give them.

## Catalog additions checked on 3 November 2026

The CMI undergraduate index ends at 2025. The 2026 entries on the same page belong to postgraduate programs. ISI's undergraduate sample index lists 2026 and then 2024. The catalog preserves those published years. The HBCSE mathematics table lists IOQM 2022–23 and INMO 2023 in the corresponding row, with no RMO 2022 paper linked there. [CMI index](https://www.cmi.ac.in/admissions/syllabus.php) · [ISI index](https://admission.isical.ac.in/Programs/BStat.html) · [HBCSE index](https://olympiads.hbcse.tifr.res.in/past-papers-sample-questions/)

- ISI UGA 2026 has three pages and 30 objective questions. Group A contains 20 single-choice items. Group B restarts numbering and contains 10 items with potentially multiple correct options. Six chapter references identify the group, question number, and PDF page. The document omits marks and duration. [UGA sample PDF](https://admission.isical.ac.in/PreviousQuestion/BStat-BMath-UGA-2026.pdf)
- ISI UGB 2026 has two pages and eight written problems, each labeled 10 points. The catalog totals those labels to 80 marks and indexes all eight problems. Questions 1–6 begin on page 1 and questions 7–8 begin on page 2. The document omits duration. [UGB sample PDF](https://admission.isical.ac.in/PreviousQuestion/BStat-BMath-UGB-2026.pdf)
- RMO 2019 has one page and six problems. The instructions give three hours and 102 marks distributed equally, so each reference records 17 marks. All six references point to page 1. [RMO 2019 paper](https://olympiads.hbcse.tifr.res.in/wp-content/uploads/2026/10/rmoengfirst2019.pdf)
