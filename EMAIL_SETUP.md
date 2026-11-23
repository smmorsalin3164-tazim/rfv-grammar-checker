# RFV Grammar Checker — Free Email Access Code Setup

The student enrollment flow is now wired to a Google Apps Script mailer. The website creates a unique RFV Access Code, emails it to the address entered by the student, and does not store the student's email address in D1. The student's name is used as the Access Code label in the existing Admin list.

## One-time Google Apps Script setup

1. Open https://script.google.com/ and create a new project.
2. Replace the editor contents with the code in `email-sender/Code.gs`.
3. Open **Project Settings** → **Script Properties** → **Add script property**.
   - Property: `MAILER_SECRET`
   - Value: create a long random secret and keep it private.
4. Click **Deploy** → **New deployment**.
5. Select type **Web app**.
6. Set **Execute as** to **Me**.
7. Set access to **Anyone** (the endpoint is protected by the secret above).
8. Deploy, authorize the script to send email, and copy the Web App URL.

## Cloudflare Pages environment variables

In the Cloudflare dashboard, open the Pages project → **Settings** → **Variables and Secrets**. Add these as encrypted secrets for the Production environment:

- `MAILER_URL` = the Google Apps Script Web App URL
- `MAILER_SECRET` = exactly the same secret saved in Apps Script

Save the settings and redeploy the latest Pages deployment.

## Important

- Google Apps Script / Gmail has sending quotas and may ask for authorization. This is a no-paid-service approach, not an unlimited email service.
- Until both Cloudflare secrets are configured and the Apps Script is deployed, student email delivery will not work.
- The entered email is used only to send the code; this implementation does not save it in the site's database or show it in Admin.
- Existing manually created Admin Access Codes and the HSC 27 special code remain supported.
- Each email confirmation creates a new Access Code with the existing 3-device limit. The existing code login and progress system remains in use.
