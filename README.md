# quickmeal-backend
List Feature

## Firebase Admin on Railway

For push notifications, use one of these env setups in Railway:

1. `FIREBASE_SERVICE_ACCOUNT_JSON`
	- Paste the full service account JSON as a single line.
	- Keep the private key escaped with `\\n` inside the JSON string.

2. `FIREBASE_PRIVATE_KEY_BASE64`
	- Base64 encode only the `private_key` value.
	- This is the safest option if Railway keeps breaking PEM line breaks.

3. Separate env fields
	- `project_id`
	- `private_key_id`
	- `private_key`
	- `client_email`
	- `client_id`
	- `client_x509_cert_url`
	- Use `\\n` for line breaks in `private_key`.

If `GET /api/users/firebase/private-key` shows `parseable: false`, switch to option 1 or 2.