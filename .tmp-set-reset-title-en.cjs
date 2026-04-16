const fs = require("fs");
const p = "src/i18n/en.json";
const json = JSON.parse(fs.readFileSync(p, "utf8"));
const current = json?.resetPassword?.title;
console.log("CURRENT=" + String(current));
if (current !== "Reset password") {
  json.resetPassword.title = "Reset password";
  fs.writeFileSync(p, JSON.stringify(json, null, 2) + "\n", "utf8");
  console.log("UPDATED=1");
} else {
  console.log("UPDATED=0");
}
