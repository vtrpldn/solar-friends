// Snapshot lengths use JavaScript UTF-16 code units, not encoded file bytes.
// A backup can contain two snapshot strings of 16 Mi code units each. Escaping
// whitespace/quotes expands them, and the frozen scenario adds its own data.
// Keep the upload envelope separate from native snapshot/package limits.
export const MAX_VILLAGE_SNAPSHOT_CHARACTERS=16*1024*1024;
export const MAX_RECOVERY_FILE_BYTES=96*1024*1024;
