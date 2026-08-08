import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createTransport, type Transporter } from "nodemailer";

export type InvitationEmailDelivery = {
  sent: boolean;
  recipient: string;
};

type TeamInvitationEmail = {
  recipient: string;
  organizationName: string;
  role: string;
  token: string;
  expiresAt: Date;
};

type PasswordResetOtpEmail = {
  recipient: string;
  code: string;
  expiresAt: Date;
};

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter | null | undefined;

  constructor(private readonly config: ConfigService) {}

  async sendTeamInvitation(input: TeamInvitationEmail): Promise<InvitationEmailDelivery> {
    const transporter = this.getTransporter();
    if (!transporter) {
      return { sent: false, recipient: input.recipient };
    }

    const invitationUrl = new URL("/join", this.webBaseUrl());
    invitationUrl.searchParams.set("token", input.token);
    const organizationName = escapeHtml(input.organizationName);
    const role = escapeHtml(toTitleCase(input.role));
    const expiresAt = input.expiresAt.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });

    try {
      await transporter.sendMail({
        from: this.config.getOrThrow<string>("EMAIL_FROM"),
        to: input.recipient,
        subject: `You're invited to ${input.organizationName} on Customer Support Hub`,
        text: [
          `You've been invited to join ${input.organizationName} as a ${toTitleCase(input.role)}.`,
          `Accept your invitation: ${invitationUrl.toString()}`,
          `This invitation expires on ${expiresAt}.`,
        ].join("\n\n"),
        html: `<p>You've been invited to join <strong>${organizationName}</strong> as a <strong>${role}</strong>.</p><p><a href="${invitationUrl.toString()}">Accept invitation</a></p><p>This invitation expires on ${expiresAt}.</p>`,
      });
      return { sent: true, recipient: input.recipient };
    } catch (error) {
      this.logger.error(
        `Could not send team invitation to ${input.recipient}`,
        error instanceof Error ? error.stack : undefined,
      );
      return { sent: false, recipient: input.recipient };
    }
  }

  async sendPasswordResetOtp(input: PasswordResetOtpEmail): Promise<InvitationEmailDelivery> {
    const transporter = this.getTransporter();
    if (!transporter) {
      return { sent: false, recipient: input.recipient };
    }

    const expiresAt = input.expiresAt.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
    });

    try {
      await transporter.sendMail({
        from: this.config.getOrThrow<string>("EMAIL_FROM"),
        to: input.recipient,
        subject: "Your Customer Support Hub password reset code",
        text: [
          `Your password reset code is: ${input.code}`,
          "Enter this code in Customer Support Hub to choose a new password.",
          `The code expires at ${expiresAt} UTC and can be used once.`,
          "If you did not request this, you can ignore this email.",
        ].join("\n\n"),
        html: `<p>Your Customer Support Hub password reset code is:</p><p style="font-size: 24px; font-weight: 700; letter-spacing: 4px">${input.code}</p><p>Enter this code to choose a new password. It expires at ${expiresAt} UTC and can be used once.</p><p>If you did not request this, you can ignore this email.</p>`,
      });
      return { sent: true, recipient: input.recipient };
    } catch (error) {
      this.logger.error(
        `Could not send password reset OTP to ${input.recipient}`,
        error instanceof Error ? error.stack : undefined,
      );
      return { sent: false, recipient: input.recipient };
    }
  }

  private getTransporter() {
    if (this.transporter !== undefined) {
      return this.transporter;
    }

    if (this.config.get<string>("EMAIL_PROVIDER") !== "gmail") {
      this.transporter = null;
      return this.transporter;
    }

    this.transporter = createTransport({
      host: this.config.getOrThrow<string>("SMTP_HOST"),
      port: Number(this.config.getOrThrow<string>("SMTP_PORT")),
      secure: this.config.getOrThrow<string>("SMTP_SECURE") === "true",
      auth: {
        user: this.config.getOrThrow<string>("SMTP_USER"),
        pass: this.config.getOrThrow<string>("SMTP_PASSWORD"),
      },
    });
    return this.transporter;
  }

  private webBaseUrl() {
    return this.config.get<string>("WEB_BASE_URL") ?? "http://localhost:3000";
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    };
    return entities[character] ?? character;
  });
}

function toTitleCase(value: string) {
  return value.charAt(0) + value.slice(1).toLowerCase();
}
