export function createInviteLink(token: string): string {
	const inviteUrl = new URL(window.location.href);
	inviteUrl.searchParams.set("token", token);
	inviteUrl.searchParams.delete("playerId");
	return inviteUrl.toString();
}
