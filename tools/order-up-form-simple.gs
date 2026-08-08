/**
 * ORDER UP - builds the Google Form.
 *
 * 1. script.google.com -> New project
 * 2. Select all, delete, paste this in, save
 * 3. Run createOrderUpForm, approve the permission prompt
 * 4. Open the Execution log for the links
 */

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

function createOrderUpForm() {
  var form = FormApp.create("Order Up — Phrases I Don't Need");
  form.setDescription(
    "Check any phrase you already know and don't need to practice. " +
    "Leave everything else unchecked."
  );

  SECTIONS.forEach(function (section) {
    var choices = section.items.map(function (pair) {
      return pair[1] + "  (" + WHO_LABEL[pair[0]] + ")";
    });
    form.addCheckboxItem()
        .setTitle(section.title)
        .setChoiceValues(choices)
        .setRequired(false);
  });

  // Newer Google Forms need an explicit publish before the link will
  // accept answers. Older versions have no such method, so ignore it.
  try {
    if (typeof form.setPublished === "function") { form.setPublished(true); }
  } catch (e) {}

  var ss = SpreadsheetApp.create("Order Up — Responses");
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());

  Logger.log("SEND TO YOUR FRIEND: " + form.getPublishedUrl());
  Logger.log("EDIT THE FORM:       " + form.getEditUrl());
  Logger.log("RESPONSES:           " + ss.getUrl());
}
