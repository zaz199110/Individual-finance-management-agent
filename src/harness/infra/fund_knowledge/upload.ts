import fs from "node:fs";
import path from "node:path";
import { ALL_DOC_TYPES } from "./doc-types";
import {
  buildUploadFrontmatter,
  convertUploadFileToMarkdown,
  isFkFmtExtension,
} from "./fmt-convert";
import {
  ensureVaultDocTypeDirs,
  hashFile,
  indexSingleFile,
  isIndexBusy,
  sha256Content,
} from "./index-db";
import { convertPdfFile } from "./pdf-convert";
import {
  fundNameSourceLabel,
  resolveFundChineseName,
  type FundNameSource,
} from "./fund-name-resolve";
import { resolveVaultDirForFund, vaultDirName } from "./vault-slug";

export interface UploadFileResult {
  source_filename: string;
  status: "success" | "failed" | "skipped_unchanged";
  md_path?: string;
  raw_path?: string;
  chunk_count?: number;
  chunk_ids?: string[];
  vault_created?: boolean;
  conversion_method?: "text" | "ocr" | "mixed";
  page_count?: number;
  error?: string;
}

export async function uploadFundKnowledgeFiles(input: {
  vaultRoot: string;
  fund_code: string;
  doc_type: string;
  files: Array<{ filename: string; buffer: Buffer }>;
  fund_name_override?: string;
}): Promise<{
  results: UploadFileResult[];
  summary: { success: number; failed: number; skipped_unchanged: number };
  vault_dir?: string;
  fund_name?: string;
  fund_name_source?: FundNameSource;
  fund_name_source_label?: string;
}> {
  const fundCode = input.fund_code.trim();
  if (!/^\d{6}$/.test(fundCode)) {
    throw new Error("ERR-FK-UPLOAD-INVALID");
  }
  if (!ALL_DOC_TYPES.includes(input.doc_type as (typeof ALL_DOC_TYPES)[number])) {
    throw new Error("ERR-FK-UPLOAD-INVALID");
  }
  if (!input.files.length || input.files.length > 20) {
    throw new Error("ERR-FK-UPLOAD-INVALID");
  }
  if (isIndexBusy(fundCode)) {
    throw new Error("ERR-FK-INDEX-BUSY");
  }

  let resolvedName: Awaited<ReturnType<typeof resolveFundChineseName>> | undefined;
  let dirName: string;
  let fundDir: string;
  let vaultCreated: boolean;

  const existing = resolveVaultDirForFund(input.vaultRoot, fundCode);
  if (!existing.created) {
    dirName = existing.dirName;
    fundDir = existing.fundDir;
    vaultCreated = false;
  } else {
    resolvedName = await resolveFundChineseName({
      fundCode,
      files: input.files,
      nameOverride: input.fund_name_override,
    });
    dirName = vaultDirName(fundCode, resolvedName.name);
    fundDir = path.join(input.vaultRoot, dirName);
    vaultCreated = true;
  }
  ensureVaultDocTypeDirs(fundDir);

  const results: UploadFileResult[] = [];
  let success = 0;
  let failed = 0;
  let skipped = 0;

  for (const file of input.files) {
    const ext = path.extname(file.filename).toLowerCase();
    if (!isFkFmtExtension(ext)) {
      results.push({
        source_filename: file.filename,
        status: "failed",
        error: "ERR-FK-FORMAT-UNSUPPORTED",
      });
      failed += 1;
      continue;
    }

    const baseName = path.basename(file.filename, ext);
    const safeBase = baseName.replace(/[^\w\u4e00-\u9fff-]+/g, "-").replace(/-+/g, "-");

    function resolveMdPath(): { mdName: string; mdPath: string } {
      let name = `${safeBase}.md`;
      let abs = path.join(fundDir, input.doc_type, name);
      if (fs.existsSync(abs)) {
        const ts = new Date().toISOString().replace(/[:.]/g, "").slice(0, 15);
        name = `${safeBase}-${ts}.md`;
        abs = path.join(fundDir, input.doc_type, name);
      }
      return { mdName: name, mdPath: abs };
    }

    const rawDir = path.join(fundDir, "raw", input.doc_type);
    fs.mkdirSync(rawDir, { recursive: true });
    const rawPath = path.join(rawDir, file.filename);
    fs.writeFileSync(rawPath, file.buffer);

    let conversionMethod: UploadFileResult["conversion_method"] = "text";
    let pageCount: number | undefined;
    const { mdName, mdPath } = resolveMdPath();
    const relMd = `${dirName}/${input.doc_type}/${mdName}`.replace(/\\/g, "/");

    if (ext === ".pdf") {
      const converted = await convertPdfFile({
        pdfPath: rawPath,
        outputMdPath: mdPath,
        fundCode,
        docType: input.doc_type,
        sourceFilename: file.filename,
      });
      if (!converted.ok) {
        results.push({
          source_filename: file.filename,
          status: "failed",
          error: converted.error ?? "ERR-FK-CONVERT-FAILED",
        });
        failed += 1;
        continue;
      }
      conversionMethod = converted.conversion_method ?? "text";
      pageCount = converted.page_count;
    } else {
      const converted = await convertUploadFileToMarkdown({
        ext,
        buffer: file.buffer,
        filename: file.filename,
      });
      if (!converted.ok || !converted.markdown) {
        results.push({
          source_filename: file.filename,
          status: "failed",
          error: converted.error ?? "ERR-FK-CONVERT-FAILED",
        });
        failed += 1;
        continue;
      }
      conversionMethod = converted.conversion_method ?? "text";
      const body =
        ext === ".md" && converted.markdown.startsWith("---\n")
          ? converted.markdown
          : `${buildUploadFrontmatter({
              fundCode,
              docType: input.doc_type,
              sourceFilename: file.filename,
              sourceFormat: ext.slice(1),
              conversionMethod,
            })}${converted.markdown}`;

      try {
        if (fs.existsSync(mdPath) && hashFile(mdPath) === sha256Content(body)) {
          const indexResult = indexSingleFile({
            vaultRoot: input.vaultRoot,
            relativePath: relMd,
            logType: "upload",
            fund_code: fundCode,
          });
          results.push({
            source_filename: file.filename,
            status: "skipped_unchanged",
            md_path: relMd,
            chunk_count: indexResult.chunk_count || undefined,
            chunk_ids: indexResult.chunk_ids.length ? indexResult.chunk_ids : undefined,
            vault_created: vaultCreated,
            conversion_method: conversionMethod,
          });
          skipped += 1;
          continue;
        }
      } catch {
        /* write new */
      }

      fs.writeFileSync(mdPath, body, "utf8");
    }

    try {
      const indexResult = indexSingleFile({
        vaultRoot: input.vaultRoot,
        relativePath: relMd,
        logType: "upload",
        fund_code: fundCode,
      });

      results.push({
        source_filename: file.filename,
        status: "success",
        md_path: relMd,
        raw_path: `${dirName}/raw/${input.doc_type}/${file.filename}`.replace(/\\/g, "/"),
        chunk_count: indexResult.chunk_count,
        chunk_ids: indexResult.chunk_ids,
        vault_created: vaultCreated,
        conversion_method: conversionMethod,
        page_count: pageCount,
      });
      success += 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // indexSingleFile already logged the failure via appendMaintenanceLog
      results.push({
        source_filename: file.filename,
        status: "failed",
        error: msg,
      });
      failed += 1;
    }
  }

  return {
    results,
    summary: { success, failed, skipped_unchanged: skipped },
    vault_dir: dirName,
    fund_name: resolvedName?.name,
    fund_name_source: resolvedName?.source,
    fund_name_source_label: resolvedName
      ? fundNameSourceLabel(resolvedName.source)
      : undefined,
  };
}
