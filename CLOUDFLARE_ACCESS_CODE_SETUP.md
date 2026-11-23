# Cloudflare setup — Admin Access Code lookup

The code changes are committed to `main`. Complete these Cloudflare steps before relying on the updated Admin Panel.

## 1. Add the D1 column (run once)

1. Open Cloudflare Dashboard.
2. Go to **Workers & Pages → D1 SQL Database** (or **D1**).
3. Open database **rfv-progress**.
4. Open its SQL Console.
5. Run this statement:

```sql
ALTER TABLE access_codes ADD COLUMN encrypted_code TEXT;
```

If Cloudflare reports that the column already exists, do not run it again; the migration is already applied.

## 2. Create an encryption secret

On Windows PowerShell, run:

```powershell
$bytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
$CODE_ENCRYPTION_KEY = [Convert]::ToBase64String($bytes)
$CODE_ENCRYPTION_KEY
```

Copy the generated value privately. Do not send it in chat or commit it to GitHub.

## 3. Save it in Cloudflare Pages

1. Open **Workers & Pages → rfv-grammar-checker**.
2. Open **Settings → Variables and Secrets**.
3. Under **Production**, add a secret named `CODE_ENCRYPTION_KEY`.
4. Paste the generated value and save.
5. Do not replace `ADMIN_KEY`, `MAILER_URL`, or `MAILER_SECRET`.

## 4. Redeploy

Open **Deployments** for the Pages project and redeploy the latest deployment from `main` so the new secret is available to Functions. Wait for the deployment to succeed.

## 5. Verify

1. Open `/admin.html` on the live site and connect with the existing Admin Key.
2. Search for a student name.
3. Confirm new codes appear beside the student name and in the code list.
4. Create a test code with a test label, refresh, and confirm the code remains visible.
5. Test student login with that code.

## Important

- Existing Access Codes created before this change have only one-way hashes. They cannot be recovered. Issue a replacement code for those students.
- New self-enrollment and Admin-created codes are encrypted in D1. Only the authorized Admin endpoint decrypts them.
- HSC 27 remains supported. Click **Create / Enable HSC 27 Code** once after the migration and secret are configured so its known shared code is stored in encrypted form.
- Keep the encryption secret safe. If it is lost or changed, previously encrypted codes cannot be decrypted.
