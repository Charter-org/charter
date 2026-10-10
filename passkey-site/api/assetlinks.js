// Serve assetlinks with EXACTLY `Content-Type: application/json` (no charset).
// Android passkey RP-ID validation (GMS ValidateRpIdOperation) requires BOTH get_login_creds AND
// handle_all_urls in one statement — with only get_login_creds it fails "[50152] RP ID cannot be
// validated" even though the public assetlinks:check API passes (see category-labs/mera#351).
export default function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  res.statusCode = 200;
  res.end(
    JSON.stringify([
      {
        relation: [
          "delegate_permission/common.get_login_creds",
          "delegate_permission/common.handle_all_urls",
        ],
        target: {
          namespace: "android_app",
          package_name: "xyz.charter.app",
          sha256_cert_fingerprints: [
            "5C:F3:94:74:A7:76:2E:54:97:65:A5:C4:F9:93:49:D0:2B:F0:BC:98:CA:C5:73:B7:B3:D2:9A:D3:0F:85:9A:8C",
          ],
        },
      },
    ]),
  );
}
