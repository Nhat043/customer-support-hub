import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException } from "@nestjs/common";
import {
  KnowledgeDocumentExtractor,
  MAX_KNOWLEDGE_FILE_BYTES,
} from "../../../src/modules/knowledge/knowledge-document-extractor";

class TestDocumentExtractor extends KnowledgeDocumentExtractor {
  protected override async extractPdf() {
    return "PDF delivery policy\r\n\r\nEscalate after five business days.";
  }

  protected override async extractDocx() {
    return "Word refund policy\n\nRefund approved orders within five business days.";
  }
}

test("knowledge extractor preserves Markdown text and normalizes line endings", async () => {
  const extractor = new KnowledgeDocumentExtractor();
  const result = await extractor.extract({
    originalname: "delivery-playbook.md",
    size: 46,
    buffer: Buffer.from("\uFEFF# Delivery\r\n\r\nTrack the order status.\r\n")
  });

  assert.deepEqual(result, {
    fileName: "delivery-playbook.md",
    content: "# Delivery\n\nTrack the order status."
  });
});

test("knowledge extractor routes PDF and DOCX files through their server-side parsers", async () => {
  const extractor = new TestDocumentExtractor();

  const pdf = await extractor.extract({ originalname: "delivery.pdf", size: 8, buffer: Buffer.from("fake pdf") });
  const docx = await extractor.extract({ originalname: "refund.docx", size: 9, buffer: Buffer.from("fake docx") });

  assert.equal(pdf.content, "PDF delivery policy\n\nEscalate after five business days.");
  assert.equal(docx.content, "Word refund policy\n\nRefund approved orders within five business days.");
});

test("knowledge extractor rejects unsupported, empty, and oversized files before parsing", async () => {
  const extractor = new KnowledgeDocumentExtractor();

  await assert.rejects(
    extractor.extract({ originalname: "guide.txt", size: 4, buffer: Buffer.from("text") }),
    BadRequestException
  );
  await assert.rejects(
    extractor.extract({ originalname: "empty.pdf", size: 0, buffer: Buffer.alloc(0) }),
    BadRequestException
  );
  await assert.rejects(
    extractor.extract({
      originalname: "too-large.md",
      size: MAX_KNOWLEDGE_FILE_BYTES + 1,
      buffer: Buffer.alloc(MAX_KNOWLEDGE_FILE_BYTES + 1)
    }),
    BadRequestException
  );
});
