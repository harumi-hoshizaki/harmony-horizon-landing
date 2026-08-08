/**
 * ORDER UP - builds the Google Form automatically.
 *
 * HOW TO USE
 * 1. script.google.com -> New project
 * 2. Delete the placeholder code, paste this whole file in, Save.
 * 3. Pick "verifyPaste" in the function dropdown, click Run. It checks
 *    that all 22 sections and 152 sentences arrived intact. Approve the
 *    authorization prompt when it appears - see the note on verifyPaste
 *    below for why a function that creates nothing still asks.
 * 4. Pick "quickTest", click Run. It makes one throwaway form, proving
 *    the authorization actually works before you run the big one.
 * 5. Pick "createOrderUpForm", click Run.
 * 6. Open the "Execution log" panel for the form link and the
 *    spreadsheet link. Send the form link to your friend.
 *
 * Re-running createOrderUpForm does NOT make a duplicate. It reuses the
 * form it made last time and rebuilds the questions in place, so the link
 * you already sent keeps working. Use resetOrderUpForm() if you really
 * want to start over with a brand new form.
 *
 * IF SOMETHING FAILS, read the troubleshooting notes at the bottom of
 * this file - the common causes are authorization, not the code.
 *
 * NOTE ON COPYING: pasting from a chat window can swap the straight
 * double quotes (") that delimit each string for curly ones, which
 * breaks the script with "SyntaxError: Invalid or unexpected token".
 * Copy from the raw file to be safe. Apostrophes and dashes *inside*
 * the sentences are fine either way - they are just text.
 */

var FORM_TITLE = "Order Up — Phrases I Don't Need";
var SHEET_TITLE = "Order Up — Responses";

var FORM_DESCRIPTION =
  "Check any phrase you already know and don't need to practice. " +
  "Leave everything else unchecked.";

var WHO_LABEL = { staff: "staff", you: "you", "you-start": "you start" };

var SECTIONS = [
  { title: "Cafe — Starting Your Order", items: [
    ["staff", "Hi, how are you?"],
    ["staff", "Hi, how's it going?"],
    ["staff", "What can I get for you?"],
    ["staff", "What would you like?"],
    ["you", "Good, thanks."],
    ["you", "Good, how are you?"],
    ["you", "Can I get a latte?"],
    ["you", "I'll have a latte."]
  ]},
  { title: "Cafe — Size / Hot or Iced / Milk", items: [
    ["staff", "What size?"],
    ["staff", "Hot or iced?"],
    ["staff", "What kind of milk would you like?"],
    ["you", "Small, please."],
    ["you", "Medium, please."],
    ["you", "Large, please."],
    ["you", "Hot, please."],
    ["you", "Iced, please."],
    ["you", "Oat milk, please."],
    ["you", "Almond milk, please."],
    ["you", "Regular milk, please."]
  ]},
  { title: "Cafe — For Here or To Go", items: [
    ["staff", "For here or to go?"],
    ["staff", "Anything else?"],
    ["staff", "Is that everything?"],
    ["you", "For here, please."],
    ["you", "To go, please."],
    ["you", "No, that's it. Thanks."],
    ["you", "That's all, thanks."],
    ["you", "We're all set."],
    ["you", "No, we're good."]
  ]},
  { title: "Cafe — Payment", items: [
    ["staff", "Cash or card?"],
    ["staff", "Debit or credit?"],
    ["staff", "How would you like to pay?"],
    ["staff", "You can tap right here."],
    ["staff", "Would you like your receipt?"],
    ["you", "By card."],
    ["you", "Credit."],
    ["you", "Debit."],
    ["you", "Cash."],
    ["you", "Yes, please."],
    ["you", "No, thank you."],
    ["you-start", "Can I tap?"],
    ["you-start", "Do you take Apple Pay?"]
  ]},
  { title: "Cafe — Name / Pickup / Leaving", items: [
    ["staff", "What's the name?"],
    ["staff", "Can I get a name for the order?"],
    ["staff", "Here you go."],
    ["staff", "It'll be ready shortly."],
    ["staff", "Have a great day."],
    ["staff", "Have a great night."],
    ["staff", "Take care."],
    ["you", "Harumi."],
    ["you", "Thank you."],
    ["you", "Thanks, you too."],
    ["you", "Take care."]
  ]},
  { title: "Fast Food Ordering", items: [
    ["staff", "What can I get for you?"],
    ["staff", "What would you like?"],
    ["staff", "What size?"],
    ["staff", "What would you like to drink?"],
    ["staff", "What side would you like?"],
    ["staff", "Would you like to make that a combo?"],
    ["staff", "Anything else?"],
    ["you", "Can I get the number three?"],
    ["you", "I'll have the combo."],
    ["you", "Combo, please."],
    ["you", "Medium, please."],
    ["you", "Coke, please."],
    ["you", "Fries, please."],
    ["you", "No drink, thanks."],
    ["you", "No, that's it. Thanks."]
  ]},
  { title: "When You Don't Understand", items: [
    ["you-start", "Sorry, I didn't catch that."],
    ["you-start", "Sorry, could you say that again?"],
    ["you-start", "Could you repeat that?"]
  ]},
  { title: "Cafe — When You Need to Ask", items: [
    ["you-start", "Can I get this without sugar?"],
    ["you-start", "Can I get this with oat milk?"],
    ["you-start", "Can I get this without cheese?"],
    ["you-start", "Can I get this without onions?"]
  ]},
  { title: "Restaurant — Entering / Party Size", items: [
    ["staff", "How many?"],
    ["staff", "How many people?"],
    ["staff", "Do you have a reservation?"],
    ["staff", "There's about a 20-minute wait."],
    ["you", "Two, please."],
    ["you", "Yes, we do."],
    ["you", "No, we don't."],
    ["you", "That's okay."],
    ["you", "How long is the wait?"]
  ]},
  { title: "Restaurant — Drinks", items: [
    ["staff", "Can I get you something to drink?"],
    ["staff", "What can I get you to drink?"],
    ["staff", "Would you like something to drink?"],
    ["you", "Can I get a Coke?"],
    ["you", "I'll have a Coke."],
    ["you", "Just water for me."],
    ["you", "I'll have water."],
    ["you", "I'm good, thanks."]
  ]},
  { title: "Restaurant — Ready to Order?", items: [
    ["staff", "Are you ready to order?"],
    ["staff", "Do you need another minute?"],
    ["you", "We're ready."],
    ["you", "We need another minute."]
  ]},
  { title: "Restaurant — Ordering", items: [
    ["staff", "What can I get for you?"],
    ["staff", "What would you like?"],
    ["you", "Can I get the burger?"],
    ["you", "I'll have the burger."],
    ["you", "I'll go with the burger."],
    ["you", "I'd like the burger."]
  ]},
  { title: "Questions About the Food", items: [
    ["you-start", "What do you recommend?"],
    ["you-start", "What's your most popular dish?"],
    ["you-start", "What's in this?"],
    ["you-start", "What does that come with?"],
    ["you-start", "Does this come with fries?"],
    ["you-start", "Is this spicy?"]
  ]},
  { title: "Food Restrictions / Special Requests", items: [
    ["you-start", "I'm allergic to nuts."],
    ["you-start", "I can't eat dairy."],
    ["you-start", "No onions, please."],
    ["you-start", "Can I get this without cheese?"],
    ["you-start", "Can I get this without onions?"],
    ["you-start", "Can I substitute the fries?"]
  ]},
  { title: "During the Meal", items: [
    ["staff", "How's everything?"],
    ["staff", "Is everything okay?"],
    ["staff", "Can I get you anything else?"],
    ["you", "Everything's good, thanks."],
    ["you", "It's really good."],
    ["you", "We're good, thanks."]
  ]},
  { title: "Something Is Wrong", items: [
    ["you-start", "Actually, I ordered the chicken."],
    ["you-start", "Sorry, I didn't order this."],
    ["you-start", "Could I get some more water?"],
    ["you-start", "Could I get another fork?"]
  ]},
  { title: "Food or Drink Hasn't Arrived", items: [
    ["you-start", "We're still waiting for our food."],
    ["you-start", "We haven't gotten our drinks yet."],
    ["you-start", "Could you check on our order?"]
  ]},
  { title: "Clearing the Table", items: [
    ["staff", "Can I clear these?"],
    ["staff", "Are you still working on that?"],
    ["staff", "Are you finished with that?"],
    ["you", "Yes, we're finished."],
    ["you", "I'm still working on it."],
    ["you", "You can leave it."]
  ]},
  { title: "Dessert", items: [
    ["staff", "Would you like dessert?"],
    ["staff", "Would you like to see the dessert menu?"],
    ["you", "No, thanks."],
    ["you", "Yes, let's take a look."],
    ["you", "We're too full."]
  ]},
  { title: "The Check", items: [
    ["you-start", "Can we get the check?"],
    ["you-start", "Could we get the check?"],
    ["you-start", "Can we get the bill?"]
  ]},
  { title: "Separate Checks", items: [
    ["staff", "Would you like one check or separate checks?"],
    ["staff", "Together or separate?"],
    ["you", "Together, please."],
    ["you", "Separate checks, please."],
    ["you", "Can we split the bill?"]
  ]},
  { title: "Leaving", items: [
    ["staff", "Have a great day."],
    ["staff", "Have a great night."],
    ["staff", "Have a good one!"],
    ["staff", "Take care."],
    ["you", "Thanks, you too."],
    ["you", "Thank you."],
    ["you", "Take care."]
  ]}
];

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

/**
 * Run this one. Creates the form the first time, updates it after that.
 */
function createOrderUpForm() {
  var props = PropertiesService.getScriptProperties();
  var form = openExistingForm_(props.getProperty("formId"));

  if (form) {
    Logger.log("Reusing the form created earlier - the link you already " +
               "shared stays valid.");
    clearAllItems_(form);
  } else {
    form = FormApp.create(FORM_TITLE);
    props.setProperty("formId", form.getId());
    Logger.log("Created a new form.");
  }

  form.setTitle(FORM_TITLE);
  form.setDescription(FORM_DESCRIPTION);
  form.setAcceptingResponses(true);
  form.setCollectEmail(false);
  form.setProgressBar(true);

  // Anyone-with-the-link access. On personal Gmail accounts these calls
  // are no-ops or unsupported, so failing here must not stop the build.
  tryCall_(function () { form.setRequireLogin(false); }, "setRequireLogin");
  tryCall_(function () { form.setLimitOneResponsePerUser(false); },
           "setLimitOneResponsePerUser");
  // Newer Forms need an explicit publish before the link accepts answers.
  // Older Apps Script runtimes do not have this method at all.
  tryCall_(function () {
    if (typeof form.setPublished === "function") { form.setPublished(true); }
  }, "setPublished");

  var totalChoices = 0;
  for (var i = 0; i < SECTIONS.length; i++) {
    totalChoices += addSection_(form, SECTIONS[i]);
  }

  var sheetUrl = attachResponseSheet_(form, props);

  Logger.log("--------------------------------------------------");
  Logger.log("Sections: " + SECTIONS.length + "   Phrases: " + totalChoices);
  Logger.log("SEND THIS TO YOUR FRIEND: " + safePublishedUrl_(form));
  Logger.log("EDIT THE FORM YOURSELF:   " + form.getEditUrl());
  Logger.log("RESPONSES SPREADSHEET:    " + sheetUrl);
  Logger.log("--------------------------------------------------");
}

/**
 * Reprints the three links without rebuilding anything.
 */
function showOrderUpLinks() {
  var props = PropertiesService.getScriptProperties();
  var form = openExistingForm_(props.getProperty("formId"));
  if (!form) {
    Logger.log("No form yet. Run createOrderUpForm first.");
    return;
  }
  Logger.log("SEND THIS TO YOUR FRIEND: " + safePublishedUrl_(form));
  Logger.log("EDIT THE FORM YOURSELF:   " + form.getEditUrl());
  var sheetId = props.getProperty("sheetId");
  if (sheetId) {
    Logger.log("RESPONSES SPREADSHEET:    " +
               SpreadsheetApp.openById(sheetId).getUrl());
  }
}

/**
 * Forgets the saved form so the next createOrderUpForm run builds a fresh
 * one. The old form and its answers are left untouched in your Drive.
 */
function resetOrderUpForm() {
  PropertiesService.getScriptProperties().deleteProperty("formId");
  PropertiesService.getScriptProperties().deleteProperty("sheetId");
  Logger.log("Cleared. The next createOrderUpForm run makes a new form.");
}

/**
 * Confirms the paste came through intact. It creates no form, no
 * spreadsheet and no files at all - but Apps Script decides permissions
 * by scanning the whole project, so the first run of ANY function here
 * still shows the authorization prompt. Approving it is expected.
 *
 * Expected result:
 *
 *   sections 22 / 22, phrases 152 / 152, checksum matches
 *
 * If the checksum does not match, some sentence text changed during the
 * copy - paste the file again rather than hunting for it by eye.
 */
function verifyPaste() {
  var EXPECTED_SECTIONS = 22;
  var EXPECTED_PHRASES = 152;
  var EXPECTED_CHECKSUM = 949727592;

  var all = "";
  var phrases = 0;
  var curly = [];

  for (var i = 0; i < SECTIONS.length; i++) {
    var s = SECTIONS[i];
    all += s.title;
    for (var j = 0; j < s.items.length; j++) {
      all += s.items[j][0] + s.items[j][1];
      phrases++;
      // Curly quotes are harmless to the code but change what your
      // friend reads, so flag them rather than silently keeping them.
      if (/[‘’“”]/.test(s.items[j][1])) {
        curly.push(s.title + ": " + s.items[j][1]);
      }
    }
  }

  var sum = 0;
  for (var k = 0; k < all.length; k++) {
    sum = (sum * 31 + all.charCodeAt(k)) % 1000000007;
  }

  Logger.log("sections: " + SECTIONS.length + " / " + EXPECTED_SECTIONS);
  Logger.log("phrases:  " + phrases + " / " + EXPECTED_PHRASES);

  var ok = SECTIONS.length === EXPECTED_SECTIONS &&
           phrases === EXPECTED_PHRASES &&
           sum === EXPECTED_CHECKSUM;

  if (ok) {
    Logger.log("checksum: matches. The paste is intact.");
  } else {
    Logger.log("checksum: " + sum + " (expected " + EXPECTED_CHECKSUM + ")");
    Logger.log("SOMETHING CHANGED during the copy. Paste the file again.");
  }

  for (var m = 0; m < curly.length; m++) {
    Logger.log("Curly quote found in - " + curly[m]);
  }

  return ok;
}

/**
 * Tiny form with one question. Run this second, to confirm the project is
 * authorized. If this fails, the problem is permissions, not the phrases.
 */
function quickTest() {
  var form = FormApp.create("Order Up - permission test (safe to delete)");
  form.addCheckboxItem().setTitle("Test").setChoiceValues(["A", "B"]);
  Logger.log("Authorization works. Test form: " + form.getEditUrl());
  Logger.log("You can delete that test form from your Drive.");
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function addSection_(form, section) {
  var seen = {};
  var choices = [];

  for (var i = 0; i < section.items.length; i++) {
    var who = section.items[i][0];
    var phrase = String(section.items[i][1]).trim();
    if (!phrase) { continue; }

    var label = phrase + "  (" + (WHO_LABEL[who] || who) + ")";
    // Forms rejects an item that lists the same option twice.
    if (seen[label]) {
      Logger.log("Skipped duplicate in \"" + section.title + "\": " + label);
      continue;
    }
    seen[label] = true;
    choices.push(label);
  }

  if (choices.length === 0) {
    Logger.log("Skipped empty section: " + section.title);
    return 0;
  }

  var item = form.addCheckboxItem();
  item.setTitle(section.title);
  item.setChoiceValues(choices);
  item.setRequired(false);
  return choices.length;
}

function openExistingForm_(formId) {
  if (!formId) { return null; }
  try {
    return FormApp.openById(formId);
  } catch (err) {
    // Deleted, trashed, or owned by another account now.
    Logger.log("Saved form is gone, building a new one. (" +
               err.message + ")");
    return null;
  }
}

function clearAllItems_(form) {
  var items = form.getItems();
  for (var i = items.length - 1; i >= 0; i--) {
    form.deleteItem(items[i]);
  }
}

function attachResponseSheet_(form, props) {
  var sheetId = props.getProperty("sheetId");

  if (sheetId) {
    try {
      var existing = SpreadsheetApp.openById(sheetId);
      if (form.getDestinationId() !== sheetId) {
        form.setDestination(FormApp.DestinationType.SPREADSHEET, sheetId);
      }
      return existing.getUrl();
    } catch (err) {
      Logger.log("Saved spreadsheet is gone, making a new one.");
    }
  }

  var ss = SpreadsheetApp.create(SHEET_TITLE);
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
  props.setProperty("sheetId", ss.getId());
  return ss.getUrl();
}

function safePublishedUrl_(form) {
  try {
    return form.getPublishedUrl();
  } catch (err) {
    return "https://docs.google.com/forms/d/" + form.getId() + "/viewform";
  }
}

function tryCall_(fn, name) {
  try {
    fn();
  } catch (err) {
    Logger.log("Note: " + name + " is not available on this account - " +
               "skipping it. (" + err.message + ")");
  }
}

/* ------------------------------------------------------------------ */
/* TROUBLESHOOTING                                                     */
/* ------------------------------------------------------------------ */
/*
 * "SyntaxError: Invalid or unexpected token"
 *     The paste got mangled. Copying code out of a chat window can turn
 *     ' into a curly quote. Select all in the editor, delete, and paste
 *     this file again from the raw file rather than from chat.
 *
 * "Google hasn't verified this app" / "This app is blocked"
 *     Normal for a script you wrote yourself. Click Advanced, then
 *     "Go to <project name> (unsafe)", then Allow. If you are on a
 *     school or work Google account, an administrator may block this
 *     entirely - use a personal Gmail account instead.
 *
 * "You do not have permission to call FormApp.create"
 *     The script never got authorized. Run quickTest and approve the
 *     prompt, then run createOrderUpForm again.
 *
 * "TypeError: FormApp.create is not a function"
 *     The project is an Apps Script for a different product. Start over
 *     at script.google.com with a blank standalone project.
 *
 * Nothing appears when you click Run
 *     Check the function dropdown at the top - it must say
 *     createOrderUpForm, not one of the helpers. Then open the
 *     "Execution log" panel at the bottom.
 *
 * The form link asks your friend to sign in
 *     Open the form, click Settings, and turn off any option limiting it
 *     to one response or to your organization. On a personal account
 *     this is off by default.
 */
