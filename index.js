require("dotenv").config();
const express = require("express");

const app = express();
app.get("/", (_, res) => res.send("Maneframe Finance Bridge Alive ✅"));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("MF Finance Bridge running on", port));
