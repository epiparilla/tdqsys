# Issuing TDQSYS licences

You are the licence authority. Nothing is checked online. You hold the private
key, you sign each licence by hand, and you send the customer a code.

There is no activation server, no subscription, and no phone-home. If you lose
the private key, existing licences keep working (they were signed, not looked
up) but you cannot issue new ones.

---

## One-time setup

Run this **once**, on a machine that is not connected to the cloud:

```
node tools/license.js keygen
```

It writes your private key to `~/.tdqsys/private.pem` and prints the public key.

Do three things with that output:

1. Paste the **public** key into `license.js` under `TRUSTED_PUBLIC_KEYS`:

   ```js
   const TRUSTED_PUBLIC_KEYS = Object.freeze([
     { keyId: 'k1', pem: `-----BEGIN PUBLIC KEY-----
   MC4CAQAwBQYDK2VwBCIEILxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   -----END PUBLIC KEY-----` }
   ]);
   ```

2. Back the private key up to **two separate physical places**. Not the cloud,
   not a synced folder. A USB stick in a different building is the bar.

3. Print it and store the printout with your paperwork. Encrypted backups that
   you have never restored from are not a backup.

`keygen` refuses to overwrite an existing key. Losing the key is not something
the tool can undo for you.

Verify the setup before you rely on it:

```
node tests/release-gate.js
```

It passes when a trusted public key is present and no private key has leaked
into the repository.

---

## Per customer

The client sends you an activation request. Check the instance id against what
they told you — a licence issued to the wrong instance is refused by their
machine, and you cannot tell it apart from tampering.

```
node tools/license.js request --file request.json
node tools/license.js issue --request request.json --customer "Acme Auto Wash" \
    --from 11-01 --until 11-06
```

The tool prints exactly what it is about to issue and refuses to produce a code
until you pass `--yes`. Read the instance id back before you do.

### Dates

`--from` and `--until` are **inclusive local dates**. A licence with
`--from 11-01 --until 11-06` runs from 12:00am on 1 November through 11:59pm on
6 November — six days, on the machine's own clock, with no timezone stored.

A missing year means the current one. These all mean the same thing:

```
--from 2026-11-01     --from 11-01     --from 11/01     --from "1 Nov"
```

### Output

The code is printed wrapped for reading, and also written to `licence.txt`:

```
node tools/license.js issue --request request.json \
    --from 11-01 --until 11-06 --customer "Acme Auto Wash" --yes --out licence.txt
```

Send `licence.txt`. The customer pastes it into **Settings > Licence** once. It
is stored on the machine and never entered again.

### Checking a code

Useful when a customer says their licence is not working, or before you resend
one. Codes are long and easy to mistype, so point at the file:

```
node tools/license.js verify --file licence.txt
```

This prints the payload and checks the signature against the keys your build
trusts. It does **not** contact the customer's machine, so it cannot tell you
which instance they actually typed in — ask them to read it off their screen.

---

## What a licence permits

A licence is bound to one instance id and one date range. There is no perpetual
licence and no seat count.

- **Valid:** everything works.
- **Expired:** the booth keeps running read-only. Cars, the queue board, the
  phone queue, TTS and video ads all keep working. Numbers cannot be changed,
  configuration cannot be saved, and videos cannot be imported or deleted. The
  customer keeps their data and can keep serving cars — they just cannot edit.
- **Wrong instance or altered code:** rejected outright.

Renewal is just a new code over the same instance. Issue one covering the new
term and it replaces the old one.

Because licences are checked against the machine's clock, the tool records a
high-water mark in two separate files and refuses to go backwards by more than
two hours. Setting the clock back to reuse an expired licence does not work,
and this matters most on a licence shorter than a weekend — which is exactly
what these are.

---

## Practical notes

- **Keep the private key offline.** Every copy is a copy of your authority.
- **Verify the instance id out of band.** Phone your customer if it matters.
- **Licences are short by design.** A six-day event licence should be renewed,
  not extended to the end of the year.
- The tool warns above 180 days. Override with `--max-days <n>` only when you
  mean it.
- If you ever need to rotate, generate a second key with
  `--key-id k2`, paste it alongside `k1`, and ship an update. Both keys can be
  trusted during the overlap; a licence naming `k3` will be refused.