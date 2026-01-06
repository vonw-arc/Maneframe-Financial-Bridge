require("dotenv").config();
const express = require("express");
const axios = require("axios");
const crypto = require("crypto");
const qs = require("qs");

const app = express();
app.use(express.json());               // ← global JSON middleware (v5 safe)
const port = process.env.PORT || 3000;

/* ===============================
   QB TOKEN ENGINE
=================================*/

let qbTokenStore = {
  access_token: null,
  refresh_token: null,
  expires_at: 0
};

async function getQBAccessToken() {
  if (qbTokenStore.access_token && Date.now() < qbTokenStore.expires_at) {
    return qbTokenStore.access_token;
  }

  const r = await axios.post(
    "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
    qs.stringify({
      grant_type: "refresh_token",
      refresh_token: qbTokenStore.refresh_token
    }),
    {
      headers: {
        Authorization:
          "Basic " +
          Buffer.from(
            process.env.QB_CLIENT_ID + ":" + process.env.QB_CLIENT_SECRET
          ).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded"
      }
    }
  );

  qbTokenStore.access_token = r.data.access_token;
  qbTokenStore.refresh_token = r.data.refresh_token;
  qbTokenStore.expires_at = Date.now() + r.data.expires_in * 1000;

  return qbTokenStore.access_token;
}

/* ===============================
   HEALTH
=================================*/

app.get("/", (_, res) => res.send("Maneframe Finance Bridge Alive 🦾"));
app.get("/__ping", (_, res) => res.json({ ok: true, ping: "pong", time: new Date().toISOString() }));

/* ===============================
   OAUTH
=================================*/

app.get("/auth/qb/start", (req, res) => {
  const state = crypto.randomBytes(16).toString("hex");

  const params = {
    client_id: process.env.QB_CLIENT_ID,
    response_type: "code",
    scope: "com.intuit.quickbooks.accounting",
    redirect_uri: process.env.QB_REDIRECT_URI,
    state
  };

  res.redirect(`https://appcenter.intuit.com/connect/oauth2?${qs.stringify(params)}`);
});

app.get("/auth/qb/callback", async (req, res) => {
  try {
    console.log("QB REALM ID:", req.query.realmId);

    const r = await axios.post(
      "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
      qs.stringify({
        grant_type: "authorization_code",
        code: req.query.code,
        redirect_uri: process.env.QB_REDIRECT_URI
      }),
      {
        headers: {
          Authorization:
            "Basic " +
            Buffer.from(
              process.env.QB_CLIENT_ID + ":" + process.env.QB_CLIENT_SECRET
            ).toString("base64"),
          "Content-Type": "application/x-www-form-urlencoded"
        }
      }
    );

    qbTokenStore.access_token = r.data.access_token;
    qbTokenStore.refresh_token = r.data.refresh_token;
    qbTokenStore.expires_at = Date.now() + r.data.expires_in * 1000;

    res.send("QB Connected Successfully 🦾 You may close this window.");
  } catch (e) {
    console.error(e.response?.data || e.message);
    res.status(500).send("QB OAuth failed");
  }
});

/* ===============================
   LOOKUPS
=================================*/

app.get("/qb/vendors", async (_, res) => {
  try {
    const token = await getQBAccessToken();
    const realm = process.env.QB_REALM_ID;

    const r = await axios.get(
      `https://sandbox-quickbooks.api.intuit.com/v3/company/${realm}/query`,
      {
        params: { query: "select Id, DisplayName from Vendor", minorversion: 65 },
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }
      }
    );

    res.json(r.data.QueryResponse.Vendor || []);
  } catch (e) {
    console.error(e.response?.data || e.message);
    res.status(500).send("Vendor query failed");
  }
});

app.get("/qb/accounts", async (_, res) => {
  try {
    const token = await getQBAccessToken();
    const realm = process.env.QB_REALM_ID;

    const r = await axios.get(
      `https://sandbox-quickbooks.api.intuit.com/v3/company/${realm}/query`,
      {
        params: { query: "select Id, Name, AccountType from Account", minorversion: 65 },
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }
      }
    );

    res.json(r.data.QueryResponse.Account || []);
  } catch (e) {
    console.error(e.response?.data || e.message);
    res.status(500).send("Account lookup failed");
  }
});

/* ===============================
   BILL ENGINE — CREATE QB BILL
=================================*/
app.post("/qb/bills", async (req, res) => {
  try {
    const { vendorId, amount, memo } = req.body;

    const token = await getQBAccessToken();
    const realm = process.env.QB_REALM_ID;

    const billPayload = {
      VendorRef: { value: vendorId },
      APAccountRef: { value: "33" },
      TxnDate: new Date().toISOString().split("T")[0],
      CurrencyRef: { value: "USD" },

      Line: [
        {
          DetailType: "AccountBasedExpenseLineDetail",
          Amount: Number(amount),
          Description: memo || "Maneframe Diagnostic",
          AccountBasedExpenseLineDetail: {
            AccountRef: { value: "28" }
          }
        }
      ]
    };

    console.log("====== BILL PAYLOAD ======");
    console.log(JSON.stringify(billPayload, null, 2));
    console.log("==========================");

    const qbRes = await axios.post(
      `https://sandbox-quickbooks.api.intuit.com/v3/company/${realm}/bill?minorversion=65`,
      billPayload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        validateStatus: () => true
      }
    );

    console.log("====== QB RAW RESPONSE ======");
    console.log(JSON.stringify(qbRes.data, null, 2));
    console.log("=============================");

    res.json(qbRes.data);

  } catch (e) {
    console.log("====== LOCAL ERROR ======");
    console.log(e.message);
    console.log("=========================");
    res.status(500).send("Local failure");
  }
});

/* ===============================
   START
=================================*/

app.listen(port, () => console.log("MF Finance Bridge running on", port));
