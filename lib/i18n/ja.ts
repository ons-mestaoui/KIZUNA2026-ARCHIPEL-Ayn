// Short, plain Japanese. Ask a native reader to review before the pitch.
import type { Dict } from "./en";

export const ja: Dict = {
  appName: "Goutte d'Or",
  tagline: "畑に水をやる最適なタイミングがわかります。",
  common: {
    signIn: "ログイン",
    signUp: "アカウント作成",
    signOut: "ログアウト",
    email: "メールアドレス",
    password: "パスワード",
    name: "お名前",
    loading: "読み込み中…",
    back: "戻る",
    next: "次へ",
    save: "保存",
    cancel: "キャンセル",
    language: "言語",
  },
  landing: {
    title: "勘ではなく、天気と太陽で畑に水をやる。",
    lead: "畑の場所を教えてください。Goutte d'Or が天気と衛星データを読み取り、いつ・どれだけ水をやるか、ソーラーポンプをいつ動かすかをお知らせします。",
    cta: "農園アカウントを作成",
    haveAccount: "アカウントをお持ちの方",
    features: [
      { title: "灌漑プラン", text: "あなたの畑のための、毎日と7日間のプラン。" },
      { title: "葉のチェック", text: "葉の写真を撮ると、水不足・栄養不足・害虫のどれかがわかります。" },
      { title: "なんでも質問", text: "アラビア語、チュニジア方言、フランス語、日本語、英語でチャット。答えは音声でも聞けます。" },
      { title: "宇宙から見る", text: "日本とヨーロッパの衛星による雨量、土壌水分、地表温度。" },
    ],
    kizuna: "Kizuna ハッカソン（チュニジア × 日本）のために制作。",
  },
  auth: {
    signInTitle: "おかえりなさい",
    signUpTitle: "アカウントを作成",
    noAccount: "初めての方",
    hasAccount: "アカウントをお持ちの方",
    passwordHint: "8文字以上",
    noReset: "このプロトタイプにはパスワード再設定がありません。パスワードは大切に保管してください。",
    errors: {
      generic: "問題が発生しました。もう一度お試しください。",
      invalid: "メールアドレスまたはパスワードが違います。",
      exists: "このメールアドレスは登録済みです。",
      short: "パスワードは8文字以上にしてください。",
      offline: "サーバーに接続できません。通信環境を確認してください。",
    },
  },
  shell: {
    hello: "{name} さん、こんにちは",
    tabs: {
      today: "今日",
      week: "週間",
      leaf: "葉のチェック",
      ask: "質問",
      satellite: "衛星",
      farm: "農園",
    },
    soon: "農園アプリのこの部分は準備中です。",
  },
};
