import { randomBytes } from "node:crypto";

export interface InviteCode {
  code: string;
  nexusUrl: string;
  createdAt: number;
  expiresAt: number;
  maxUses: number;
  usedCount: number;
}

export class InviteManager {
  private invites = new Map<string, InviteCode>();

  create(
    nexusUrl: string,
    options: { expiresInHours?: number; maxUses?: number } = {},
  ): InviteCode {
    const code = randomBytes(4).toString("hex"); // 8-char hex code
    const now = Date.now();

    const invite: InviteCode = {
      code,
      nexusUrl,
      createdAt: now,
      expiresAt: options.expiresInHours
        ? now + options.expiresInHours * 3600000
        : 0,
      maxUses: options.maxUses ?? 0,
      usedCount: 0,
    };

    this.invites.set(code, invite);
    return invite;
  }

  validate(code: string): InviteCode | null {
    const invite = this.invites.get(code);
    if (!invite) return null;
    if (invite.expiresAt > 0 && Date.now() > invite.expiresAt) {
      this.invites.delete(code);
      return null;
    }
    if (invite.maxUses > 0 && invite.usedCount >= invite.maxUses) {
      return null;
    }
    return invite;
  }

  use(code: string): InviteCode | null {
    const invite = this.validate(code);
    if (!invite) return null;
    const updated: InviteCode = {
      ...invite,
      usedCount: invite.usedCount + 1,
    };
    this.invites.set(code, updated);
    return updated;
  }

  revoke(code: string): boolean {
    return this.invites.delete(code);
  }

  list(): readonly InviteCode[] {
    return Array.from(this.invites.values());
  }
}
