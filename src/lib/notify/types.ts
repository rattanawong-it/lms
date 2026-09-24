import type { NotificationType } from "@/generated/prisma/enums";

export type NotifyInput = {
  userIds: string[];
  type: NotificationType;
  title: string;
  body?: string | null;
  link?: string | null;
};
