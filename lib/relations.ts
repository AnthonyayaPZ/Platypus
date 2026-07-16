export type RelationDetail = {
  word: string;
  type: "synonym" | "antonym";
  comparison: string;
  usage: string;
};

const s = (word: string, comparison: string, usage: string): RelationDetail => ({ word, type: "synonym", comparison, usage });
const a = (word: string, comparison: string, usage: string): RelationDetail => ({ word, type: "antonym", comparison, usage });

export const relationDetails: Record<string, RelationDetail[]> = {
  serendipity: [
    s("chance", "都与偶然有关；chance 是中性的偶然或可能性，serendipity 特指偶然发现了有价值的事物。", "描述随机相遇用 chance；强调意外之喜或偶然发现时用 serendipity。"),
    s("fortune", "都带有幸运意味；fortune 强调好运本身，serendipity 强调没有寻找却意外发现的过程。", "谈整体运气用 fortune；讲一次意外发现带来的幸运时用 serendipity。"),
    a("misfortune", "misfortune 指不幸事件或坏运气，与 serendipity 带来的积极意外结果相反。", "用于事故、损失等负面遭遇；serendipity 用于令人愉悦的偶然发现。"),
    a("design", "design 在这里表示有意安排或计划，与 serendipity 的非计划性形成对照。", "强调结果经过刻意设计时用 by design；强调偶然发生时用 serendipity。"),
  ],
  resilient: [
    s("tough", "都表示能承受困难；tough 更强调坚硬或强悍，resilient 强调受挫后恢复的能力。", "描述强硬的人或材料常用 tough；强调复原力时用 resilient。"),
    s("adaptable", "都涉及面对变化；adaptable 强调调整方式，resilient 强调经历压力后恢复并继续。", "环境变化时谈适应性用 adaptable；逆境后的恢复用 resilient。"),
    a("fragile", "fragile 表示容易损坏或崩溃，正好缺少 resilient 所强调的承压与恢复能力。", "可描述物品、制度或情绪脆弱；resilient 更适合能经受冲击的对象。"),
    a("vulnerable", "vulnerable 强调容易受到伤害，resilient 则强调即使受影响也能恢复。", "谈风险暴露用 vulnerable；谈应对风险后的恢复能力用 resilient。"),
  ],
  meticulous: [
    s("careful", "都表示做事谨慎；careful 是常用的仔细，meticulous 进一步强调对每个细节都极其讲究。", "日常提醒用 careful；评价精细、系统的工作时用 meticulous。"),
    s("precise", "都与准确有关；precise 强调结果或表达精确，meticulous 强调达到精确结果时细致的过程。", "数字、措辞准确用 precise；工作方式一丝不苟用 meticulous。"),
    a("careless", "careless 表示没有给予足够注意，与 meticulous 的高度关注细节直接相反。", "描述疏忽行为用 careless；强调细致可靠的工作态度用 meticulous。"),
    a("sloppy", "sloppy 不仅粗心，还暗示成品凌乱或质量差；meticulous 则意味着整洁、周密。", "批评潦草作业或松散流程用 sloppy；称赞严谨成果用 meticulous。"),
  ],
  ephemeral: [
    s("fleeting", "都表示持续很短；fleeting 常强调一闪而过的感受或瞬间，ephemeral 可描述短命的事物或潮流。", "目光、念头和瞬间常用 fleeting；事物短暂存在可用 ephemeral。"),
    s("transient", "都表示暂时存在；transient 语气更客观正式，ephemeral 常带有稍纵即逝的文学意味。", "人口、状态等技术语境用 transient；美景、名声等表达可用 ephemeral。"),
    a("lasting", "lasting 表示能持续较长时间，与 ephemeral 的短暂性相反，但不一定意味着永恒。", "描述持久影响或关系用 lasting；强调短暂现象用 ephemeral。"),
    a("permanent", "permanent 表示永久或没有预定终点，是比 lasting 更强的反面概念。", "制度、职位或改变不可逆时用 permanent；短期存在则用 ephemeral。"),
  ],
  ambiguous: [
    s("unclear", "都表示不清楚；unclear 可能只是表达不够明白，ambiguous 特指存在两种或更多合理解释。", "信息难懂用 unclear；一句话可被多重理解时用 ambiguous。"),
    s("equivocal", "都表示含糊；equivocal 更正式，且常暗示说话者刻意不明确或态度摇摆。", "文学和日常分析用 ambiguous；正式评价含糊表态可用 equivocal。"),
    a("explicit", "explicit 表示直接、完整地说清楚，不给人猜测空间，与 ambiguous 的多重解释相反。", "规则、说明或内容明确写出时用 explicit。"),
    a("definite", "definite 强调确定、界限清楚；ambiguous 强调意义或选择无法确定。", "确定日期、答案或决定用 definite；意义不唯一用 ambiguous。"),
  ],
  pragmatic: [
    s("practical", "都强调实际效果；practical 可形容可用的方法或技能，pragmatic 更强调基于现实权衡作决定。", "描述工具和方案好用用 practical；描述决策态度用 pragmatic。"),
    s("realistic", "都尊重现实条件；realistic 强调判断符合事实，pragmatic 强调选择能落地的行动。", "评价预期是否合理用 realistic；评价解决方式是否务实用 pragmatic。"),
    a("idealistic", "idealistic 以理想和原则为先，可能忽略现实限制；pragmatic 则优先考虑可行结果。", "谈价值愿景用 idealistic；谈资源约束下的决策用 pragmatic。"),
    a("impractical", "impractical 表示方案难以实施，与 pragmatic 对可行性的重视直接相反。", "批评成本过高或无法执行的想法用 impractical。"),
  ],
  eloquent: [
    s("expressive", "都表示表达有感染力；expressive 可用于表情、艺术和语言，eloquent 更专指清晰有说服力的言语。", "描述眼神或艺术表现用 expressive；演讲和文字有力用 eloquent。"),
    s("articulate", "都表示善于表达；articulate 强调说得清楚有条理，eloquent 还强调优美和感染力。", "评价观点表达清晰用 articulate；强调语言优美有力量用 eloquent。"),
    a("inarticulate", "inarticulate 表示难以清楚表达思想，与 eloquent 的流畅有力形成反差。", "描述紧张、词不达意或表达能力不足时使用。"),
    a("halting", "halting 强调说话断断续续、不流畅；eloquent 强调连贯自然且富有说服力。", "描述犹豫、停顿很多的发言用 halting。"),
  ],
  ubiquitous: [
    s("pervasive", "都表示广泛存在；pervasive 强调渗透到各处，常带影响深远甚至负面的意味。", "技术随处可见可用 ubiquitous；影响、气味或问题渗透各处常用 pervasive。"),
    s("universal", "都可表示普遍；universal 强调适用于所有人或情况，ubiquitous 强调几乎到处都能看到。", "规则或体验人人共有用 universal；实体广泛出现用 ubiquitous。"),
    a("rare", "rare 表示很少出现，与 ubiquitous 的随处可见相反。", "强调出现频率低或事物珍稀用 rare。"),
    a("scarce", "scarce 强调数量不足或供应有限；ubiquitous 强调分布广、容易遇到。", "资源、商品短缺用 scarce；事物遍布各处用 ubiquitous。"),
  ],
  benevolent: [
    s("kind", "都表示善意；kind 是广泛的日常用词，benevolent 更正式，常指有能力者主动帮助他人。", "日常友善行为用 kind；慈善者、组织或政策的善意用 benevolent。"),
    s("charitable", "都涉及帮助别人；charitable 更具体地与捐赠和慈善行为相关，benevolent 可指更广泛的仁慈态度。", "捐款和公益活动用 charitable；描述仁慈的动机或管理者用 benevolent。"),
    a("malevolent", "malevolent 表示怀有恶意或希望别人受害，是 benevolent 在动机层面的直接反义词。", "描述恶意人物、力量或意图用 malevolent。"),
    a("cruel", "cruel 强调造成或漠视痛苦；benevolent 强调关怀并愿意提供帮助。", "描述残忍行为用 cruel；描述仁慈行为或政策用 benevolent。"),
  ],
  candid: [
    s("frank", "都表示直率；frank 常用于坦白意见，candid 还强调不修饰地呈现真实情况。", "直接谈看法用 frank；坦诚访谈、照片或陈述常用 candid。"),
    s("honest", "都与诚实有关；honest 范围更广，candid 特别强调愿意公开说出可能令人不舒服的真话。", "评价品格用 honest；评价一次坦率交流用 candid。"),
    a("guarded", "guarded 表示谨慎保留、不愿透露太多，与 candid 的开放直接相反。", "外交回应或敏感话题中的谨慎表态常用 guarded。"),
    a("deceptive", "deceptive 表示有意误导；candid 强调不掩饰真实想法。", "描述虚假外观或误导性说法用 deceptive。"),
  ],
  diligent: [
    s("industrious", "都表示勤奋；industrious 强调持续忙碌和高产，diligent 更强调认真、稳定地把工作做好。", "评价勤劳高产的人用 industrious；评价学习和工作态度用 diligent。"),
    s("assiduous", "都表示持续努力；assiduous 更正式，并强调长期专注、不懈投入。", "日常评价用 diligent；正式描述长期刻苦投入可用 assiduous。"),
    a("lazy", "lazy 表示不愿付出努力，与 diligent 的持续认真直接相反。", "描述缺乏动力或逃避工作用 lazy。"),
    a("negligent", "negligent 强调没有履行应有注意义务，比 lazy 更涉及责任和后果。", "法律、职业失职语境常用 negligent；认真尽责则用 diligent。"),
  ],
  novel: [
    s("original", "都表示新颖；original 强调不是模仿而来，novel 强调以前未见或采用了不同方法。", "作品具有独创性用 original；方案或方法新奇用 novel。"),
    s("innovative", "都表示新；innovative 通常暗示新方法带来改进，novel 只说明不同寻常，不保证更好。", "强调创新价值用 innovative；中性描述新奇方法用 novel。"),
    a("conventional", "conventional 遵循常见做法和惯例，与 novel 的新方法相反。", "描述传统流程或标准选择用 conventional。"),
    a("familiar", "familiar 表示已经熟悉、常见；novel 强调陌生和首次出现。", "描述用户已知体验用 familiar；全新体验用 novel。"),
  ],
  plausible: [
    s("credible", "都表示值得相信；credible 更强调来源或证据可靠，plausible 只表示听起来合理。", "评价证人或来源用 credible；评价解释看似说得通用 plausible。"),
    s("believable", "都表示可以相信；believable 更日常，也可评价故事人物，plausible 更偏逻辑上的可能性。", "日常叙事用 believable；分析假设或解释用 plausible。"),
    a("unlikely", "unlikely 表示发生概率低；plausible 表示根据现有信息有可能成立。", "谈概率很低用 unlikely；谈解释具备合理可能性用 plausible。"),
    a("implausible", "implausible 直接表示难以相信或逻辑上不合理，是 plausible 的对应反义词。", "评价解释、情节或借口不合常理时使用。"),
  ],
  concise: [
    s("brief", "都表示篇幅短；brief 只强调长度，concise 还强调在短的同时信息完整清楚。", "描述时间或文本短用 brief；称赞表达短而有效用 concise。"),
    s("succinct", "几乎同义；succinct 语气更正式，尤其强调用极少语言准确概括。", "一般写作建议用 concise；正式评价高度凝练的陈述用 succinct。"),
    a("verbose", "verbose 表示使用过多词语，与 concise 的无冗余直接相反。", "批评报告、回答过于啰嗦时用 verbose。"),
    a("rambling", "rambling 不仅冗长，还暗示缺乏结构、偏离主题；concise 则短且聚焦。", "描述漫无边际的谈话或文章用 rambling。"),
  ],
  vivid: [
    s("graphic", "都表示呈现得非常清晰；graphic 常强调细节具体到有强烈视觉冲击，有时涉及令人不适的内容。", "生动描述可用 vivid；细节露骨或画面感强烈常用 graphic。"),
    s("striking", "都能表示给人强烈印象；striking 强调醒目和引人注意，vivid 强调形象清晰鲜明。", "外观醒目用 striking；记忆、颜色或描述鲜明用 vivid。"),
    a("dull", "dull 表示颜色暗淡、内容乏味或感受不强，与 vivid 的鲜明有力相反。", "描述缺少亮度或趣味时用 dull。"),
    a("faint", "faint 强调微弱、难以辨认；vivid 强调清楚而强烈。", "声音、痕迹或记忆模糊微弱用 faint。"),
  ],
  tranquil: [
    s("peaceful", "都表示安静无扰；peaceful 还可指没有冲突，tranquil 更强调环境或心境平稳。", "社会或场所无冲突用 peaceful；宁静氛围和心境用 tranquil。"),
    s("serene", "都表示平静；serene 更常形容人安详从容或景色清澈，语气也更优雅。", "宁静环境用 tranquil；安详表情、天空或心态常用 serene。"),
    a("turbulent", "turbulent 表示动荡、混乱或水流剧烈，与 tranquil 的稳定宁静相反。", "描述时代、关系、飞行或水流动荡用 turbulent。"),
    a("agitated", "agitated 强调人焦躁不安或液体被搅动；tranquil 强调平和不受干扰。", "描述情绪激动用 agitated；描述平静心境用 tranquil。"),
  ],
  arduous: [
    s("strenuous", "都表示费力；strenuous 更强调体力消耗，arduous 可同时包含体力、时间和意志上的艰难。", "高强度运动用 strenuous；漫长艰巨任务用 arduous。"),
    s("demanding", "都表示要求高；demanding 强调需要很多能力或注意力，arduous 更强调过程艰苦。", "工作或角色要求高用 demanding；旅程和任务艰难用 arduous。"),
    a("easy", "easy 表示几乎没有困难，是 arduous 最直接、最常用的反面表达。", "日常比较任务难易时用 easy；强调艰巨过程用 arduous。"),
    a("effortless", "effortless 表示看起来无需努力，比 easy 更强调轻松自然。", "动作或表现轻松完成用 effortless；需要大量投入则用 arduous。"),
  ],
  skeptical: [
    s("doubtful", "都表示怀疑；doubtful 可表示自己不确定或事情不太可能，skeptical 更强调要求证据后才相信。", "表达不确定用 doubtful；描述审慎质疑的态度用 skeptical。"),
    s("questioning", "都不轻易接受说法；questioning 更强调主动提问和探索，skeptical 可能带有更强的不信任。", "开放探究的态度用 questioning；对主张持保留意见用 skeptical。"),
    a("convinced", "convinced 表示已经被证据说服，skeptical 表示尚未接受。", "观点确定后用 convinced；证据不足时用 skeptical。"),
    a("credulous", "credulous 表示过于容易相信，与 skeptical 的审慎怀疑相反，并带有轻微批评意味。", "描述轻信传言或骗局的人用 credulous。"),
  ],
  obsolete: [
    s("outdated", "都表示过时；outdated 可能仍在使用但不合时代，obsolete 通常表示已被替代、不再需要。", "观念或设计老旧用 outdated；技术彻底淘汰用 obsolete。"),
    s("antiquated", "都表示旧；antiquated 语气更强，常暗示古老得不合现代标准。", "旧制度或设备显得古老落后用 antiquated；被替代不用用 obsolete。"),
    a("current", "current 表示当前正在使用或符合最新情况，与 obsolete 的淘汰状态相反。", "版本、信息或惯例仍有效时用 current。"),
    a("modern", "modern 强调属于现代或采用新方法；obsolete 强调旧事物已经失去用途。", "设计风格和技术先进用 modern；旧技术淘汰用 obsolete。"),
  ],
  versatile: [
    s("adaptable", "都表示能应对多种情况；adaptable 强调根据环境改变，versatile 强调本身具备多种用途或能力。", "描述人适应环境用 adaptable；工具或人才多用途用 versatile。"),
    s("multifaceted", "都包含多个方面；multifaceted 强调组成复杂多面，versatile 强调能胜任多类任务。", "问题和人物复杂多面用 multifaceted；技能和工具用途广用 versatile。"),
    a("limited", "limited 表示范围或能力受限，与 versatile 的多用途相反。", "功能很少或选择受约束时用 limited。"),
    a("inflexible", "inflexible 强调不能调整方法或立场；versatile 强调能在多种任务间灵活切换。", "描述规则、态度或系统僵化用 inflexible。"),
  ],
  coherent: [
    s("logical", "都表示容易理解；logical 强调推理符合规则，coherent 强调整体各部分连接一致。", "评价推理步骤用 logical；评价文章或观点整体连贯用 coherent。"),
    s("consistent", "都强调一致；consistent 可指前后不变，coherent 进一步要求各部分共同形成可理解的整体。", "行为或数据稳定用 consistent；完整论述有条理用 coherent。"),
    a("confused", "confused 可表示人困惑或表达混乱，与 coherent 的清楚有序相反。", "描述思路、说明缺乏清晰结构时用 confused。"),
    a("incoherent", "incoherent 是 coherent 的直接反义词，表示语言或结构无法形成可理解的整体。", "描述严重混乱、前后无法连接的发言或文字。"),
  ],
  reluctant: [
    s("hesitant", "都表示不马上行动；hesitant 强调犹豫不决，reluctant 更明确地表示不愿意。", "尚未决定用 hesitant；虽然会做但内心不情愿用 reluctant。"),
    s("unwilling", "都表示不愿；unwilling 更直接坚决，reluctant 通常仍可能在压力或劝说下行动。", "明确拒绝用 unwilling；勉强同意或迟疑行动用 reluctant。"),
    a("eager", "eager 表示热切期待并想尽快行动，与 reluctant 的不情愿形成强烈反差。", "表达积极期待机会时用 eager。"),
    a("willing", "willing 表示愿意配合，语气比 eager 平和；reluctant 则表示有保留或勉强。", "表示接受任务用 willing；勉强接受用 reluctant。"),
  ],
  profound: [
    s("deep", "都可表示程度深；deep 用途广泛，profound 更正式，常强调思想、情感或影响具有重大深度。", "日常程度描述用 deep；深刻见解和重大影响用 profound。"),
    s("significant", "都可表示影响重要；significant 强调重要性或可测差异，profound 强调触及根本、影响深远。", "统计和一般重要性用 significant；根本性影响用 profound。"),
    a("shallow", "shallow 可指物理上浅，也可指思想缺乏深度，与 profound 的深刻相反。", "批评分析或情感停留表面时用 shallow。"),
    a("superficial", "superficial 强调只涉及表面、没有深入理解；profound 强调深入本质。", "描述表面检查、肤浅判断用 superficial。"),
  ],
  spontaneous: [
    s("impromptu", "都表示没有预先计划；impromptu 常专指临时进行的演讲、表演或活动，spontaneous 范围更广。", "临时演讲或聚会用 impromptu；自然产生的反应用 spontaneous。"),
    s("unplanned", "都表示未计划；unplanned 是客观描述，spontaneous 还常带有自然、主动和轻松的积极意味。", "中性说明计划外事件用 unplanned；强调自然而然的行为用 spontaneous。"),
    a("planned", "planned 表示事先安排，与 spontaneous 的当下自然发生直接相反。", "描述有日程和准备的活动用 planned。"),
    a("deliberate", "deliberate 强调经过思考并有意为之；spontaneous 强调未经预谋的即时反应。", "强调行为有意、慎重时用 deliberate；即时自然反应用 spontaneous。"),
  ],
};
