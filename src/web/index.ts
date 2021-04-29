import * as express from "express";
const app = express();
app.use(express.static(__dirname + "/public"));

const port = 3000;

app.get("/", (req, res) => {
  res.render("index");
});

app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`);
});
