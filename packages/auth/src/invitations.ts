import { serverEnv } from "@locnative/env/server";
import { Resend } from "resend";

const TRAILING_SLASH_REGEX = /\/$/;

export interface InviteTemplateParams {
	inviterEmail: string;
	inviterName: string;
	inviteUrl: string;
	teamName: string;
}

export function buildInviteHtml({
	teamName,
	inviterName,
	inviterEmail,
	inviteUrl,
}: InviteTemplateParams): string {
	const fontStack = "ui-monospace, 'Courier New', monospace";
	return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Invitation to ${teamName} on Locnative</title>
  </head>
  <body style="margin:0;padding:0;background:#ffffff;color:#1a1a1a;font-family:${fontStack};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
            <tr>
              <td style="padding:0 0 24px 0;font-family:${fontStack};font-size:14px;font-weight:600;color:#1a1a1a;letter-spacing:0.02em;">
                Locnative
              </td>
            </tr>
            <tr>
              <td style="padding:0 0 16px 0;font-family:${fontStack};font-size:24px;font-weight:600;line-height:1.3;color:#1a1a1a;">
                ${inviterName} has invited you to join ${teamName} on Locnative
              </td>
            </tr>
            <tr>
              <td style="padding:0 0 24px 0;font-family:${fontStack};font-size:14px;line-height:1.5;color:#1a1a1a;">
                Click the button below to accept this invitation. This link expires in 72 hours.
              </td>
            </tr>
            <tr>
              <td style="padding:0 0 24px 0;">
                <a href="${inviteUrl}" style="display:inline-block;background:#dedede;color:#1a1a1a;text-decoration:none;padding:12px 24px;border-radius:8px;font-family:${fontStack};font-size:14px;font-weight:600;">Accept invitation</a>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 0 0 0;border-top:1px solid #ececec;font-family:${fontStack};font-size:12px;line-height:1.5;color:#6b6b6b;">
                If you weren't expecting this, you can ignore this email. This invitation was sent by ${inviterEmail}.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function buildInviteText({
	teamName,
	inviterName,
	inviteUrl,
}: Omit<InviteTemplateParams, "inviterEmail">): string {
	return [
		`${inviterName} has invited you to join ${teamName} on Locnative.`,
		"",
		"Accept this invitation by opening the link below. It expires in 72 hours.",
		"",
		inviteUrl,
		"",
		"If you weren't expecting this, you can ignore this email.",
	].join("\n");
}

export function buildInviteUrl(invitationId: string): string {
	const base = serverEnv.WEB_BASE_URL.replace(TRAILING_SLASH_REGEX, "");
	return `${base}/invite/${invitationId}`;
}

export async function sendInvitationEmail({
	to,
	teamName,
	inviterName,
	inviterEmail,
	invitationId,
}: {
	to: string;
	teamName: string;
	inviterName: string;
	inviterEmail: string;
	invitationId: string;
}): Promise<void> {
	const resend = new Resend(serverEnv.RESEND_API_KEY);
	const inviteUrl = buildInviteUrl(invitationId);
	await resend.emails.send({
		from: serverEnv.EMAIL_FROM,
		to,
		subject: `${inviterName} invited you to ${teamName} on Locnative`,
		html: buildInviteHtml({ teamName, inviterName, inviterEmail, inviteUrl }),
		text: buildInviteText({ teamName, inviterName, inviteUrl }),
	});
}
