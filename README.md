# ActivityHub

ActivityHub is a planned web tool for collecting, organizing, scoring, reviewing, and exporting commercial real estate and related industry event intelligence.

The V1 product focuses on helping market and operations teams turn scattered event information into a structured activity list and a Word/PDF-style sales activity report.

## Project Status

Current status: **PRD confirmed, implementation not started**.

This repository currently contains product documentation only. No application code, framework setup, scraper, AI integration, or report generation implementation has been created yet.

## Target Users

Primary users:

- Market and operations team members who collect, review, and prepare event intelligence.

Secondary users:

- Sales teams and sales managers who read the exported report to assess event participation and potential lead-generation opportunities.

## V1 Scope

ActivityHub V1 is designed to:

- Discover relevant events from public web pages and search results.
- Organize candidate events into a structured list.
- Score candidate events using transparent rules.
- Let users manually review, edit, exclude, and select events.
- Generate a Word/PDF-style event report for sales or management review.
- Save historical event records, collection batches, and generated reports.
- Merge duplicate events discovered from multiple sources.

V1 prioritizes commercial real estate and adjacent topics, including:

- Commercial real estate
- REITs
- Office leasing
- PropTech
- Smart buildings
- Facilities management
- Asset management
- Industrial finance
- Smart parks
- Corporate real estate

The default event time window is the next 90 days.

## V1 Workflow

1. A user starts a new event collection batch.
2. The system collects candidate events from public web sources and keyword search.
3. The system extracts structured event information.
4. The system applies rule-based scoring and displays score reasons.
5. The system identifies expired events and merges likely duplicates.
6. The user reviews the candidate pool.
7. The user edits event details where needed.
8. The user manually selects events for the report.
9. The system generates a report preview.
10. The user exports a Word/PDF-style activity report.

## Core Features

Must-have V1 capabilities:

- On-demand event collection.
- Candidate event list.
- Event editing and deletion.
- Manual event selection for reports.
- Rule-based scoring with visible reasons.
- Expired event detection.
- Duplicate event merging.
- Historical event and report storage.
- Word/PDF-style report generation.

## Rule Scoring

V1 does not use AI API calls or AI-based judgment.

The system only uses transparent rule scoring. Scores help users sort and review candidates, but they do not decide the final recommendation.

Scoring dimensions include:

- Topic relevance.
- Organizer importance.
- Key city match.
- Sales lead-generation value.
- Information completeness.
- Event time validity.

Each score should be shown with:

- Total score.
- Matched tags.
- Score reasons.
- Missing information warnings.

Final inclusion in the sales report is always confirmed manually by the user.

## Report Output

The V1 report should follow a Word/PDF-style format.

Recommended report structure:

- Opening summary.
- Activity scope and time window.
- Recommendation principles.
- Activity count summary.
- TOPIC 1 / 2 / 3 groupings.
- Event cards under each topic.

Each event card should include:

- Event name.
- Event poster.
- Location.
- Time.
- Registration link.
- Event introduction.
- Notes / recommendation reason.

Recommendation reasons come from rule-score matches and user-entered notes, not AI-generated text.

## Data Persistence

V1 should save:

- Event records.
- Source records.
- Collection batches.
- Rule scoring results.
- User-edited fields.
- Inclusion or exclusion status.
- Generated report records.

This enables historical review, duplicate detection, and long-term event library building.

## Deduplication

When the same event appears from multiple sources, V1 should merge candidates automatically when confidence is high.

Deduplication may consider:

- Similar event names.
- Same or close event time.
- Same or close city/location.
- Same registration link.
- Same source destination.
- Similar poster or title.

Merged records should preserve multiple sources and should not overwrite fields manually edited by users.

## Explicit Non-Goals

V1 will not include:

- AI API integration.
- AI-generated recommendation reasons.
- Final automatic recommendation to sales.
- Automatic report sending.
- Automatic event registration.
- CRM integration.
- Sales task assignment.
- ROI tracking.
- Multi-user permission management.
- Collection methods that bypass platform login, access control, anti-scraping rules, or other restrictions.

## Product Requirement Document

See [PRD.md](./PRD.md) for the confirmed V1 product requirements.
