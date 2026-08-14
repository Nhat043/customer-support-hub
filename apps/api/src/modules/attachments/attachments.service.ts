import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { OBJECT_STORAGE, type ObjectStorage } from "../../infrastructure/storage/object-storage";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain"
]);

type UploadedFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

@Injectable()
export class AttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(OBJECT_STORAGE) private readonly objectStorage: ObjectStorage
  ) {}

  async upload(input: {
    organizationId: string;
    workflowItemId: string;
    uploadedById: string;
    file?: UploadedFile;
  }) {
    const file = input.file;
    if (!file) throw new BadRequestException("Select a file to upload");
    if (file.size <= 0) throw new BadRequestException("Uploaded file cannot be empty");
    if (file.size > MAX_FILE_SIZE_BYTES) throw new BadRequestException("Files must be 10 MB or smaller");
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException("Only PDF, JPG, PNG, WEBP, and plain text files are supported");
    }

    const item = await this.findWorkflowItem(input.organizationId, input.workflowItemId);
    const storageKey = [
      "organizations",
      item.organizationId,
      "workspaces",
      item.workspaceId ?? "unassigned",
      "workflow-items",
      item.id,
      randomUUID()
    ].join("/");

    await this.objectStorage.put({
      storageKey,
      content: file.buffer,
      contentType: file.mimetype
    });

    try {
      return await this.prisma.$transaction(async (tx) => {
        const attachment = await tx.attachment.create({
          data: {
            organizationId: item.organizationId,
            workspaceId: item.workspaceId,
            workflowItemId: item.id,
            storageKey,
            fileName: this.safeFileName(file.originalname),
            mimeType: file.mimetype,
            sizeBytes: file.size,
            uploadedById: input.uploadedById
          }
        });
        await tx.auditLog.create({
          data: {
            organizationId: item.organizationId,
            workspaceId: item.workspaceId,
            actorUserId: input.uploadedById,
            action: "ATTACHMENT_UPLOADED",
            entityType: "Attachment",
            entityId: attachment.id,
            afterState: {
              workflowItemId: item.id,
              fileName: attachment.fileName,
              mimeType: attachment.mimeType,
              sizeBytes: attachment.sizeBytes
            }
          }
        });
        return attachment;
      });
    } catch (error) {
      await this.objectStorage.delete(storageKey);
      throw error;
    }
  }

  async download(organizationId: string, workflowItemId: string, attachmentId: string) {
    await this.findWorkflowItem(organizationId, workflowItemId);
    const attachment = await this.prisma.attachment.findFirst({
      where: { id: attachmentId, organizationId, workflowItemId }
    });
    if (!attachment) throw new NotFoundException("Attachment not found");

    const object = await this.objectStorage.get(attachment.storageKey);
    return { attachment, content: object.content, contentType: attachment.mimeType || object.contentType };
  }

  async remove(input: {
    organizationId: string;
    workflowItemId: string;
    attachmentId: string;
    actorUserId: string;
    role: string;
  }) {
    const item = await this.findWorkflowItem(input.organizationId, input.workflowItemId);
    const attachment = await this.prisma.attachment.findFirst({
      where: { id: input.attachmentId, organizationId: input.organizationId, workflowItemId: input.workflowItemId }
    });
    if (!attachment) throw new NotFoundException("Attachment not found");
    if (attachment.uploadedById !== input.actorUserId && !["OWNER", "ADMIN"].includes(input.role)) {
      throw new ForbiddenException("Only the uploader, workspace owner, or admin can delete an attachment");
    }

    await this.objectStorage.delete(attachment.storageKey);
    await this.prisma.$transaction(async (tx) => {
      await tx.attachment.delete({ where: { id: attachment.id } });
      await tx.auditLog.create({
        data: {
          organizationId: item.organizationId,
          workspaceId: item.workspaceId,
          actorUserId: input.actorUserId,
          action: "ATTACHMENT_DELETED",
          entityType: "Attachment",
          entityId: attachment.id,
          beforeState: { fileName: attachment.fileName, workflowItemId: item.id }
        }
      });
    });
  }

  private async findWorkflowItem(organizationId: string, workflowItemId: string) {
    const item = await this.prisma.workflowItem.findFirst({
      where: { id: workflowItemId, organizationId },
      select: { id: true, organizationId: true, workspaceId: true }
    });
    if (!item) throw new NotFoundException("Workflow item not found");
    return item;
  }

  private safeFileName(fileName: string) {
    const normalized = fileName
      .replace(/[\\/]/g, "_")
      .split("")
      .filter((character) => character.charCodeAt(0) >= 32)
      .join("")
      .trim();
    return (normalized || "attachment").slice(0, 255);
  }
}
