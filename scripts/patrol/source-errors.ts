const VALIDATION_MESSAGES = {
  "channel-data-missing": "YouTube page is missing its expected JSON data",
  "video-data-missing": "YouTube video is missing its expected JSON data",
  "invalid-json": "YouTube page contains invalid JSON data",
  "channel-mismatch": "YouTube page does not identify the official channel",
  "tab-missing": "YouTube page does not contain the requested channel tab",
  "grid-empty": "YouTube channel video grid is missing or empty",
  "grid-unrecognized": "YouTube channel grid contains no recognizable videos",
  "video-link-mismatch": "YouTube channel entry has an invalid video ID",
  "video-details-missing": "YouTube video does not match: player identity metadata is missing",
  "video-channel-mismatch": "YouTube video does not match the official channel",
  "video-episode-mismatch": "YouTube video does not match the expected video and program episode",
  "publication-time-missing": "YouTube video is missing an exact publication timestamp",
  "episodes-missing": "YouTube channel pages contain no matching main episodes",
} as const;

/** Fixed diagnostics only: never include fetched HTML or JSON in a report. */
export class SourceValidationError extends Error {
  constructor(readonly code: keyof typeof VALIDATION_MESSAGES) {
    super(VALIDATION_MESSAGES[code]);
    this.name = "SourceValidationError";
  }
}
