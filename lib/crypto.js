/* DSA Revision Tracker — encrypted settings (data/settings.enc.json).
 *
 * Envelope:
 *   { v:1, kdf:{ name:"PBKDF2", hash:"SHA-256", iterations, salt }, cipher:{ name:"AES-GCM", iv }, data }
 * (salt / iv / data are base64). Key = PBKDF2(passphrase, salt) -> AES-GCM-256. A fresh IV on every save.
 *
 * The derived key can be exported (raw, base64) so a browser session can re-encrypt without asking for the
 * passphrase again; callers keep that only in sessionStorage. WebCrypto: works in browsers and Node >= 19.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.DSA_CRYPTO = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var ITERATIONS = 310000;
  function subtle() { return (typeof crypto !== "undefined" && crypto.subtle) || null; }
  function rand(n) { var a = new Uint8Array(n); crypto.getRandomValues(a); return a; }

  function toB64(bytes) {
    var s = "", a = new Uint8Array(bytes);
    for (var i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function fromB64(b64) {
    var s = atob(b64), a = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
    return a;
  }

  // -> Promise<{ key: CryptoKey, salt: b64, iterations }>
  function deriveKey(passphrase, saltB64, iterations) {
    var salt = saltB64 ? fromB64(saltB64) : rand(16);
    iterations = iterations || ITERATIONS;
    return subtle().importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"])
      .then(function (base) {
        return subtle().deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: salt, iterations: iterations },
          base, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
      })
      .then(function (key) { return { key: key, salt: toB64(salt), iterations: iterations }; });
  }
  function exportKey(k) {
    return subtle().exportKey("raw", k.key).then(function (raw) { return { raw: toB64(raw), salt: k.salt, iterations: k.iterations }; });
  }
  function importKey(saved) {
    return subtle().importKey("raw", fromB64(saved.raw), { name: "AES-GCM" }, true, ["encrypt", "decrypt"])
      .then(function (key) { return { key: key, salt: saved.salt, iterations: saved.iterations }; });
  }

  // obj -> envelope, using an already-derived key
  function encryptWithKey(obj, k) {
    var iv = rand(12);
    return subtle().encrypt({ name: "AES-GCM", iv: iv }, k.key, new TextEncoder().encode(JSON.stringify(obj)))
      .then(function (ct) {
        return { v: 1, kdf: { name: "PBKDF2", hash: "SHA-256", iterations: k.iterations, salt: k.salt },
          cipher: { name: "AES-GCM", iv: toB64(iv) }, data: toB64(ct) };
      });
  }
  function decryptWithKey(env, k) {
    return subtle().decrypt({ name: "AES-GCM", iv: fromB64(env.cipher.iv) }, k.key, fromB64(env.data))
      .then(function (pt) { return JSON.parse(new TextDecoder().decode(pt)); });
  }
  // passphrase flows
  function encrypt(obj, passphrase) {
    return deriveKey(passphrase).then(function (k) {
      return encryptWithKey(obj, k).then(function (env) { return { envelope: env, key: k }; });
    });
  }
  // rejects with Error("Wrong passphrase") when authentication fails
  function decrypt(env, passphrase) {
    return deriveKey(passphrase, env.kdf.salt, env.kdf.iterations).then(function (k) {
      return decryptWithKey(env, k).then(function (obj) { return { data: obj, key: k }; },
        function () { throw new Error("Wrong passphrase"); });
    });
  }

  return {
    ITERATIONS: ITERATIONS, available: function () { return !!subtle(); },
    deriveKey: deriveKey, exportKey: exportKey, importKey: importKey,
    encryptWithKey: encryptWithKey, decryptWithKey: decryptWithKey, encrypt: encrypt, decrypt: decrypt
  };
});
