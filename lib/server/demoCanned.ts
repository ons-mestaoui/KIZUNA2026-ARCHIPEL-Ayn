import type { Diagnosis } from "@/lib/diagnosis-schema";
import { demoFocusZone } from "./demoField";
import type { Lang } from "@/lib/i18n";

// Saved answers for an OFFLINE presentation (DEMO_OFFLINE=1): the venue's Wi-Fi or the free AI quota
// must not be able to break the pitch. They are labelled "Saved demo answer" in the interface.

export const CANNED_DIAGNOSIS: Record<Lang, Diagnosis> = {
  en: {
    category: "pest",
    name: "Tuta absoluta (tomato leafminer)",
    confidence: "high",
    summary: "Small caterpillars and tunnels inside the leaf are typical of the tomato leafminer.",
    evidence: ["A small caterpillar on the leaf", "Pale, winding tunnels (mines) inside the leaf", "Dark droppings in the tunnels"],
    actions: [
      "Pick and destroy the affected leaves, away from the field.",
      "Hang pheromone traps and yellow sticky traps to catch the adult moths.",
      "Spray Bacillus thuringiensis on young larvae if the damage spreads.",
      "Ask your local agricultural adviser (CRDA) before any chemical treatment, and respect the pre-harvest interval.",
    ],
    waterAdvice: "This is not caused by water stress. Keep following today's watering plan.",
    needsExpert: false,
    voice: "Your tomato plants have leafminer caterpillars. Remove the damaged leaves and set up pheromone traps.",
  },
  ar: {
    category: "pest",
    name: "Tuta absoluta (دودة الطماطم)",
    confidence: "high",
    summary: "عندك دود صغير ومسالك داخل الورقة، وهاذي علامات دودة الطماطم.",
    evidence: ["دودة صغيرة على الورقة", "مسالك شاحبة ملوية داخل الورقة", "فضلات سودة داخل المسالك"],
    actions: [
      "قلّع الأوراق المصابة وبعّدها على الحقل.",
      "علّق مصايد فرمونية ولاصقة صفراء باش تصيد الفراشات.",
      "رشّ Bacillus thuringiensis على اليرقات الصغار إذا الإصابة تزيد.",
      "قبل أي دواء كيميائي، اسأل مرشد الفلاحة (CRDA) واحترم مدة الأمان قبل الجني.",
    ],
    waterAdvice: "هاذي موش من العطش. كمّل على برنامج السقي متاع اليوم.",
    needsExpert: false,
    voice: "عندك دودة الطماطم في الزرع. قلّع الأوراق المصابة وركّب مصايد فرمونية.",
  },
  ja: {
    category: "pest",
    name: "トマトキバガ（Tuta absoluta）",
    confidence: "high",
    summary: "葉の中の小さな幼虫と食害のトンネルは、トマトキバガの典型的な症状です。",
    evidence: ["葉の上の小さな幼虫", "葉の内側の白っぽく曲がりくねったトンネル", "トンネル内の黒いふん"],
    actions: [
      "被害を受けた葉を摘み取り、畑の外で処分する。",
      "フェロモントラップと黄色粘着シートを設置して成虫を捕獲する。",
      "被害が広がる場合は、若い幼虫にBT剤（Bacillus thuringiensis）を散布する。",
      "薬剤を使う前に地域の農業指導員（CRDA）に相談し、収穫前日数を守る。",
    ],
    waterAdvice: "水不足が原因ではありません。今日の水やりプランのまま続けてください。",
    needsExpert: false,
    voice: "トマトにトマトキバガの幼虫がいます。被害を受けた葉を取り除き、フェロモントラップを設置してください。",
  },
};

type Intent = "zone" | "rain" | "water" | "pump" | "leaf" | "other";

const CANNED: Record<Lang, Record<Intent, string>> = {
  en: {
    zone: "On the satellite view, zone {zone} is the weakest and driest part of your field. Your plan still decides how much water: start there. It looked the same on the earlier pass, so go and see whether it is thin canopy, young trees or a dry patch.",
    rain: "The forecast shows only light rain this week, so do not count on it for irrigation. The Week tab has the day-by-day numbers.",
    water: "Water only when the root zone is below the stress threshold. The Today tab shows if you should water, how much, and when.",
    pump: "Run the solar pump at the sunniest hours to fill the basin, and water from the basin at dawn and dusk. The pumping chart shows the plan hour by hour.",
    leaf: "Take a clear photo in the Leaf check tab. Yellow leaves can mean thirst, missing nutrients, a pest or a disease.",
    other: "I am in saved demo mode, so I can only answer a few questions about watering, rain, the pump and sick leaves.",
  },
  ar: {
    zone: "على صورة القمر الصناعي، المنطقة {zone} هي أضعف وأجف جزء في حقلك. خطة السقي تحدد الكمية، وابدا منها. كانت هكاكا حتى في الصورة اللي قبلها، اذهب شوفها: يمكن شجر خفيف ولا صغير ولا بقعة ناشفة.",
    rain: "التوقعات تقول مطر خفيف برك الجمعة هاذي، ما تعتمدش عليه في السقي. شوف تبويب الأسبوع للأرقام نهار بنهار.",
    water: "ما تسقيش كان الأرض نزلت تحت حد الإجهاد. افتح تبويب اليوم: يقلك تسقي ولا لا، قداه، وفي أنا وقت.",
    pump: "شغّل المضخة الشمسية في أشمس الساعات باش تعمّر الحوض، واسقي من الحوض الفجر والغروب. رسم الضخ يوريك البرنامج ساعة بساعة.",
    leaf: "صوّر الورقة بوضوح في تبويب فحص الأوراق. الأوراق الصفراء ممكن تكون عطش ولا نقص أسمدة ولا آفة ولا مرض.",
    other: "أنا في وضع العرض المحفوظ، نجاوب برك على أسئلة قليلة على السقي والمطر والمضخة والأوراق المريضة.",
  },
  ja: {
    zone: "衛星画像では、区画{zone}が畑の中で最も弱く、最も乾いています。水の量はプランどおりで、まずそこから始めてください。前回の画像でも同じ状態だったので、樹冠が薄いのか、若木なのか、乾いた部分なのかを現地で確認してください。",
    rain: "今週は弱い雨の予報なので、灌漑の頼りにはしないでください。日ごとの数値は「週間」タブで確認できます。",
    water: "根域の水分がストレスの限界を下回ったときだけ水をやります。「今日」タブで、水やりの要否・量・時間帯を確認できます。",
    pump: "ソーラーポンプは日射の強い時間に動かして貯水池にため、夜明けと夕方に水やりをします。汲み上げのグラフに1時間ごとのプランがあります。",
    leaf: "「葉のチェック」タブではっきりした写真を撮ってください。葉が黄色いのは、水不足・栄養不足・害虫・病気のどれかかもしれません。",
    other: "保存済みのデモモードのため、水やり・雨・ポンプ・病気の葉についての質問にだけお答えできます。",
  },
};

const AR_LETTERS: Record<string, string> = { A: "أ", B: "ب", C: "ج", D: "د" };

export function cannedAnswer(message: string, lang: Lang): string {
  const intent: Intent = /(zone|which part|part of (my|the) field|satellite|ndvi|greenness|منطقة|مناطق|جزء|قمر|区画|どの部分|衛星)/i.test(message)
    ? "zone"
    : /(مطر|شتا|rain|pluie|雨)/i.test(message)
    ? "rain"
    : /(سق|ري|water|irrigat|arros|水やり|灌漑)/i.test(message)
      ? "water"
      : /(مضخ|pump|pompe|ポンプ)/i.test(message)
        ? "pump"
        : /(ورق|تصفار|leaf|leaves|yellow|jaune|葉|黄)/i.test(message)
          ? "leaf"
          : "other";
  const text = CANNED[lang][intent];
  if (intent !== "zone") return text;
  const id = demoFocusZone();
  return id ? text.replace("{zone}", lang === "ar" ? (AR_LETTERS[id] ?? id) : id) : CANNED[lang].other;
}

export const demoOffline = () => process.env.DEMO_OFFLINE === "1";
