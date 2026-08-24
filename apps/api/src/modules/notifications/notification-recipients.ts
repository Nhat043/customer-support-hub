export function notificationRecipients(actorUserId: string, ...candidateIds: Array<string | null | undefined>) {
  return [...new Set(candidateIds.filter((userId): userId is string => Boolean(userId) && userId !== actorUserId))];
}
