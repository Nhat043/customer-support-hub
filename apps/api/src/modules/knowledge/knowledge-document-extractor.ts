import { BadRequestException, Injectable } from "@nestjs/common";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

export const MAX_KNOWLEDGE_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_KNOWLEDGE_TEXT_CHARACTERS = 512_000;

const supportedExtensions = new Set([".md", ".pdf", ".docx"]);

export type UploadedKnowledgeFile = {
  originalname: string;
  size: number;
  buffer: Buffer;
};

export type ExtractedKnowledgeDocument = {
  fileName: string;
  content: string;
};

@Injectable()
export class KnowledgeDocumentExtractor {
  async extract(file: UploadedKnowledgeFile): Promise<ExtractedKnowledgeDocument> {
    const fileName = file.originalname.trim();
    const extension = extensionOf(fileName);
    if (!supportedExtensions.has(extension)) {
      throw new BadRequestException("Choose a Markdown (.md), PDF (.pdf), or Word (.docx) guide.");
    }
    if (!file.buffer.length || !file.size) {
      throw new BadRequestException("Knowledge document cannot be empty.");
    }
    if (file.size > MAX_KNOWLEDGE_FILE_BYTES || file.buffer.length > MAX_KNOWLEDGE_FILE_BYTES) {
      throw new BadRequestException("Knowledge documents must be 10 MB or smaller.");
    }

    try {
      const content = normalizeExtractedText(await this.extractByExtension(extension, file.buffer));
      if (!content) {
        throw new BadRequestException("No readable text was found. Scanned PDFs need OCR before they can be indexed.");
      }
      if (content.length > MAX_KNOWLEDGE_TEXT_CHARACTERS) {
        throw new BadRequestException("The extracted text is too large to index. Split the guide into smaller documents.");
      }
      return { fileName, content };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException("This document could not be read. Check that it is a valid, unencrypted file.");
    }
  }

  protected async extractByExtension(extension: string, buffer: Buffer) {
    if (extension === ".md") return buffer.toString("utf8");
    if (extension === ".pdf") return this.extractPdf(buffer);
    return this.extractDocx(buffer);
  }

  protected async extractPdf(buffer: Buffer) {
    const parser = new PDFParse({ data: buffer });
    try {
      return (await parser.getText()).text;
    } finally {
      await parser.destroy();
    }
  }

  protected async extractDocx(buffer: Buffer) {
    return (await mammoth.extractRawText({ buffer })).value;
  }
}

function extensionOf(fileName: string) {
  const index = fileName.lastIndexOf(".");
  return index >= 0 ? fileName.slice(index).toLowerCase() : "";
}

function normalizeExtractedText(value: string) {
  return value.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
