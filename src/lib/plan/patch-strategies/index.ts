import type { ProposeArtifactRow } from "@/lib/profile/artifacts";

export interface PatchStrategy {
  /**
   * Validate the incoming patch body
   * @returns Array of error messages (empty if valid)
   */
  validate(body: unknown, artifact: ProposeArtifactRow): string[];

  /**
   * Merge the patch body into the existing payload
   * @returns Updated payload
   */
  merge(
    existing: Record<string, unknown>,
    body: unknown,
    artifact: ProposeArtifactRow,
  ): Record<string, unknown>;

  /**
   * Optional: Generate warnings for the patch (e.g., allocation mismatch)
   * @returns Array of warning messages
   */
  warnings?(
    existing: Record<string, unknown>,
    body: unknown,
    artifact: ProposeArtifactRow,
  ): string[];
}
