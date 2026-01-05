require("dotenv").config();
const express = require("express");

const app = express();
app.get("/", (_, res) => res.send("Maneframe Finance Bridge Alive ✅"));

const port = process.env.PORT || 3000;
const crypto = require("crypto");
const qs = require("qs");
const QB_BASE = "https://quickbooks.api.intuit.com";

app.get("/auth/qb/start", (req, res) => {
  const state = crypto.randomBytes(16).toString("hex");

  const params = {
  client_id: process.env.QB_CLIENT_ID,
  response_type: "code",
  scope: "com.intuit.quickbooks.accounting",
  redirect_uri: process.env.QB_REDIRECT_URI,
  state,
  response_mode: "form_post"
};

  const url = `https://appcenter.intuit.com/connect/oauth2?${qs.stringify(params)}`;
  res.redirect(url);
});
const axios = require("axios");

app.get("/auth/qb/callback", async (req, res) => {
  try {
    const authCode = req.query.code;

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
            Buffer.from(
              process.env.QB_CLIENT_ID + ":" + process.env.QB_CLIENT_SECRET
            ).toString("base64"),
          "Content-Type": "application/x-www-form-urlencoded"
        }
      }
    );

    // TEMP: show tokens (we'll secure next)
    res.json(tokenRes.data);
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).send("QB OAuth failed");
  }
});
app.listen(port, () => console.log("MF Finance Bridge running on", port));
