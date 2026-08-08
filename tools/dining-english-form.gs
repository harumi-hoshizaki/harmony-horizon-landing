/**
 * REAL-LIFE DINING ENGLISH — アプリ全文からフォームを作ります。
 *
 * 1. script.google.com → 新しいプロジェクト
 * 2. 全選択して消し、これを貼り付けて保存
 * 3. createOrderUpForm を実行し、権限を承認
 * 4. 実行ログに出るリンクをお友達に送る
 */

var WHO_LABEL = { staff: "店員", you: "自分", "you-start": "自分から" };

var SECTIONS = [
  { title: "☕ FLOW 1 ｜ 入店・注文を始める", items: [
    ["staff", "Hi, how are you?"],
    ["staff", "Hi, how's it going?"],
    ["staff", "What can I get for you?"],
    ["staff", "What can I get started for you?"],
    ["staff", "What would you like?"],
    ["you", "Good, thanks."],
    ["you", "Good, how are you?"],
    ["you", "Pretty good."],
    ["you", "Can I get a latte?"],
    ["you", "I'll have a latte."],
    ["you", "Could I get a latte?"]
  ]},
  { title: "☕ FLOW 2 ｜ サイズ・温度・ミルク", items: [
    ["staff", "What size?"],
    ["staff", "What size would you like?"],
    ["staff", "Hot or iced?"],
    ["staff", "What kind of milk would you like?"],
    ["staff", "What kind of milk?"],
    ["you", "Small, please."],
    ["you", "Medium, please."],
    ["you", "Large, please."],
    ["you", "Hot, please."],
    ["you", "Iced, please."],
    ["you", "Oat milk, please."],
    ["you", "Almond milk, please."],
    ["you", "Regular milk, please."]
  ]},
  { title: "☕ FLOW 3 ｜ カスタマイズ・追加注文・店内／持ち帰り", items: [
    ["staff", "Would you like any flavoring?"],
    ["staff", "Would you like that warmed up?"],
    ["staff", "For here or to go?"],
    ["staff", "For here?"],
    ["staff", "Anything else?"],
    ["staff", "Can I get you anything else?"],
    ["staff", "Is that everything?"],
    ["you", "Yes, please."],
    ["you", "No, thanks."],
    ["you", "For here, please."],
    ["you", "To go, please."],
    ["you", "No, that's it. Thanks."],
    ["you", "That's all, thanks."],
    ["you", "We're all set."]
  ]},
  { title: "☕ FLOW 4 ｜ 支払い", items: [
    ["staff", "Cash or card?"],
    ["staff", "Debit or credit?"],
    ["staff", "How would you like to pay?"],
    ["staff", "You can tap right here."],
    ["staff", "Would you like a receipt?"],
    ["you", "By card."],
    ["you", "Credit."],
    ["you", "Debit."],
    ["you", "Cash."],
    ["you", "Yes, please."],
    ["you", "No, thank you."]
  ]},
  { title: "☕ FLOW 5 ｜ 名前・受け取り・退店", items: [
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
  { title: "🍔 FLOW 6 ｜ ファストフード", items: [
    ["staff", "What can I get for you?"],
    ["staff", "What would you like?"],
    ["staff", "Is that a meal or just the sandwich?"],
    ["staff", "Would you like to make that a combo?"],
    ["staff", "What would you like to drink?"],
    ["staff", "What size would you like?"],
    ["staff", "What would you like for your side?"],
    ["staff", "For here or to go?"],
    ["staff", "Anything else?"],
    ["staff", "Is that everything?"],
    ["you", "Can I get the number three?"],
    ["you", "I'll have the combo."],
    ["you", "Just the sandwich, please."],
    ["you", "I'll make it a combo."],
    ["you", "Coke, please."],
    ["you", "Medium, please."],
    ["you", "Fries, please."],
    ["you", "For here, please."],
    ["you", "To go, please."],
    ["you", "No, that's it. Thanks."]
  ]},
  { title: "☕ 自分から言う ｜ カフェ・ファストフード", items: [
    ["you-start", "Can I get a latte?"],
    ["you-start", "Can I get this iced?"],
    ["you-start", "Can I get this with oat milk?"],
    ["you-start", "Can I get this without sugar?"],
    ["you-start", "Can I tap?"],
    ["you-start", "Do you take Apple Pay?"],
    ["you-start", "Can I get this to go?"],
    ["you-start", "Could you warm this up?"]
  ]},
  { title: "🆘 聞き返しミニスキル ｜ 「分からない」を乗り越える", items: [
    ["you-start", "Sorry, I didn't catch that."],
    ["you-start", "Sorry, could you say that again?"],
    ["you-start", "Could you repeat that?"],
    ["you-start", "What are my options?"],
    ["you-start", "What's the difference?"],
    ["you-start", "What do you recommend?"]
  ]},
  { title: "🍽️ FLOW 1 ｜ 入店・人数・予約・待ち時間", items: [
    ["staff", "How many?"],
    ["staff", "How many people?"],
    ["staff", "Do you have a reservation?"],
    ["staff", "There's about a 20-minute wait."],
    ["staff", "It'll be about a 20-minute wait."],
    ["you", "Two, please."],
    ["you", "Yes, we do."],
    ["you", "No, we don't."],
    ["you", "That's okay."],
    ["you", "How long is the wait?"],
    ["you-start", "Do you have a table for two?"]
  ]},
  { title: "🍽️ FLOW 2 ｜ 飲み物", items: [
    ["staff", "Can I get you something to drink?"],
    ["staff", "What can I get you to drink?"],
    ["staff", "Would you like something to drink?"],
    ["staff", "Can I start you off with something to drink?"],
    ["you", "Can I get a Coke?"],
    ["you", "I'll have a Coke."],
    ["you", "I'll have water."],
    ["you", "Just water for me."],
    ["you", "I'm good, thanks."]
  ]},
  { title: "🍽️ FLOW 3 ｜ 注文する？もう少し考える？", items: [
    ["staff", "Ready to order?"],
    ["staff", "Are you ready to order?"],
    ["staff", "Do you need another minute?"],
    ["staff", "Are you still deciding?"],
    ["you", "We're ready."],
    ["you", "I'm ready."],
    ["you", "We need another minute."],
    ["you", "Could we have another minute?"]
  ]},
  { title: "🍽️ FLOW 4 ｜ 注文", items: [
    ["staff", "What can I get for you?"],
    ["staff", "What would you like?"],
    ["you", "Can I get the burger?"],
    ["you", "I'll have the burger."],
    ["you", "I'll go with the burger."],
    ["you", "I'd like the burger."]
  ]},
  { title: "🍽️ FLOW 5 ｜ 料理の内容・おすすめ・変更", items: [
    ["you-start", "What do you recommend?"],
    ["you-start", "What's your most popular dish?"],
    ["you-start", "What's in this?"],
    ["you-start", "What does that come with?"],
    ["you-start", "Does this come with fries?"],
    ["you-start", "Is this spicy?"],
    ["you-start", "Can I substitute the fries?"],
    ["you-start", "Can I get it without onions?"],
    ["you-start", "Can I get this without cheese?"]
  ]},
  { title: "🍽️ FLOW 6 ｜ 食事中・お皿を下げる", items: [
    ["staff", "How's everything?"],
    ["staff", "How's everything tasting?"],
    ["staff", "Everything okay?"],
    ["staff", "You guys doing okay?"],
    ["staff", "Can I clear these?"],
    ["staff", "Are you still working on that?"],
    ["staff", "Are you finished with that?"],
    ["you", "Everything's good, thanks."],
    ["you", "It's really good."],
    ["you", "We're good, thanks."],
    ["you", "Yes, we're finished."],
    ["you", "I'm still working on it."],
    ["you", "You can leave it."]
  ]},
  { title: "🍽️ FLOW 7 ｜ 食事中に何か必要", items: [
    ["you-start", "Could I get some more water?"],
    ["you-start", "Could I get another fork?"],
    ["you-start", "Could I get some napkins?"],
    ["you-start", "Could I get some ketchup?"]
  ]},
  { title: "🍽️ FLOW 8 ｜ 注文・料理に問題があったとき", items: [
    ["you-start", "Sorry, I didn't order this."],
    ["you-start", "I ordered the chicken."],
    ["you-start", "We're still waiting for our food."],
    ["you-start", "We haven't gotten our drinks yet."],
    ["you-start", "Could you check on our order?"]
  ]},
  { title: "🍽️ FLOW 9 ｜ デザート", items: [
    ["staff", "Would you like dessert?"],
    ["staff", "Would you like to see the dessert menu?"],
    ["staff", "Can I get you anything else?"],
    ["you", "No, thanks."],
    ["you", "Yes, let's take a look."],
    ["you", "We're too full."],
    ["you", "No, we're good, thanks."]
  ]},
  { title: "🍽️ FLOW 10 ｜ 会計", items: [
    ["you-start", "Can we get the check?"],
    ["you-start", "Could we get the check?"],
    ["you-start", "Can we get the bill?"],
    ["staff", "Would you like one check or separate checks?"],
    ["staff", "Together or separate?"],
    ["you", "Together, please."],
    ["you", "Separate checks, please."],
    ["you", "We'll pay together."]
  ]},
  { title: "🍽️ FLOW 11 ｜ 退店", items: [
    ["staff", "Have a great day."],
    ["staff", "Have a great night."],
    ["staff", "Have a good one!"],
    ["staff", "Take care."],
    ["you", "Thanks, you too."],
    ["you", "Thank you."],
    ["you", "Take care."]
  ]}];

function createOrderUpForm() {
  var form = FormApp.create("REAL-LIFE DINING ENGLISH — 使わない文チェック");
  form.setDescription(
    "すでに言える文・使わない文にチェックを入れてください。\n" +
    "練習したい文はチェックせずに残してください。\n" +
    "最後に一番下の「送信」を押してください。\n\n" +
    "（店員）＝相手が言う　（自分）＝それに返す　（自分から）＝自分から言う"
  );
  form.setProgressBar(true);

  SECTIONS.forEach(function (section) {
    var choices = section.items.map(function (pair) {
      return pair[1] + "  （" + WHO_LABEL[pair[0]] + "）";
    });
    form.addCheckboxItem()
        .setTitle(section.title)
        .setChoiceValues(choices)
        .setRequired(false);
  });

  // 新しい Google フォームは明示的に公開しないと回答を受け付けません。
  try {
    if (typeof form.setPublished === "function") { form.setPublished(true); }
  } catch (e) {}

  var ss = SpreadsheetApp.create("REAL-LIFE DINING ENGLISH — 回答");
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());

  Logger.log("お友達に送るリンク: " + form.getPublishedUrl());
  Logger.log("自分で編集する用　: " + form.getEditUrl());
  Logger.log("回答スプレッドシート: " + ss.getUrl());
}
