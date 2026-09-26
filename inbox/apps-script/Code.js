/*
 * Checks Gmail for the bank's purchase emails and leaves each purchase in the
 * Contame inbox. Runs every few minutes once install() has been run.
 *
 * Gmail is read with the Gmail API service and read-only access (see
 * appsscript.json): the script can see mail but never send or delete it.
 * CONTAME (above) and ContameMailbox (below) are added by the app.
 */

/** Which emails to look at: Gmail search syntax. */
var SEARCH = '"Realizaste una compra" newer_than:3d';
var EVERY_MINUTES = 5;
/** How long to remember an email already sent, a bit longer than the search window. */
var REMEMBER_DAYS = 5;

/** Run once by hand: asks for permission, schedules checkMail and runs it. */
function install() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === "checkMail") ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger("checkMail").timeBased().everyMinutes(EVERY_MINUTES).create();
  checkMail();
}

function checkMail() {
  var store = PropertiesService.getScriptProperties();
  var seen = JSON.parse(store.getProperty("seen") || "{}");
  var now = Date.now();
  var found = Gmail.Users.Messages.list("me", { q: SEARCH, maxResults: 50 }).messages || [];
  for (var i = 0; i < found.length; i++) {
    var id = found[i].id;
    if (seen[id]) continue;
    var email = ContameMailbox.emailFromGmail(Gmail.Users.Messages.get("me", id, { format: "full" }), decode);
    var call = ContameMailbox.prepareDelivery(email, { url: CONTAME.url, key: CONTAME.key, token: CONTAME.token });
    var response = UrlFetchApp.fetch(call.url, {
      method: "post",
      contentType: "application/json",
      headers: call.headers,
      payload: call.body,
      muteHttpExceptions: true,
    });
    var status = response.getResponseCode();
    var body = response.getContentText();
    if (status < 200 || status >= 300) throw new Error(ContameMailbox.refusal(status, body));
    var result = call.outcome(body ? JSON.parse(body) : null);
    console.log(
      result.status === "unmatched"
        ? "No es un aviso de compra: " + (email.subject || "(sin asunto)")
        : "Compra en " + result.merchant + " por " + result.amount + ": " + result.status,
    );
    // Saved after each email, so a failure further on does not send this one again.
    seen[id] = now;
    store.setProperty("seen", JSON.stringify(seen));
  }
  for (var key in seen) {
    if (now - seen[key] > REMEMBER_DAYS * 86400000) delete seen[key];
  }
  store.setProperty("seen", JSON.stringify(seen));
}

function decode(data) {
  return Utilities.newBlob(Utilities.base64DecodeWebSafe(data)).getDataAsString("UTF-8");
}
