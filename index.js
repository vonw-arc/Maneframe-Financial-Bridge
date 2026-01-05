require("dotenv").config();
const express = require("express");
const axios = require("axios");
const qs = require("qs");
const crypto = require("crypto");

const app = express();
app.use(express.json());

const QB_BASE = "https://sandbox-quickbooks.api.intuit.com";

// =======================
// SECURE TOKEN STORE
// =======================
let QB = {
  realmId: null,
  access_token: null,
  refresh_token: null,
  expires_at: null
};

function setQBToken(t) {
  QB.access_token = t.access_token;
  QB.refresh_token = t.refresh_token;
  QB.expires_at = Date.now() + (t.expires_in * 1000);
}

// =======================
// HEALTH CHECK
// =======================
app.get("/", (_, res) => res.send("Maneframe Finance Bridge Online 🦾"));

// =======================
// OAUTH START
// =======================
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

// =======================
// OAUTH CALLBACK
// =======================
app.get("/auth/qb/callback", async (req, res) => {
  try {
    const authCode = req.query.code;
    const realmId = req.query.realmId;

    const tokenRes = await axios.post(
      "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
      qs.stringify({
        grant_type: "authorization_code",
        code: authCode,
        redirect_uri: process.env.QB_REDIRECT_URI
      }),
      {
        headers: {
          Authorization:
            "Basic " +
            Buffer.from(process.env.QB_CLIENT_ID + ":" + process.env.QB_CLIENT_SECRET).toString("base64"),
          "Content-Type": "application/x-www-form-urlencoded"
        }
      }
    );

    QB.realmId = realmId;
    setQBToken(tokenRes.data);

    res.send("QB Connected Successfully 🦾 You may close this window.");
  } catch (e) {
    console.error(e.response?.data || e.message);
    res.status(500).send("QB OAuth Failed");
  }
});

// =======================
// AUTO TOKEN REFRESH
// =======================
async function getQBAccessToken() {
  if (QB.access_token && Date.now() < QB.expires_at - 60000) {
    return QB.access_token;
  }

  const tokenRes = await axios.post(
    "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
    qs.stringify({
      grant_type: "refresh_token",
      refresh_token: QB.refresh_token
    }),
    {
      headers: {
        Authorization:
          "Basic " +
          Buffer.from(process.env.QB_CLIENT_ID + ":" + process.env.QB_CLIENT_SECRET).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded"
      }
    }
  );

  setQBToken(tokenRes.data);
  return QB.access_token;
}

// =======================
// CREATE BILL
// =======================
app.post("/qb/bills", async (req, res) => {
  try {
    const token = await getQBAccessToken();

    const bill = req.body; // { vendorId, amount, memo }

    const qbRes = await axios.post(
      `${QB_BASE}/v3/company/${QB.realmId}/bill`,
      {
        VendorRef: { value: bill.vendorId },
        Line: [
          {
            Amount: bill.amount,
            DetailType: "AccountBasedExpenseLineDetail",
            AccountBasedExpenseLineDetail: {
              AccountRef: { value: "79" } // <-- Temporary expense account (we'll map later)
            },
            Description: bill.memo
          }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json"
        }
      }
    );

    res.json(qbRes.data);
  } catch (e) {
    console.error(e.response?.data || e.message);
    res.status(500).send("Bill creation failed");
  }
});

app.get("/qb/vendors", async (req, res) => {
  try {
    const accessToken = await getQBAccessToken();
    const realmId = process.env.QB_REALM_ID;

    const r = await axios.get(
      `https://sandbox-quickbooks.api.intuit.com/v3/company/${realmId}/query`,
      {
        params: { query: "select Id, DisplayName from Vendor" },
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json"
        }
      }
    );

    res.json(r.data.QueryResponse.Vendor || []);
  } catch (e) {
    console.error(e.response?.data || e.message);
    res.status(500).send("Vendor query failed");
  }
});

// =======================
// SERVER START
// =======================
const port = process.env.PORT || 3000;
app.listen(port, () => console.log("MF Finance Bridge running on", port));
