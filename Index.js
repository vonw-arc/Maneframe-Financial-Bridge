require("dotenv").config();
const express = require("express");

const app = express();
app.use(express.json());

app.get("/", (req, res) => {
  res.status(200).send("Maneframe Finance Bridge Alive ✅");
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`mf-finance-bridge listening on port ${port}`);
});
