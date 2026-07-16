import type { RelationDetail } from "./relations";

export type WordEntry = {
  word: string;
  phonetic: string;
  part: string;
  meaning: string;
  summary: string;
  example: string;
  exampleZh: string;
  synonyms: [string, string];
  antonyms: [string, string];
  relations: RelationDetail[];
};

export type DictionarySeed = Omit<WordEntry, "relations">;

export const dictionary: DictionarySeed[] = [
  { word: "serendipity", phonetic: "/ˌserənˈdɪpəti/", part: "n.", meaning: "意外发现美好事物的幸运", summary: "在没有刻意寻找时，偶然遇见有价值或令人愉悦之物。", example: "Finding that tiny bookstore was pure serendipity.", exampleZh: "发现那家小书店纯属意外之喜。", synonyms: ["chance", "fortune"], antonyms: ["misfortune", "design"] },
  { word: "resilient", phonetic: "/rɪˈzɪliənt/", part: "adj.", meaning: "有韧性的；能迅速恢复的", summary: "经历压力、困难或变化后，仍能恢复并继续前进。", example: "Children are often more resilient than adults expect.", exampleZh: "孩子往往比成年人想象得更有韧性。", synonyms: ["tough", "adaptable"], antonyms: ["fragile", "vulnerable"] },
  { word: "meticulous", phonetic: "/məˈtɪkjələs/", part: "adj.", meaning: "一丝不苟的；极其仔细的", summary: "对细节给予高度关注，做事精确而周到。", example: "She kept meticulous records of every experiment.", exampleZh: "她一丝不苟地记录每次实验。", synonyms: ["careful", "precise"], antonyms: ["careless", "sloppy"] },
  { word: "ephemeral", phonetic: "/ɪˈfemərəl/", part: "adj.", meaning: "短暂的；转瞬即逝的", summary: "存在或流行的时间非常短，带有稍纵即逝的意味。", example: "Online fame can be surprisingly ephemeral.", exampleZh: "网络名气可能出奇地短暂。", synonyms: ["fleeting", "transient"], antonyms: ["lasting", "permanent"] },
  { word: "ambiguous", phonetic: "/æmˈbɪɡjuəs/", part: "adj.", meaning: "模棱两可的；含糊的", summary: "可以有不止一种解释，因此意思并不明确。", example: "The ending of the film is deliberately ambiguous.", exampleZh: "电影的结局被刻意处理得模棱两可。", synonyms: ["unclear", "equivocal"], antonyms: ["explicit", "definite"] },
  { word: "pragmatic", phonetic: "/præɡˈmætɪk/", part: "adj.", meaning: "务实的；讲求实际的", summary: "重视可行的结果与现实条件，而非只关注理论。", example: "We need a pragmatic solution to the problem.", exampleZh: "我们需要一个解决问题的务实方案。", synonyms: ["practical", "realistic"], antonyms: ["idealistic", "impractical"] },
  { word: "eloquent", phonetic: "/ˈeləkwənt/", part: "adj.", meaning: "雄辩的；表达有力的", summary: "能够清晰、有感染力地表达观点或情感。", example: "Her silence was more eloquent than any speech.", exampleZh: "她的沉默比任何演讲都更有表现力。", synonyms: ["expressive", "articulate"], antonyms: ["inarticulate", "halting"] },
  { word: "ubiquitous", phonetic: "/juːˈbɪkwɪtəs/", part: "adj.", meaning: "无处不在的；普遍存在的", summary: "似乎在所有地方都能看到或遇到。", example: "Smartphones have become ubiquitous in modern life.", exampleZh: "智能手机在现代生活中已经无处不在。", synonyms: ["pervasive", "universal"], antonyms: ["rare", "scarce"] },
  { word: "benevolent", phonetic: "/bəˈnevələnt/", part: "adj.", meaning: "仁慈的；乐善好施的", summary: "愿意帮助他人，表现出善意与慷慨。", example: "The fund was created by a benevolent donor.", exampleZh: "这项基金由一位慈善捐助者设立。", synonyms: ["kind", "charitable"], antonyms: ["malevolent", "cruel"] },
  { word: "candid", phonetic: "/ˈkændɪd/", part: "adj.", meaning: "坦率的；直言不讳的", summary: "诚实直接地表达真实想法，不刻意掩饰。", example: "He gave a candid account of his mistakes.", exampleZh: "他坦率地讲述了自己的错误。", synonyms: ["frank", "honest"], antonyms: ["guarded", "deceptive"] },
  { word: "diligent", phonetic: "/ˈdɪlɪdʒənt/", part: "adj.", meaning: "勤勉的；认真努力的", summary: "持续认真地投入工作，并且注意把事情做好。", example: "A diligent student reviews a little every day.", exampleZh: "勤奋的学生每天都会复习一点。", synonyms: ["industrious", "assiduous"], antonyms: ["lazy", "negligent"] },
  { word: "novel", phonetic: "/ˈnɒvl/", part: "adj.", meaning: "新颖的；与众不同的", summary: "以新的、不同寻常的方式出现或解决问题。", example: "The team proposed a novel approach to learning.", exampleZh: "团队提出了一种新颖的学习方法。", synonyms: ["original", "innovative"], antonyms: ["conventional", "familiar"] },
  { word: "plausible", phonetic: "/ˈplɔːzəbl/", part: "adj.", meaning: "看似合理的；可信的", summary: "根据现有信息显得有可能是真的或可行的。", example: "Her explanation sounded entirely plausible.", exampleZh: "她的解释听起来完全可信。", synonyms: ["credible", "believable"], antonyms: ["unlikely", "implausible"] },
  { word: "concise", phonetic: "/kənˈsaɪs/", part: "adj.", meaning: "简明的；言简意赅的", summary: "用很少的词清楚表达所需信息，没有冗余。", example: "Keep your answer clear and concise.", exampleZh: "让你的回答清楚而简洁。", synonyms: ["brief", "succinct"], antonyms: ["verbose", "rambling"] },
  { word: "vivid", phonetic: "/ˈvɪvɪd/", part: "adj.", meaning: "生动的；鲜明的", summary: "形象或感受非常清晰、强烈，仿佛就在眼前。", example: "I still have vivid memories of that summer.", exampleZh: "我对那个夏天仍有鲜明的记忆。", synonyms: ["graphic", "striking"], antonyms: ["dull", "faint"] },
  { word: "tranquil", phonetic: "/ˈtræŋkwɪl/", part: "adj.", meaning: "宁静的；平和的", summary: "环境或心境安静、平稳，没有干扰与焦虑。", example: "The lake was tranquil at dawn.", exampleZh: "黎明时的湖面十分宁静。", synonyms: ["peaceful", "serene"], antonyms: ["turbulent", "agitated"] },
  { word: "arduous", phonetic: "/ˈɑːdjuəs/", part: "adj.", meaning: "艰巨的；费力的", summary: "需要付出大量体力、精力或耐心才能完成。", example: "Learning a language is an arduous but rewarding journey.", exampleZh: "学习语言是一段艰辛但值得的旅程。", synonyms: ["strenuous", "demanding"], antonyms: ["easy", "effortless"] },
  { word: "skeptical", phonetic: "/ˈskeptɪkl/", part: "adj.", meaning: "怀疑的；持保留态度的", summary: "在获得足够证据之前，不轻易相信某个说法。", example: "She was skeptical of claims without evidence.", exampleZh: "她对没有证据的说法持怀疑态度。", synonyms: ["doubtful", "questioning"], antonyms: ["convinced", "credulous"] },
  { word: "obsolete", phonetic: "/ˈɒbsəliːt/", part: "adj.", meaning: "过时的；已淘汰的", summary: "因为出现更新替代品而不再被使用或需要。", example: "Many devices become obsolete within a decade.", exampleZh: "许多设备在十年内就会被淘汰。", synonyms: ["outdated", "antiquated"], antonyms: ["current", "modern"] },
  { word: "versatile", phonetic: "/ˈvɜːsətaɪl/", part: "adj.", meaning: "多才多艺的；用途广泛的", summary: "能够适应多种任务、用途或环境。", example: "This versatile tool works on both web and mobile.", exampleZh: "这个多用途工具可用于网页和移动端。", synonyms: ["adaptable", "multifaceted"], antonyms: ["limited", "inflexible"] },
  { word: "coherent", phonetic: "/kəʊˈhɪərənt/", part: "adj.", meaning: "连贯的；条理清晰的", summary: "各部分逻辑一致、组织合理，容易理解。", example: "The report presents a coherent argument.", exampleZh: "这份报告提出了一个连贯的论点。", synonyms: ["logical", "consistent"], antonyms: ["confused", "incoherent"] },
  { word: "reluctant", phonetic: "/rɪˈlʌktənt/", part: "adj.", meaning: "不情愿的；勉强的", summary: "因为犹豫、担忧或缺乏兴趣而不愿采取行动。", example: "He was reluctant to change a familiar routine.", exampleZh: "他不情愿改变熟悉的日常习惯。", synonyms: ["hesitant", "unwilling"], antonyms: ["eager", "willing"] },
  { word: "profound", phonetic: "/prəˈfaʊnd/", part: "adj.", meaning: "深刻的；影响深远的", summary: "在思想、情感或影响层面达到很深的程度。", example: "Small habits can have a profound effect over time.", exampleZh: "小习惯日积月累会产生深远影响。", synonyms: ["deep", "significant"], antonyms: ["shallow", "superficial"] },
  { word: "spontaneous", phonetic: "/spɒnˈteɪniəs/", part: "adj.", meaning: "自发的；自然产生的", summary: "没有提前计划或外部强迫，自然而然地发生。", example: "Their spontaneous applause filled the room.", exampleZh: "他们自发的掌声响彻房间。", synonyms: ["impromptu", "unplanned"], antonyms: ["planned", "deliberate"] },
];

export const wordByName = (word: string) => dictionary.find((item) => item.word === word);
