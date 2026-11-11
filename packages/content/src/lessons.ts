// Learn lessons: short stories with a teaching moment, in the style of Google Primer. General, for everyone.
// Each lesson: story cards set the scene → one "what should they do next?" choice → every option explained
// (whatever the person picked) → a takeaway → where to learn more for their country.
//
// Two story versions: Nigeria (also used for every other country, with WHO links) and Canada.
// Topics approved by the owner and Dr Gloria Williams-Aborishade (29 Oct 2026). Lesson text written by
// Claude from WHO and Health Canada guidance; all ten lessons approved by Dr Gloria (1 Nov 2026, relayed by the
// owner). New or edited lessons go live only after clinical approval in the admin console. Links checked 29 Oct 2026. Plain data, testable with node:test.

export type Region = 'NG' | 'CA';
/** Text that can differ by country version. A plain string is the same for everyone. */
export type Localised = string | { NG: string; CA: string };

export interface ChoiceOption {
  label: Localised;
  /** Shown for every option, whatever the person picked. */
  explanation: Localised;
  /** The strongest choice (highlighted in the explanation). */
  best?: boolean;
}

export interface Resource {
  label: string;
  url: string;
}

export interface Lesson {
  id: string;
  /** The topic, e.g. "Folic acid before pregnancy" (never a character's name). */
  title: string;
  summary: string;
  minutes: number;
  /** Story cards for each country version, in order. */
  story: Record<Region, string[]>;
  question: Localised;
  options: ChoiceOption[];
  takeaway: string;
  /** Where to learn more. `other` is for people outside Nigeria and Canada. */
  resources: Record<Region | 'other', Resource[]>;
  /** Show the one-on-one consultation link (only where the admin settings offer it). */
  offerConsultation?: boolean;
  /** Workflow: drafts are visible in test builds only; a clinical reviewer approves. */
  status: 'draft' | 'in_review' | 'approved';
  reviewedBy?: string;
  reviewedOn?: string;
}

/** Story version: Nigeria for everyone (owner, 5 Nov 2026: Nigeria-only market). */
export const storyRegion = (_country?: string | null): Region => 'NG';
/** Resource list: Nigerian and WHO links for everyone (owner, 5 Nov 2026). */
export const resourceRegion = (_country?: string | null): Region | 'other' => 'NG';
export const localise = (t: Localised, region: Region): string => (typeof t === 'string' ? t : t[region]);

// ── Links (checked 29 Oct 2026) ──
const WHO = {
  maternal: { label: 'WHO: Maternal health', url: 'https://www.who.int/health-topics/maternal-health' },
  nigeria: { label: 'WHO Nigeria', url: 'https://www.afro.who.int/countries/nigeria' },
  diet: { label: 'WHO: Healthy diet', url: 'https://www.who.int/news-room/fact-sheets/detail/healthy-diet' },
  activity: { label: 'WHO: Physical activity', url: 'https://www.who.int/news-room/fact-sheets/detail/physical-activity' },
  weight: { label: 'WHO: Obesity and overweight', url: 'https://www.who.int/news-room/fact-sheets/detail/obesity-and-overweight' },
  infertility: { label: 'WHO: Infertility', url: 'https://www.who.int/news-room/fact-sheets/detail/infertility' },
  tobacco: { label: 'WHO: Tobacco', url: 'https://www.who.int/news-room/fact-sheets/detail/tobacco' },
  alcohol: { label: 'WHO: Alcohol', url: 'https://www.who.int/news-room/fact-sheets/detail/alcohol' },
  sickle: { label: 'WHO: Sickle cell disease', url: 'https://www.who.int/news-room/fact-sheets/detail/sickle-cell-disease' },
  epilepsy: { label: 'WHO: Epilepsy', url: 'https://www.who.int/news-room/fact-sheets/detail/epilepsy' },
  diabetes: { label: 'WHO: Diabetes', url: 'https://www.who.int/news-room/fact-sheets/detail/diabetes' },
  hypertension: { label: 'WHO: Hypertension', url: 'https://www.who.int/news-room/fact-sheets/detail/hypertension' },
  stis: { label: 'WHO: Sexually transmitted infections', url: 'https://www.who.int/news-room/fact-sheets/detail/sexually-transmitted-infections-(stis)' },
  hiv: { label: 'WHO: HIV', url: 'https://www.who.int/news-room/fact-sheets/detail/hiv-aids' },
  hepB: { label: 'WHO: Hepatitis B', url: 'https://www.who.int/news-room/fact-sheets/detail/hepatitis-b' },
  rubella: { label: 'WHO: Rubella', url: 'https://www.who.int/news-room/fact-sheets/detail/rubella' },
  mental: { label: 'WHO: Mental health', url: 'https://www.who.int/news-room/fact-sheets/detail/mental-health-strengthening-our-response' },
  depression: { label: 'WHO: Depression', url: 'https://www.who.int/news-room/fact-sheets/detail/depression' },
  familyPlanning: { label: 'WHO: Family planning and contraception', url: 'https://www.who.int/news-room/fact-sheets/detail/family-planning-contraception' }
};
const NG = {
  fmoh: { label: 'Federal Ministry of Health (Nigeria)', url: 'https://health.gov.ng' },
  ncdc: { label: 'Nigeria Centre for Disease Control', url: 'https://ncdc.gov.ng' }
};
const CA = {
  pregnancy: { label: 'Canada.ca: Your guide to a healthy pregnancy', url: 'https://www.canada.ca/en/public-health/services/health-promotion/healthy-pregnancy/healthy-pregnancy-guide.html' },
  folic: { label: 'Canada.ca: Folic acid and a healthy pregnancy', url: 'https://www.canada.ca/en/public-health/services/pregnancy/folic-acid.html' },
  foodGuide: { label: "Canada's food guide", url: 'https://food-guide.canada.ca/en/' },
  quitSmoking: { label: 'Canada.ca: Quit smoking', url: 'https://www.canada.ca/en/health-canada/services/smoking-tobacco/quit-smoking.html' },
  alcohol: { label: 'Canada.ca: Alcohol use', url: 'https://www.canada.ca/en/health-canada/services/substance-use/alcohol.html' },
  cannabis: { label: 'Canada.ca: Cannabis effects and risks', url: 'https://www.canada.ca/en/health-canada/services/drugs-medication/cannabis/health-effects.html' },
  substanceHelp: { label: 'Canada.ca: Get help with substance use', url: 'https://www.canada.ca/en/health-canada/services/substance-use/get-help-with-substance-use.html' },
  diabetes: { label: 'Canada.ca: Diabetes', url: 'https://www.canada.ca/en/public-health/services/diseases/diabetes.html' },
  sexualHealth: { label: 'Canada.ca: Sexual and reproductive health', url: 'https://www.canada.ca/en/public-health/services/sexual-health.html' },
  vaccines: { label: 'Canada.ca: Vaccines and immunization', url: 'https://www.canada.ca/en/public-health/services/immunization-vaccines.html' },
  mentalHelp: { label: 'Canada.ca: Mental health support', url: 'https://www.canada.ca/en/public-health/services/mental-health-services/mental-health-get-help.html' },
  crisis: { label: '9-8-8 Suicide Crisis Helpline (call or text 988)', url: 'https://988.ca' },
  sexAndU: { label: 'Sex & U (SOGC): contraception', url: 'https://www.sexandu.ca' },
  pregnancyInfo: { label: 'Pregnancy Info (SOGC)', url: 'https://www.pregnancyinfo.ca' }
};

const APPROVAL = { reviewedBy: 'Dr Gloria Williams-Aborishade', reviewedOn: '2026-11-01' } as const;
const approved = (l: Omit<Lesson, 'status'>): Lesson => ({ ...l, status: 'approved', ...APPROVAL });

export const LESSONS: Lesson[] = [
  approved({
    id: 'what-is-preconception-health',
    title: 'What is preconception health?',
    summary: 'Why your health before pregnancy matters, even if a baby is years away.',
    minutes: 3,
    story: {
      NG: [
        'Chioma is 24 and in her final year at university in Enugu. Between lectures, exams and her part-time job, she is always busy.',
        'At a family wedding, an aunty teases her: "When you marry, you\'ll start thinking about babies." Chioma laughs. Babies feel years away.',
        'Her cousin Adaeze, who is pregnant, tells her: "Nobody told me to prepare. I only went to the clinic after I missed my period."',
        'That night Chioma reads that preconception health means looking after your health before a pregnancy: your body, your habits and your mind.',
        'She wonders: "I\'m not planning a baby. Does any of this apply to me?"'
      ],
      CA: [
        'Priya is 27 and works in marketing in Toronto. She loves her job, her friends and her weekend runs.',
        'She and her partner have talked about kids, but "maybe in five years".',
        'Her friend Sam just found out she is pregnant. It wasn\'t planned, and Sam says she wishes she had known more about her health beforehand.',
        'Priya reads that preconception health means looking after your health before a pregnancy: your body, your habits and your mind.',
        'She wonders: "I\'m not planning a baby for years. Does any of this apply to me?"'
      ]
    },
    question: { NG: 'What should Chioma do now?', CA: 'What should Priya do now?' },
    options: [
      {
        label: 'Nothing for now. Think about it when she is ready to get pregnant.',
        explanation: 'A common view, but it misses two things. Nearly half of all pregnancies worldwide are unplanned, and many people only find out weeks after it started. A baby\'s major organs begin forming in the first weeks of pregnancy, often before a test shows anything. Waiting means the most important weeks can pass unprepared.'
      },
      {
        label: 'Build a few healthy habits now and get to know her own health.',
        best: true,
        explanation: {
          NG: 'The strongest choice. Preconception health is not only about babies: the same steps protect your health today.\n• Eat well, stay active and sleep enough.\n• Cut down on or stop smoking and alcohol.\n• Know your basics: blood pressure, your genotype, any long-term conditions and your vaccines.\n• Look after your mental wellbeing.\nIf a pregnancy does happen, planned or not, you are already in good shape.',
          CA: 'The strongest choice. Preconception health is not only about babies: the same steps protect your health today.\n• Eat well, stay active and sleep enough.\n• Cut down on or stop smoking, alcohol and cannabis.\n• Know your basics: blood pressure, any long-term conditions and your vaccines.\n• Look after your mental wellbeing.\nIf a pregnancy does happen, planned or not, you are already in good shape.'
        }
      },
      {
        label: 'Buy "fertility booster" supplements advertised online, just in case.',
        explanation: 'Many products sold online make big promises without proof. Some contain ingredients that are not on the label, or that interact with medicines. Talk to a pharmacist, doctor or nurse before taking any supplement. The one supplement experts do recommend before pregnancy, folic acid, is the next lesson.'
      }
    ],
    takeaway: 'Preconception health is for everyone who could ever become pregnant, and their partners. Small steps now protect your health today and any future pregnancy.',
    resources: {
      NG: [WHO.nigeria, NG.fmoh, WHO.maternal],
      CA: [CA.pregnancy, CA.pregnancyInfo],
      other: [WHO.maternal]
    }
  }),

  approved({
    id: 'folic-acid-before-pregnancy',
    title: 'Folic acid before pregnancy',
    summary: 'When to start it, why timing matters, and whether food is enough.',
    minutes: 3,
    story: {
      NG: [
        'Amaka is 29 and works long hours at a bank in Lagos. She and her husband Tunde have agreed to try for a baby next year.',
        'Most days Amaka skips breakfast and has jollof rice and a soft drink at her desk.',
        'Her aunty tells her: "Don\'t worry until you\'re pregnant. Then the antenatal clinic will give you your drugs."',
        'Money is tight. Amaka has a small budget each month for getting ready, and only one free Saturday.',
        'She wants to give a future baby the best start, but she can\'t do everything at once.'
      ],
      CA: [
        'Jordan is 31 and teaches high school in Calgary. She stopped taking the pill last month: she and her husband feel ready for a baby.',
        'Between marking papers and coaching volleyball, meals are often whatever is quick.',
        'A friend tells her: "Prenatal vitamins are for when you\'re pregnant. You don\'t need them yet."',
        'Jordan has heard the word "folic acid" but isn\'t sure what it does or when it matters.',
        'She wants to do the right thing without spending a fortune.'
      ]
    },
    question: { NG: 'What should Amaka do first?', CA: 'What should Jordan do first?' },
    options: [
      {
        label: 'Wait until a pregnancy test is positive, then start vitamins.',
        explanation: 'This is the most common mistake. The baby\'s brain and spine (the neural tube) form in the first 4 weeks of pregnancy, often before a woman knows she is pregnant. Folic acid helps prevent serious birth defects of the brain and spine, so it needs to be in your body before then.'
      },
      {
        label: 'Start a daily folic acid supplement now.',
        best: true,
        explanation: {
          NG: 'The strongest first step. WHO recommends 400 micrograms (0.4 mg) of folic acid every day, starting as soon as you are trying for a baby, ideally before. It is low cost and available at most pharmacies. Some people need a higher dose (for example with sickle cell disease, diabetes, certain medicines, or a past pregnancy affected by a neural tube defect), so ask a pharmacist or doctor which dose is right for you.',
          CA: 'The strongest first step. Health Canada recommends a daily multivitamin with 400 micrograms (0.4 mg) of folic acid for anyone who could become pregnant, ideally starting at least 3 months before pregnancy. Some people need a higher dose (for example with diabetes, certain medicines, or a past pregnancy affected by a neural tube defect), so ask your pharmacist or doctor. Don\'t take more than one daily dose.'
        }
      },
      {
        label: 'Skip supplements and eat more leafy greens, beans and fruit instead.',
        explanation: 'A good habit, and it helps your health in many ways. But food alone usually does not give enough folic acid before pregnancy. A better diet works best alongside the supplement, not instead of it.'
      }
    ],
    takeaway: 'Start folic acid before pregnancy, every day. Food helps, but the supplement is what protects the baby in the earliest weeks.',
    resources: {
      NG: [WHO.nigeria, NG.fmoh, WHO.maternal],
      CA: [CA.folic, CA.pregnancy],
      other: [WHO.maternal]
    }
  }),

  approved({
    id: 'knowing-your-menstrual-cycle',
    title: 'Knowing your menstrual cycle',
    summary: 'What a typical cycle looks like, the fertile window, and when to get checked.',
    minutes: 4,
    story: {
      NG: [
        'Funmi is 26 and runs a small fashion business in Ibadan. Her periods come every 6 to 8 weeks, sometimes longer.',
        'Her friends say: "Everyone\'s body is different. Irregular is normal."',
        'Funmi and her fiancé hope to start a family after their wedding next year.',
        'She has never tracked her cycle and isn\'t sure when she might be fertile.',
        'A colleague says she should "just wait and see" once she is married.'
      ],
      CA: [
        'Emily is 33 and lives in Halifax. She and her husband have been trying for a baby for 8 months.',
        'Emily uses a calendar app that marks one "fertile day" each month, and they only have sex on that day.',
        'Each month her period arrives and she feels more stressed.',
        'Her cycle is between 26 and 34 days, so the app\'s prediction often moves.',
        'A friend suggests ordering a "fertility kit" online that promises results in 30 days.'
      ]
    },
    question: { NG: 'What should Funmi do?', CA: 'What should Emily do?' },
    options: [
      {
        label: { NG: 'Wait and see after the wedding.', CA: 'Keep timing sex to the one day the app predicts.' },
        explanation: {
          NG: 'A typical adult cycle lasts 21 to 35 days. Cycles that are regularly longer, or periods that stop for 3 months or more without pregnancy, can have causes worth checking (such as hormone or thyroid problems), and many of these are treatable. Waiting can lose time.',
          CA: 'The fertile window is about 6 days: the 5 days before ovulation and the day of ovulation. Apps estimate it, and when cycles vary they can easily miss it. Relying on a single day lowers the chances each month.'
        }
      },
      {
        label: {
          NG: 'Start tracking her cycle and see a doctor or nurse about her long cycles.',
          CA: 'Have sex every 2 to 3 days through the cycle, keep tracking, and book a check-up.'
        },
        best: true,
        explanation: {
          NG: 'The strongest choice. Writing down the first day of each period (on paper or in an app) shows the pattern, and a provider can use it. Cycles that are often longer than 35 days are worth checking before trying for a baby, so any cause can be found early.',
          CA: 'The strongest choice. Sex every 2 to 3 days covers the whole fertile window without needing to guess the exact day. It is also time to talk to a doctor: see one after 12 months of trying if you are under 35, or after 6 months if you are 35 or older. Both partners should be checked.'
        }
      },
      {
        label: { NG: 'Buy a herbal "womb cleanser" to regulate her period.', CA: 'Order the online fertility kit.' },
        explanation: 'Products that promise to "fix" cycles or fertility quickly are rarely tested, and some can be harmful or hide a problem that needs real treatment. Speak with a doctor, nurse or pharmacist first.'
      }
    ],
    takeaway: 'Know your cycle: a typical cycle is 21 to 35 days, and the fertile window is about 6 days. Long or very irregular cycles, or trouble getting pregnant, are worth a check-up.',
    resources: {
      NG: [WHO.nigeria, WHO.infertility, NG.fmoh],
      CA: [CA.pregnancyInfo, CA.sexualHealth],
      other: [WHO.infertility, WHO.maternal]
    }
  }),

  approved({
    id: 'healthy-weight-and-eating-well',
    title: 'Healthy weight and eating well',
    summary: 'A balanced plate, weight and fertility, and why crash diets backfire.',
    minutes: 4,
    story: {
      NG: [
        'Bisi is 28 and getting married in Abuja in four months. She would like to start a family soon after.',
        'She wants to lose 15 kg before the wedding and has bought a "detox tea" from Instagram that promises 5 kg a week.',
        'Her mum warns her: "Don\'t starve yourself. You\'ll faint at your own wedding."',
        'Bisi eats one big meal at night, often fried, and drinks two soft drinks a day.',
        'She feels tired most afternoons.'
      ],
      CA: [
        'Marcus and his partner Dani live in Winnipeg. Both work long shifts at the hospital.',
        'Most nights they order takeout, and they rarely sit down for breakfast.',
        'They have decided to try for a baby next year.',
        'Dani says: "We\'ll eat healthy once we\'re pregnant. Right now we just don\'t have time."',
        'Marcus wonders whether his own eating matters at all.'
      ]
    },
    question: { NG: 'What should Bisi do?', CA: 'What should Marcus and Dani do?' },
    options: [
      {
        label: { NG: 'Keep going with the detox tea for fast results.', CA: 'Wait until Dani is pregnant to change how they eat.' },
        explanation: {
          NG: 'Detox teas often work as laxatives: the weight lost is mostly water and comes back. Very fast weight loss and skipping meals can upset periods and leave you short of the nutrients your body needs before pregnancy.',
          CA: 'Habits take time to build, and the early weeks of pregnancy are often when people feel least like cooking. Healthy eating before pregnancy also helps fertility for both partners, and a partner\'s habits shape what the household eats.'
        }
      },
      {
        label: 'Make small, steady changes: a balanced plate, regular meals, fewer sugary drinks.',
        best: true,
        explanation: {
          NG: 'The strongest choice. Fill half the plate with vegetables and fruit, a quarter with whole grains (such as brown rice, ofada rice or whole-wheat bread) and a quarter with protein (beans, fish, eggs, chicken). Swap soft drinks for water. Being very underweight or overweight can affect fertility; if you are overweight, even losing 5 to 10% of your weight can help. Slow and steady is safer and lasts.',
          CA: 'The strongest choice. Canada\'s food guide suggests half the plate vegetables and fruit, a quarter whole grains and a quarter protein foods, with water as the drink of choice. Batch-cooking on days off and keeping quick healthy options at home makes this realistic around shifts. Weight and diet affect fertility in both partners.'
        }
      },
      {
        label: 'Do nothing. Weight and food don\'t really affect pregnancy.',
        explanation: 'They do. Both very low and high body weight can affect periods, ovulation and sperm, and raise the risk of problems in pregnancy such as diabetes and high blood pressure. Food also supplies nutrients like iron and folate that matter before pregnancy.'
      }
    ],
    takeaway: 'Eat a balanced plate, regularly, and choose water over sugary drinks. Aim for steady changes, not crash diets, and make it a team effort.',
    resources: {
      NG: [WHO.diet, WHO.weight, WHO.nigeria],
      CA: [CA.foodGuide, CA.pregnancy],
      other: [WHO.diet, WHO.weight]
    }
  }),

  approved({
    id: 'alcohol-smoking-and-other-substances',
    title: 'Alcohol, smoking and other substances',
    summary: 'How they affect fertility and early pregnancy, for both partners, and where to get help.',
    minutes: 4,
    story: {
      NG: [
        'Tunde is 32 and works in sales in Port Harcourt. He and his wife Ada are planning their first child.',
        'Tunde smokes "only at weekends" when he is out with friends.',
        'Ada enjoys palm wine and a cold beer at parties, a few times a month.',
        'Tunde says: "It\'s Ada who will carry the baby. My smoking has nothing to do with it."',
        'Ada isn\'t sure whether an occasional drink matters before she is pregnant.'
      ],
      CA: [
        'Jess is 29 and works in tech in Vancouver. She and her partner Leo hope to have a baby in the next year.',
        'Jess uses cannabis edibles most nights to help her sleep. "It\'s natural, so it\'s fine," she says.',
        'Leo has a few beers most evenings after work.',
        'Neither of them thinks of these as a big deal.',
        'Jess wonders if she needs to change anything before they start trying.'
      ]
    },
    question: { NG: 'What should Tunde and Ada do?', CA: 'What should Jess and Leo do?' },
    options: [
      {
        label: 'Keep going as they are. It\'s only occasional.',
        explanation: {
          NG: 'Smoking affects men\'s fertility too: it can lower sperm quality. Second-hand smoke harms a partner and a future baby. Alcohol can reach a baby in the earliest weeks, before a pregnancy is known, and there is no known safe amount during pregnancy.',
          CA: 'Cannabis passes to a baby during pregnancy, and Health Canada advises against using it when pregnant or trying. Regular heavy drinking can lower sperm quality. "Natural" does not mean safe in pregnancy.'
        }
      },
      {
        label: 'Plan to cut down and stop, with support, before trying.',
        best: true,
        explanation: {
          NG: 'The strongest choice. Both partners stopping smoking improves fertility and protects the baby from smoke. When trying for a baby, the safest choice is no alcohol, because a pregnancy may start weeks before you know. A doctor, nurse or primary health centre can help with quitting, and it works better with a plan and support than willpower alone.',
          CA: 'The strongest choice. When trying for a baby, the safest choice is no alcohol and no cannabis, because a pregnancy may start weeks before you know. For sleep, a doctor can suggest safer options. Quitting with support (a doctor, pharmacist or a free quit line) works better than willpower alone, and partners quitting together helps both.'
        }
      },
      {
        label: 'Stop suddenly once the pregnancy test is positive.',
        explanation: 'Better than nothing, but the baby\'s organs start forming in the first weeks, before most people know they are pregnant. Stopping can also be harder than expected, so it is best to make the change, with support, before trying.'
      }
    ],
    takeaway: 'When you are trying for a baby, the safest choice is no alcohol, no smoking and no cannabis, for both partners. Get support to stop: it works.',
    resources: {
      NG: [WHO.tobacco, WHO.alcohol, WHO.nigeria],
      CA: [CA.quitSmoking, CA.alcohol, CA.cannabis, CA.substanceHelp],
      other: [WHO.tobacco, WHO.alcohol]
    }
  }),

  approved({
    id: 'medicines-and-long-term-conditions',
    title: 'Medicines and long-term conditions',
    summary: 'Planning ahead with diabetes, high blood pressure, epilepsy or sickle cell, and why not to stop medicines alone.',
    minutes: 4,
    story: {
      NG: [
        'Ngozi is 27 and a nurse in Owerri. She and her fiancé Emeka plan to marry next year.',
        'Ngozi knows her genotype is AS: she carries the sickle cell trait.',
        'She doesn\'t know Emeka\'s genotype. Asking feels awkward, and he says, "God will take care of it."',
        'Ngozi\'s older sister has a child with sickle cell disease, and she has seen how hard the crises can be.',
        'She loves Emeka and doesn\'t want to hurt his feelings.'
      ],
      CA: [
        'Sarah is 30 and an accountant in Ottawa. She has had epilepsy since she was a teenager and takes medication every day.',
        'Her seizures have been well controlled for years.',
        'She has read online that some epilepsy medicines can affect a developing baby.',
        'Her plan is to stop her medication on her own as soon as she finds out she is pregnant.',
        'She hasn\'t mentioned her plans for a baby to her neurologist.'
      ]
    },
    question: { NG: 'What should Ngozi do?', CA: 'What should Sarah do?' },
    options: [
      {
        label: { NG: 'Say nothing and hope for the best.', CA: 'Stop her medication herself once she is pregnant.' },
        explanation: {
          NG: 'If both partners carry the trait (both AS), each pregnancy has a 1 in 4 chance of a child with sickle cell disease. Not knowing removes the chance to make informed choices together.',
          CA: 'Stopping epilepsy medicine suddenly can bring back seizures, and seizures in pregnancy can be dangerous for both mother and baby. Changes to medicines should only be made with a doctor, ideally before pregnancy.'
        }
      },
      {
        label: {
          NG: 'Talk openly with Emeka, both get a genotype test, and see a health worker about what the results mean.',
          CA: 'Tell her neurologist and family doctor now that she is planning a pregnancy.'
        },
        best: true,
        explanation: {
          NG: 'The strongest choice. Knowing both genotypes is a simple blood test. A doctor or genetic counsellor can explain the chances for any children and the options available. It is a conversation about your future family, not a judgement on each other. Higher-dose folic acid is also often advised for people with sickle cell disease, so ask about it.',
          CA: 'The strongest choice. A pre-pregnancy plan lets the doctor check whether her medicine and dose are the best for pregnancy, make any change safely and in good time, and advise on a higher dose of folic acid, which is often recommended with some epilepsy medicines. The same applies to diabetes, high blood pressure and other long-term conditions: control before pregnancy lowers risks.'
        }
      },
      {
        label: { NG: 'Wait and find out after the baby is born.', CA: 'Stop her medication now, before trying, to be safe.' },
        explanation: {
          NG: 'Sickle cell disease can be found at birth, but by then there are fewer choices. Finding out before pregnancy, or before marriage, gives couples time to understand and plan.',
          CA: 'Stopping without medical advice risks seizures, which can be dangerous at any time. The safest medicine plan for pregnancy is made with her doctor, not alone.'
        }
      }
    ],
    takeaway: 'If you have a long-term condition or take regular medicine, tell your doctor before you try for a baby. Never stop a prescribed medicine on your own. Know your genotype, and your partner\'s.',
    resources: {
      NG: [WHO.sickle, WHO.diabetes, WHO.hypertension, NG.fmoh],
      CA: [CA.pregnancy, CA.diabetes, CA.pregnancyInfo],
      other: [WHO.diabetes, WHO.hypertension, WHO.epilepsy, WHO.sickle]
    }
  }),

  approved({
    id: 'infections-screening-and-vaccines',
    title: 'Infections, screening and vaccines',
    summary: 'Testing both partners, and the vaccines to check before pregnancy.',
    minutes: 4,
    story: {
      NG: [
        'Kunle and Bola are engaged and planning a wedding in Kano.',
        'Bola\'s pastor suggests that couples do a premarital health screening.',
        'Kunle feels insulted: "Are they saying I\'m not clean? I feel fine."',
        'Bola wonders if they should test only her, since she is the one who will be pregnant.',
        'Neither of them is sure which vaccines they had as children.'
      ],
      CA: [
        'Amira is 28 and moved to Montreal from abroad five years ago. She and her husband hope to start trying soon.',
        'She isn\'t sure whether she ever had the MMR (measles, mumps, rubella) vaccine as a child.',
        'Her vaccine records are back home, with her parents.',
        'Her husband says: "We\'re married and healthy. Why would we need tests for infections?"',
        'Amira wants to start trying this month.'
      ]
    },
    question: { NG: 'What should Kunle and Bola do?', CA: 'What should Amira do?' },
    options: [
      {
        label: { NG: 'Skip it. They feel fine.', CA: 'Start trying now and sort out vaccines later.' },
        explanation: {
          NG: 'Many infections, including HIV, hepatitis B, syphilis and chlamydia, can have no symptoms for years. Some can pass to a baby during pregnancy or birth. Feeling fine is not the same as being tested.',
          CA: 'Rubella infection during pregnancy can cause serious birth defects. The MMR vaccine cannot be given during pregnancy, and it is advised to wait 4 weeks after it before getting pregnant. Sorting it out first matters.'
        }
      },
      {
        label: { NG: 'Test only Bola, since she will carry the baby.', CA: 'Have only Amira tested.' },
        explanation: 'Infections pass between partners, so testing one partner only gives half the picture, and a treated partner can be re-infected by an untreated one. Screening works best done together.'
      },
      {
        label: {
          NG: 'Both get screened together, and check their vaccines.',
          CA: 'See a doctor to check her immunity (a blood test can show it), catch up on vaccines, and both get screened.'
        },
        best: true,
        explanation: {
          NG: 'The strongest choice. Screening (commonly for HIV, hepatitis B, syphilis and genotype in Nigeria) is a normal step for couples, not an accusation. Most infections can be treated or managed, and passing them to a baby can often be prevented. Ask about the hepatitis B vaccine and rubella immunity too.',
          CA: 'The strongest choice. If she is not immune, she can get the MMR vaccine and wait 4 weeks before trying. Both partners screening for common infections is a routine part of preparing for pregnancy. Most infections can be treated or managed, and passing them to a baby can often be prevented.'
        }
      }
    ],
    takeaway: 'Before pregnancy, both partners should be screened for common infections, and check vaccines (especially rubella and hepatitis B). Finding out early means there is time to act.',
    resources: {
      NG: [WHO.stis, WHO.hiv, WHO.hepB, NG.ncdc],
      CA: [CA.vaccines, CA.sexualHealth],
      other: [WHO.stis, WHO.rubella, WHO.hepB]
    }
  }),

  approved({
    id: 'mental-health-and-stress',
    title: 'Mental health and stress',
    summary: 'Stress, low mood and pressure before pregnancy, the signs to watch for, and where to get help.',
    minutes: 4,
    story: {
      NG: [
        'Kemi is 30 and a civil servant in Abuja. She and her husband have been married for two years.',
        'At every family gathering, her in-laws ask: "Any good news yet?"',
        'Kemi has started avoiding visits. She sleeps badly and cries in the car on her way to work.',
        'For the last month she has felt low most days and has lost interest in things she used to enjoy.',
        'She tells herself: "Other women manage. I just need to be stronger."'
      ],
      CA: [
        'Daniel is 34 and an engineer in Edmonton. Three months ago, his partner Maya had a miscarriage.',
        'Maya has been quiet and withdrawn since. She doesn\'t want to talk about trying again.',
        'Daniel is grieving too, but he feels he has to be the strong one.',
        'He is sleeping badly and snapping at colleagues.',
        'He doesn\'t know what to say to Maya, so he says nothing.'
      ]
    },
    question: { NG: 'What should Kemi do?', CA: 'What should Daniel do?' },
    options: [
      {
        label: { NG: 'Keep it to herself and push through.', CA: 'Stay strong, keep quiet and wait for things to pass.' },
        explanation: 'Many people try this, but feeling low most days for two weeks or more, losing interest in things, sleep changes and hopelessness can be signs of depression. It is common, it is not a weakness, and it usually gets better with support and treatment. Keeping it in tends to make it heavier.'
      },
      {
        label: {
          NG: 'Talk to someone she trusts and see a doctor or counsellor.',
          CA: 'Talk to Maya about how they both feel, and suggest they get support, together or separately.'
        },
        best: true,
        explanation: {
          NG: 'The strongest choice. Speaking to a doctor, nurse or counsellor is a sign of strength. Mental health matters for her own sake, and good support before pregnancy also helps during and after it. It can also help to agree with her husband how to respond to family pressure, as a team.',
          CA: 'The strongest choice. Grief after a pregnancy loss is real for both partners and can show up very differently in each. Saying "I\'m struggling too" can open the door. A family doctor, counsellor or pregnancy loss support group can help both of them, and there is no right time to try again until they are both ready.'
        }
      },
      {
        label: { NG: 'Try for a baby quickly so the pressure stops.', CA: 'Suggest trying again right away to move on.' },
        explanation: 'Pregnancy does not make stress or grief go away, and it can add to it. It is better to get support first and decide on timing together, when you both feel ready.'
      }
    ],
    takeaway: 'Your mind is part of your reproductive health. If you have felt low or anxious most days for two weeks or more, talk to someone and get support. If you are ever in danger or thinking of harming yourself, get help right away: in Nigeria call 112, in Canada call or text 988, or 911 in an emergency.',
    resources: {
      NG: [WHO.depression, WHO.mental, WHO.nigeria],
      CA: [CA.crisis, CA.mentalHelp],
      other: [WHO.depression, WHO.mental]
    }
  }),

  approved({
    id: 'family-planning-and-spacing',
    title: 'Family planning and spacing pregnancies',
    summary: 'Contraception choices, a healthy gap between pregnancies, and fertility after stopping contraception.',
    minutes: 4,
    story: {
      NG: [
        'Halima is 25 and lives in Kaduna. Her daughter was born six months ago.',
        'Her husband would like another baby soon. "Children should grow up close together," he says.',
        'Halima is still breastfeeding and feels tired. Her period has not come back yet.',
        'A neighbour tells her: "While you\'re breastfeeding, you can\'t get pregnant."',
        'Halima isn\'t sure she is ready for another pregnancy so soon.'
      ],
      CA: [
        'Leah is 32 and a nurse in Saskatoon. She has had a contraceptive implant in her arm for two years.',
        'She and her partner have decided they would like to try for a baby.',
        'Her sister says: "After hormonal birth control it can take a year for your fertility to come back."',
        'Leah has booked an appointment to have the implant removed next week.',
        'She is not sure when she can start trying, or what else to do first.'
      ]
    },
    question: { NG: 'What should Halima do?', CA: 'What should Leah do?' },
    options: [
      {
        label: {
          NG: 'Rely on breastfeeding to prevent pregnancy for now.',
          CA: 'Wait a year after removal before trying, as her sister said.'
        },
        explanation: {
          NG: 'Breastfeeding only reliably prevents pregnancy in narrow conditions: in the first 6 months, feeding only breast milk day and night, with periods not yet back. After 6 months it is not reliable, and you can become pregnant before your first period returns.',
          CA: 'For most methods, including the implant, fertility returns soon after stopping, often within weeks. Waiting a year is not needed. (One injectable method can take longer, which is worth knowing when choosing contraception.)'
        }
      },
      {
        label: {
          NG: 'Talk with her husband about spacing, and visit a clinic about family planning options.',
          CA: 'Have the implant removed, start folic acid, book a pre-pregnancy check-up, and start trying when ready.'
        },
        best: true,
        explanation: {
          NG: 'The strongest choice. WHO recommends waiting at least 2 years after a birth before trying to get pregnant again. A healthy gap gives the mother\'s body time to recover and lowers risks for the next baby. Many safe family planning methods can be used while breastfeeding. A clinic can help the couple choose together.',
          CA: 'The strongest choice. Fertility usually returns quickly after an implant is removed, so this is the time to get ready: daily folic acid, a check-up, and a review of vaccines and any medicines. They can start trying as soon as they feel ready.'
        }
      },
      {
        label: {
          NG: 'Try for another baby straight away, as her husband wants.',
          CA: 'Leave the implant in until she has finished all her other preparations.'
        },
        explanation: {
          NG: 'Pregnancies very close together carry higher risks for both mother and baby, including low birth weight and early birth. Spacing is a health decision, and the couple can make it together with a health worker\'s advice.',
          CA: 'Getting ready and stopping contraception can happen at the same time. Folic acid is best started at least 3 months before pregnancy, so starting it now keeps everything on track.'
        }
      }
    ],
    takeaway: 'Wait at least 2 years after a birth before the next pregnancy, and plan contraception together. Fertility usually returns soon after stopping most contraception, so get ready before you stop.',
    resources: {
      NG: [WHO.familyPlanning, NG.fmoh, WHO.nigeria],
      CA: [CA.sexAndU, CA.sexualHealth, CA.folic],
      other: [WHO.familyPlanning]
    }
  }),

  approved({
    id: 'your-preconception-check-up',
    title: 'Your preconception check-up',
    summary: 'What happens at a pre-pregnancy visit, what to bring, and the questions to ask.',
    minutes: 3,
    story: {
      NG: [
        'Amaka has been taking folic acid for two months. She finally books a visit at her local clinic in Lagos.',
        'Her husband Tunde says he is too busy at work to come along.',
        'Amaka isn\'t sure what the visit is for. "Do I just say I want a baby?"',
        'She worries she\'ll forget her questions once she is in the room.',
        'The appointment is on Saturday morning.'
      ],
      CA: [
        'Chris and Taylor live in Regina and want to start a family this year.',
        'They have a 10-minute appointment with their family doctor next week.',
        'Chris wonders whether there is any point going, since they both feel healthy.',
        'Taylor has questions about her medicines, her vaccines and her family history, but isn\'t sure which matter.',
        'They want to make the most of their 10 minutes.'
      ]
    },
    question: { NG: 'How should Amaka prepare?', CA: 'How should Chris and Taylor prepare?' },
    options: [
      {
        label: { NG: 'Go alone and see what the nurse says.', CA: 'Cancel. They feel healthy.' },
        explanation: {
          NG: 'Going is a good step, but without preparation it is easy to forget things, and Tunde\'s health matters too: his habits, infections and genotype all affect a pregnancy.',
          CA: 'Feeling healthy is great, but many things that matter before pregnancy (vaccines, blood pressure, infections, medicines) don\'t cause symptoms. A check-up catches them early, when they are easiest to deal with.'
        }
      },
      {
        label: 'Go together, with a written list of questions, medicines and family history.',
        best: true,
        explanation: {
          NG: 'The strongest choice. Bring a list of medicines and supplements, any vaccine records, the dates of recent periods, family health history, and your questions. At the visit, expect questions about your health and lifestyle, blood pressure and weight checks, and tests such as genotype, blood group, HIV, hepatitis B and syphilis. Good questions to ask: "Is my folic acid dose right?", "Are my vaccines up to date?", "Are any of my medicines a concern?"',
          CA: 'The strongest choice. Bring a list of medicines and supplements, vaccine records, the dates of recent periods, family health history, and your top 3 questions, so the short visit counts. Expect a review of health and lifestyle, blood pressure and weight, and possibly blood tests and screening. Good questions: "Is my folic acid dose right?", "Are my vaccines up to date?", "Are any of my medicines a concern?"'
        }
      },
      {
        label: 'Look everything up online instead of going.',
        explanation: 'Trusted websites are useful for learning (that\'s why we link to them), but they can\'t measure your blood pressure, run tests or review your medicines. Use them to prepare your questions, then go.'
      }
    ],
    takeaway: 'A preconception check-up is the best single step before trying for a baby. Go together, bring your list, and ask about folic acid, vaccines and medicines.',
    resources: {
      NG: [NG.fmoh, WHO.nigeria, WHO.maternal],
      CA: [CA.pregnancy, CA.pregnancyInfo],
      other: [WHO.maternal]
    },
    offerConsultation: true
  })
];

/** Lessons shown in a build: production shows approved lessons only. */
export function lessonsForBuild(includeDrafts: boolean, lessons: Lesson[] = LESSONS): Lesson[] {
  return includeDrafts ? lessons : lessons.filter(l => l.status === 'approved');
}

const texts = (t: Localised) => (typeof t === 'string' ? [t] : [t.NG, t.CA]);

/** Problems that would stop a lesson from being published. */
export function lessonProblems(lessons: Lesson[] = LESSONS): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const l of lessons) {
    const p = (m: string) => problems.push(`${l.id}: ${m}`);
    if (ids.has(l.id)) p('duplicate id');
    ids.add(l.id);
    if (!/^[a-z0-9-]{3,60}$/.test(l.id)) p('invalid id');
    if (!l.title.trim() || !l.summary.trim() || !l.takeaway.trim()) p('title, summary and takeaway are required');
    if (!(l.minutes >= 1 && l.minutes <= 10)) p('must take 1–10 minutes');
    for (const r of ['NG', 'CA'] as const) {
      if (l.story[r].length < 3 || l.story[r].length > 7) p(`${r} story needs 3–7 cards`);
      if (l.story[r].some(s => !s.trim())) p(`${r} story has an empty card`);
    }
    if (l.options.length < 2 || l.options.length > 4) p('needs 2–4 options');
    if (!l.options.some(o => o.best)) p('one option must be marked as the strongest');
    if ([l.question, ...l.options.flatMap(o => [o.label, o.explanation])].flatMap(texts).some(t => !t.trim())) p('empty question, option or explanation');
    for (const r of ['NG', 'CA', 'other'] as const) {
      if (!l.resources[r].length) p(`no ${r} resources`);
      if (l.resources[r].some(x => !/^https:\/\//.test(x.url) || !x.label.trim())) p(`${r} resource needs a label and an https link`);
    }
    if (l.status === 'approved' && (!l.reviewedBy || !l.reviewedOn)) p('approved without reviewer and date');
  }
  return problems;
}
